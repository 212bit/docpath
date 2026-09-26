/**
 * 多 Agent 并发 Worktree 协作与状态同步引擎 (Multi-Agent Worktree Collaboration & Matrix)
 *
 * 聚合所有 Git Worktree 的活跃 Agent 会话、任务状态、步骤进度、
 * Git 脏状态与合并就绪度，提供跨 Worktree 协同矩阵与事件广播机制。
 */

import { existsSync, readdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readCurrentState } from './workspace.js';
import {
  listWorktrees,
  isGitRepo,
  runGitCapture,
  samePath,
  worktreeNameFromPath,
  resolveWorktreeManagerRoot,
} from './worktree.js';
import { readFileSafe, resolveDocpathDir } from './file.js';
import { writeBreadcrumb, formatEntry } from './breadcrumb.js';
import { listActiveSessions } from './session.js';

export type WorktreeReadiness = 'idle' | 'in_progress' | 'ready_to_merge' | 'blocked' | 'merged' | 'drifted';

export interface WorktreeAgentEntry {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  sessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  phase: string;
  currentStep: string | null;
  dirtyFilesCount: number;
  mergedToMain: boolean;
  readiness: WorktreeReadiness;
  suggestedAction: string;
}

export interface WorktreeMatrixReport {
  repoRoot: string;
  totalWorktrees: number;
  activeAgentsCount: number;
  entries: WorktreeAgentEntry[];
}

/**
 * 收集所有并发 Worktree 与 Agent 会话的全局协作矩阵
 */
export async function collectWorktreeMatrix(cwd: string): Promise<WorktreeMatrixReport> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);
  const worktreesDir = join(repoRoot, '.worktrees');

  const entries: WorktreeAgentEntry[] = [];
  let activeAgentsCount = 0;

  for (const wt of worktrees) {
    const isMain = samePath(wt.path, repoRoot);
    const safeName = isMain ? 'main' : worktreeNameFromPath(worktreesDir, wt.path);
    const branch = wt.detached ? `detached@${wt.head.slice(0, 7)}` : (wt.branch || 'unknown');

    let state: any = null;
    let activeSessions: any[] = [];
    let currentStep: string | null = null;
    let taskTitle: string | null = null;

    try {
      state = await readCurrentState(wt.path);
      activeSessions = await listActiveSessions(wt.path);
    } catch {
      // 容错
    }

    // 读取当前任务标题与步骤
    if (state?.task_id) {
      try {
        const specPath = join(wt.path, '.docpath', 'tasks', 'current', 'spec.md');
        const specContent = (await readFileSafe(specPath)) || '';
        const titleMatch = specContent.match(/^#\s+(.+)$/m);
        taskTitle = titleMatch?.[1]?.replace(/^T-[^\s]+\s*-\s*/, '') || state.task_id;

        const planJsonPath = join(wt.path, '.docpath', 'tasks', 'current', 'plan.json');
        if (existsSync(planJsonPath)) {
          const planJson = (await readFileSafe(planJsonPath)) || '';
          const parsed = JSON.parse(planJson);
          if (Array.isArray(parsed.steps)) {
            const runningStep = parsed.steps.find((s: any) => s.status === 'in_progress' || s.status === 'executing');
            if (runningStep) {
              currentStep = runningStep.id;
            } else {
              const pendingStep = parsed.steps.find((s: any) => s.status === 'pending' || !s.status);
              currentStep = pendingStep ? pendingStep.id : 'all_done';
            }
          }
        }
      } catch {
        // 容错
      }
    }

    // 获取 Git 变更状态与分支合并状态
    let dirtyFilesCount = 0;
    let mergedToMain = false;
    try {
      const statusOut = await runGitCapture(wt.path, ['status', '--porcelain=v1', '--untracked-files=all']);
      const dirtyLines = statusOut.split('\n').map((l) => l.trim()).filter(Boolean);
      dirtyFilesCount = dirtyLines.length;

      if (!isMain && !wt.detached && wt.branch) {
        const mainBranch = 'main';
        const unmerged = await runGitCapture(repoRoot, ['cherry', mainBranch, wt.branch]).catch(() => '');
        mergedToMain = !unmerged.split('\n').some((l) => l.startsWith('+'));
      }
    } catch {
      // 容错
    }

    // 确定 Session Identity
    let sessionId = 'anonymous';
    if (process.env.DOCPATH_SESSION) {
      sessionId = process.env.DOCPATH_SESSION;
    } else if (activeSessions && activeSessions.length > 0) {
      sessionId = activeSessions[0].sessionId || activeSessions[0].session_id || 'active';
    } else if (isMain) {
      sessionId = 'main-orchestrator';
    }

    if (state?.phase && state.phase !== 'idle' && state.phase !== 'completed') {
      activeAgentsCount++;
    }

    // 评定就绪度 (Readiness)
    let readiness: WorktreeReadiness = 'idle';
    let suggestedAction = 'docpath next --agent';

    if (state?.phase === 'completed') {
      if (mergedToMain) {
        readiness = 'merged';
        suggestedAction = `已合入 main，可执行 docpath worktree remove ${safeName} 清理`;
      } else if (dirtyFilesCount > 0) {
        readiness = 'blocked';
        suggestedAction = `任务已完成但有未提交变更，请先 commit/stash 后执行 docpath worktree merge`;
      } else {
        readiness = 'ready_to_merge';
        suggestedAction = `任务已完成，可直接执行 docpath worktree merge 合入主干`;
      }
    } else if (state?.task_id) {
      readiness = 'in_progress';
      suggestedAction = `正在推进 (${state.phase || 'executing'})，步骤: ${currentStep || 'S1'}，完成后执行 docpath check`;
    } else if (isMain) {
      readiness = 'idle';
      suggestedAction = '主干就绪，可创建新 worktree 或直接在此开发';
    }

    entries.push({
      name: safeName,
      path: wt.path,
      branch,
      isMain,
      sessionId,
      taskId: state?.task_id || null,
      taskTitle: taskTitle || null,
      phase: state?.phase || 'idle',
      currentStep: currentStep || null,
      dirtyFilesCount,
      mergedToMain,
      readiness,
      suggestedAction,
    });
  }

  return {
    repoRoot,
    totalWorktrees: worktrees.length,
    activeAgentsCount,
    entries,
  };
}

/**
 * 跨所有活跃 Worktree 广播消息与同步事件
 */
export async function broadcastWorktreeMessage(
  cwd: string,
  message: string,
  sender = 'agent-broadcast',
): Promise<Array<{ worktree: string; written: boolean }>> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const matrix = await collectWorktreeMatrix(cwd);

  const results: Array<{ worktree: string; written: boolean }> = [];
  const nowStr = new Date().toISOString();

  for (const entry of matrix.entries) {
    const workspaceDir = join(entry.path, '.docpath', 'workspace');
    if (existsSync(workspaceDir)) {
      const breadcrumbPath = join(workspaceDir, 'breadcrumb.jsonl');
      const eventRecord = JSON.stringify({
        timestamp: nowStr,
        event: 'agent.broadcast',
        sender,
        message,
        source_worktree: worktreeNameFromPath(join(repoRoot, '.worktrees'), cwd),
      });

      try {
        await appendFile(breadcrumbPath, `${eventRecord}\n`, 'utf-8');
        results.push({ worktree: entry.name, written: true });
      } catch {
        results.push({ worktree: entry.name, written: false });
      }
    }
  }

  return results;
}

/**
 * 将多 Agent 协作矩阵渲染为可视化终端表格
 */
export function renderWorktreeMatrixTable(report: WorktreeMatrixReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`🌐  DocPath 多 Agent 并发 Worktree 协作矩阵 (Multi-Agent Matrix)`);
  lines.push(`    Worktree 实例: ${report.totalWorktrees} 个 | 活跃开发 Agent: ${report.activeAgentsCount} 个 | 根仓库: ${report.repoRoot}`);
  lines.push('');

  lines.push('─'.repeat(78));
  lines.push(' Worktree        分支 (Branch)      Agent会话     任务/步骤         状态/就绪度');
  lines.push(' ────────────────────────────────────────────────────────────────────────────');

  for (const e of report.entries) {
    const icon =
      e.readiness === 'ready_to_merge'
        ? '🚀'
        : e.readiness === 'in_progress'
        ? '⚡'
        : e.readiness === 'merged'
        ? '✅'
        : e.readiness === 'blocked'
        ? '⚠️'
        : '💤';

    const wtName = (e.isMain ? `${e.name} (main)` : e.name).padEnd(16);
    const branchStr = e.branch.length > 18 ? `${e.branch.slice(0, 15)}...` : e.branch.padEnd(18);
    const sessionStr = e.sessionId.padEnd(13);
    const taskInfo = e.taskId ? `${e.taskId.slice(0, 10)}:${e.currentStep || 'S1'}`.padEnd(17) : 'idle'.padEnd(17);
    const badge = `${icon} ${e.readiness}`.padEnd(14);

    lines.push(` ${wtName} ${branchStr} ${sessionStr} ${taskInfo} ${badge}`);
    if (e.taskTitle) {
      lines.push(`   └ 🎯 任务目标: ${e.taskTitle}`);
    }
    lines.push(`   └ 👉 建议操作: ${e.suggestedAction}`);
    lines.push('');
  }

  lines.push('─'.repeat(78));
  lines.push('💡 常用协同指令:');
  lines.push('   • 创建隔离新树: `docpath worktree create <name> --backlog <R-xxx>`');
  lines.push('   • 同步主干基线: `docpath worktree sync`');
  lines.push('   • 跨 Agent 广播: `docpath worktree broadcast "<message>"`');
  lines.push('   • 任务收尾合并: `docpath worktree merge`\n');

  return lines.join('\n');
}
