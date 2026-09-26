/**
 * Worktree 并发前置冲突预警与跨树协同体检引擎 (Worktree Pre-flight Conflict Detection)
 *
 * 在多 Agent / 多 Worktree 并发开发时，前置检测：
 * 1. 跨 Worktree 文件修改重叠 (File Overlap Conflicts)
 * 2. 需求依赖时序倒置/未合并依赖预警 (Backlog In-Flight Dependency Warnings)
 * 3. 跨 Worktree 同需求/同任务重复认领冲突 (Active Task Collisions)
 * 4. 主干基线落后且存在潜在冲突漂移 (Base Branch Drift)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  listWorktrees,
  runGitCapture,
  samePath,
  worktreeNameFromPath,
  resolveWorktreeManagerRoot,
} from '../utils/worktree.js';
import { readCurrentState } from '../utils/workspace.js';
import { readFileSafe } from '../utils/file.js';
import { listBacklogItems, readBacklogItem, type BacklogItem } from './backlog.js';

export interface FileOverlapConflict {
  file: string;
  worktrees: string[];
  branches: string[];
  statuses: Array<'uncommitted' | 'committed'>;
  risk: 'high' | 'medium';
  message: string;
}

export interface BacklogDependencyConflict {
  backlogId: string;
  dependencyId: string;
  worktree: string;
  depWorktree: string;
  depStatus: string;
  depPhase: string;
  message: string;
}

export interface ActiveTaskCollision {
  backlogId: string;
  worktrees: string[];
  message: string;
}

export interface BaseBranchDrift {
  worktree: string;
  branch: string;
  behindCount: number;
  overlappingFilesWithMain: string[];
  message: string;
}

export interface WorktreeConflictReport {
  repoRoot: string;
  totalWorktrees: number;
  activeWorktrees: string[];
  fileOverlaps: FileOverlapConflict[];
  dependencyConflicts: BacklogDependencyConflict[];
  taskCollisions: ActiveTaskCollision[];
  baseDrifts: BaseBranchDrift[];
  hasBlockingConflicts: boolean;
  passed: boolean;
}

/**
 * 判断文件是否属于 Worktree 隔离运行态（不应计入跨树代码冲突）
 */
function isRuntimeOrIgnoredFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
  return (
    normalized.startsWith('.docpath/workspace') ||
    normalized.startsWith('.docpath/tasks') ||
    normalized.startsWith('.docpath/journal') ||
    normalized.startsWith('.docpath/backlog') ||
    normalized.startsWith('.docpath/rules') ||
    normalized.startsWith('.git') ||
    normalized.startsWith('.worktrees') ||
    normalized.endsWith('.tmp') ||
    normalized === '.docpath/docs-index.json' ||
    normalized === '.docpath/docs.md' ||
    normalized === '.docpath/config.yaml' ||
    normalized === '.docpath'
  );
}

interface WorktreeAnalysisNode {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  taskId: string | null;
  backlogId: string | null;
  taskTitle: string | null;
  phase: string;
  changedFiles: Map<string, 'uncommitted' | 'committed'>;
  dependencies: string[];
}

/**
 * 提取指定 worktree 的所有修改文件集合（包含未提交与未合入 commit）
 */
async function getWorktreeChangedFiles(
  wtPath: string,
  repoRoot: string,
  isMain: boolean,
  branch: string,
): Promise<Map<string, 'uncommitted' | 'committed'>> {
  const map = new Map<string, 'uncommitted' | 'committed'>();

  // 1. 获取工作区未提交文件 (staged + unstaged + untracked)
  try {
    const statusOut = await runGitCapture(wtPath, ['status', '--porcelain=v1']);
    const lines = statusOut.split('\n');
    for (const line of lines) {
      if (!line || line.length < 4) continue;
      const rawFile = line.slice(3).trim();
      const cleanFile = rawFile.includes(' -> ') ? rawFile.split(' -> ')[1] : rawFile;
      if (cleanFile && !isRuntimeOrIgnoredFile(cleanFile)) {
        map.set(cleanFile, 'uncommitted');
      }
    }
  } catch {
    // 容错
  }

  // 2. 如果是非 main 分支，获取相对于 main 的已提交改动文件
  if (!isMain && branch && !branch.startsWith('detached@')) {
    try {
      const diffOut = await runGitCapture(wtPath, ['diff', '--name-only', 'main...HEAD']).catch(() => '');
      const files = diffOut.split('\n').map((f) => f.trim()).filter(Boolean);
      for (const f of files) {
        if (!isRuntimeOrIgnoredFile(f) && !map.has(f)) {
          map.set(f, 'committed');
        }
      }
    } catch {
      // 容错
    }
  }

  return map;
}

/**
 * 全面检测所有并发 Git Worktree 之间的潜在冲突与依赖风险
 */
export async function detectWorktreeConflicts(
  cwd: string,
  options: { targetWorktree?: string } = {},
): Promise<WorktreeConflictReport> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);
  const worktreesDir = join(repoRoot, '.worktrees');

  const nodes: WorktreeAnalysisNode[] = [];

  for (const wt of worktrees) {
    const isMain = samePath(wt.path, repoRoot);
    const safeName = isMain ? 'main' : worktreeNameFromPath(worktreesDir, wt.path);
    const branch = wt.detached ? `detached@${wt.head.slice(0, 7)}` : (wt.branch || 'unknown');

    let state: any = null;
    let taskTitle: string | null = null;
    let backlogId: string | null = null;
    const dependencies: string[] = [];

    try {
      state = await readCurrentState(wt.path);
      if (state?.backlog_id) {
        backlogId = state.backlog_id;
      }
      const specJsonPath = join(wt.path, '.docpath', 'tasks', 'current', 'spec.json');
      if (existsSync(specJsonPath)) {
        const specRaw = await readFileSafe(specJsonPath);
        if (specRaw) {
          const parsed = JSON.parse(specRaw);
          if (!backlogId) {
            backlogId = parsed.backlog_id || parsed.id || null;
          }
          if (Array.isArray(parsed.dependencies)) {
            dependencies.push(...parsed.dependencies);
          }
        }
      }
    } catch {
      // 容错
    }

    if (backlogId) {
      try {
        const item = await readBacklogItem(wt.path, backlogId);
        if (item?.links?.depends_on) {
          dependencies.push(...item.links.depends_on);
        }
      } catch {
        // 容错
      }
    }

    const changedFiles = await getWorktreeChangedFiles(wt.path, repoRoot, isMain, branch);

    nodes.push({
      name: safeName,
      path: wt.path,
      branch,
      isMain,
      taskId: state?.task_id || null,
      backlogId,
      taskTitle,
      phase: state?.phase || 'idle',
      changedFiles,
      dependencies: Array.from(new Set(dependencies)),
    });
  }

  const fileOverlaps: FileOverlapConflict[] = [];
  const dependencyConflicts: BacklogDependencyConflict[] = [];
  const taskCollisions: ActiveTaskCollision[] = [];
  const baseDrifts: BaseBranchDrift[] = [];

  // 1. 跨 Worktree 文件修改重叠检测 (File Overlap Detection)
  const fileToWorktrees = new Map<string, Array<{ name: string; branch: string; status: 'uncommitted' | 'committed' }>>();

  for (const node of nodes) {
    if (node.changedFiles.size === 0) continue;
    for (const [file, status] of node.changedFiles.entries()) {
      if (!fileToWorktrees.has(file)) {
        fileToWorktrees.set(file, []);
      }
      fileToWorktrees.get(file)!.push({
        name: node.name,
        branch: node.branch,
        status,
      });
    }
  }

  for (const [file, holders] of fileToWorktrees.entries()) {
    if (holders.length > 1) {
      const wtNames = holders.map((h) => h.name);
      // 如果指定了 targetWorktree，只看与该 worktree 相关的冲突
      if (options.targetWorktree && !wtNames.includes(options.targetWorktree)) {
        continue;
      }
      const branches = holders.map((h) => h.branch);
      const statuses = holders.map((h) => h.status);
      const isHighRisk = file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.yaml');

      fileOverlaps.push({
        file,
        worktrees: wtNames,
        branches,
        statuses,
        risk: isHighRisk ? 'high' : 'medium',
        message: `文件 ${file} 在 ${wtNames.join(' 与 ')} 中被同时修改`,
      });
    }
  }

  // 2. 跨 Worktree 同需求/同任务认领冲突 (Task Collision Detection)
  const backlogToWorktrees = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.backlogId && node.phase !== 'idle' && node.phase !== 'completed') {
      if (!backlogToWorktrees.has(node.backlogId)) {
        backlogToWorktrees.set(node.backlogId, []);
      }
      backlogToWorktrees.get(node.backlogId)!.push(node.name);
    }
  }

  for (const [bId, wts] of backlogToWorktrees.entries()) {
    if (wts.length > 1) {
      taskCollisions.push({
        backlogId: bId,
        worktrees: wts,
        message: `需求 ${bId} 同时在多个活跃 Worktree (${wts.join(', ')}) 中处于开发状态`,
      });
    }
  }

  // 3. 需求依赖时序预警 (Dependency in-flight conflict)
  for (const node of nodes) {
    if (node.dependencies.length === 0 || node.phase === 'completed' || node.phase === 'idle') continue;
    for (const depId of node.dependencies) {
      // 查找该依赖是否在其他 worktree 中进行
      for (const other of nodes) {
        if (other.name === node.name) continue;
        if (other.backlogId === depId && other.phase !== 'completed') {
          dependencyConflicts.push({
            backlogId: node.backlogId || node.taskId || node.name,
            dependencyId: depId,
            worktree: node.name,
            depWorktree: other.name,
            depStatus: other.phase,
            depPhase: other.phase,
            message: `Worktree [${node.name}] 依赖需求 ${depId}，该需求正在 [${other.name}] 中开发 (阶段: ${other.phase})，尚未合入主干`,
          });
        }
      }
    }
  }

  // 4. 主干基线漂移检测 (Base Branch Drift)
  for (const node of nodes) {
    if (node.isMain || node.branch.startsWith('detached@')) continue;
    try {
      const behindCountOut = await runGitCapture(node.path, ['rev-list', '--count', 'HEAD..main']).catch(() => '0');
      const behindCount = parseInt(behindCountOut.trim(), 10) || 0;
      if (behindCount > 0 && node.changedFiles.size > 0) {
        const mainDiffOut = await runGitCapture(node.path, ['diff', '--name-only', 'HEAD...main']).catch(() => '');
        const mainFiles = new Set(mainDiffOut.split('\n').map((f) => f.trim()).filter(Boolean));
        const overlapping: string[] = [];
        for (const file of node.changedFiles.keys()) {
          if (mainFiles.has(file)) {
            overlapping.push(file);
          }
        }
        if (overlapping.length > 0) {
          baseDrifts.push({
            worktree: node.name,
            branch: node.branch,
            behindCount,
            overlappingFilesWithMain: overlapping,
            message: `Worktree [${node.name}] 落后主干 ${behindCount} 个提交，且主干已修改了当前树正在变更的文件 (${overlapping.slice(0, 3).join(', ')}${overlapping.length > 3 ? ' 等' : ''})`,
          });
        }
      }
    } catch {
      // 容错
    }
  }

  const hasBlockingConflicts = taskCollisions.length > 0 || fileOverlaps.some((f) => f.risk === 'high');
  const passed = fileOverlaps.length === 0 && dependencyConflicts.length === 0 && taskCollisions.length === 0 && baseDrifts.length === 0;

  return {
    repoRoot,
    totalWorktrees: worktrees.length,
    activeWorktrees: nodes.filter((n) => n.phase !== 'idle').map((n) => n.name),
    fileOverlaps,
    dependencyConflicts,
    taskCollisions,
    baseDrifts,
    hasBlockingConflicts,
    passed,
  };
}

/**
 * 渲染冲突与风险体检报告
 */
export function renderWorktreeConflictReport(report: WorktreeConflictReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`🔍  DocPath Worktree 并发前置冲突体检报告 (Pre-flight Conflict Check)`);
  lines.push(`    检查范围: ${report.totalWorktrees} 个 Worktree | 活跃开发: ${report.activeWorktrees.length} 个`);
  lines.push('');

  if (report.passed) {
    lines.push('✅  未发现跨 Worktree 文件修改冲突与依赖风险，所有工作区协同状态良好！\n');
    return lines.join('\n');
  }

  // 1. 同需求重复认领
  if (report.taskCollisions.length > 0) {
    lines.push(`❌  【严重冲突】发现 ${report.taskCollisions.length} 起跨 Worktree 需求重复认领:`);
    for (const c of report.taskCollisions) {
      lines.push(`   • ${c.message}`);
      lines.push(`     👉 建议: 保留其中一个 Worktree 执行，另一处通过 docpath task abort 清理`);
    }
    lines.push('');
  }

  // 2. 文件重叠修改
  if (report.fileOverlaps.length > 0) {
    lines.push(`⚠️  【文件重叠】发现 ${report.fileOverlaps.length} 处跨 Worktree 文件同时修改 (潜在合并冲突):`);
    for (const f of report.fileOverlaps) {
      const badge = f.risk === 'high' ? '🔴 [高风险代码]' : '🟡 [文档/配置]';
      lines.push(`   • ${badge} ${f.file}`);
      lines.push(`     涉及工作区: ${f.worktrees.join(' vs ')}`);
      lines.push(`     👉 建议: 提前与协作者对齐该文件接口契约，或按顺序先后合入主干`);
    }
    lines.push('');
  }

  // 3. 依赖在途时序预警
  if (report.dependencyConflicts.length > 0) {
    lines.push(`⏳  【依赖在途】发现 ${report.dependencyConflicts.length} 处前置依赖正在其他工作区开发:`);
    for (const d of report.dependencyConflicts) {
      lines.push(`   • ${d.message}`);
      lines.push(`     👉 建议: 等待 [${d.depWorktree}] 完成合入主干后，运行 docpath worktree sync 再启动本任务`);
    }
    lines.push('');
  }

  // 4. 基线漂移且重叠
  if (report.baseDrifts.length > 0) {
    lines.push(`🔄  【基线漂移】发现 ${report.baseDrifts.length} 处落后主干且存在文件重叠:`);
    for (const b of report.baseDrifts) {
      lines.push(`   • ${b.message}`);
      lines.push(`     👉 建议: 切换到该 worktree 执行 \`docpath worktree sync\` 平滑变基同步最新主干`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
