/**
 * 任务热暂存与上下文恢复 (Task Stash & Switch)
 *
 * 支持单工作区开发中被紧急任务临时打断时，一键暂存当前任务状态、规范文档与
 * Git 工作区修改，并在打断任务处理完成后无缝恢复。
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeBreadcrumb } from './breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';
import { mutateCurrentState, readCurrentState, syncCurrentDocument, type CurrentState } from '../utils/workspace.js';
import {
  canonicalTaskDir,
  clearCurrentTaskAlias,
  currentTaskDir,
  syncActiveTaskFiles,
} from '../utils/task-files.js';
import { detectDirtyWorktree } from '../utils/git-dirty-guard.js';
import { gitSync, gitSyncOptional } from '../utils/git-run.js';

export interface TaskStashMetadata {
  id: string;
  taskId: string;
  taskTitle: string;
  createdAt: string;
  message?: string;
  phase: string;
  gate: string;
  currentStep: string;
  workflowProfile?: string;
  level?: number;
  gitStashed?: boolean;
  gitStashMessage?: string;
}

export interface TaskStashResult {
  stash: TaskStashMetadata;
  stashPath: string;
  gitStashed: boolean;
}

export interface TaskPopResult {
  stash: TaskStashMetadata;
  gitPopped: boolean;
  gitWarning?: string;
}

export interface TaskSwitchResult {
  stashedPrevious?: TaskStashMetadata;
  activatedTask: {
    taskId: string;
    taskTitle: string;
    source: 'stash' | 'canonical' | 'backlog';
  };
  gitPopped?: boolean;
  gitWarning?: string;
}

export function taskStashesDir(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'stashes');
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeIdleState(cwd: string, previous: CurrentState, currentStep: string): Promise<void> {
  const ts = nowIso();
  await mutateCurrentState(cwd, (latest) => ({
    ...(latest ?? previous),
    state: 'idle',
    phase: 'idle',
    gate: 'none',
    workflow_profile: 'standard',
    task_id: '',
    task_title: '',
    current_step: currentStep,
    started_at: ts,
    updated_at: ts,
  }));
}

/** 列出所有暂存的任务，按创建时间降序排列 */
export async function listTaskStashes(cwd: string): Promise<TaskStashMetadata[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const stashesRoot = taskStashesDir(docpathDir);
  if (!existsSync(stashesRoot)) return [];

  const entries = await readdir(stashesRoot, { withFileTypes: true });
  const stashes: TaskStashMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(stashesRoot, entry.name, 'meta.json');
    if (!existsSync(metaPath)) continue;

    try {
      const content = await readFile(metaPath, 'utf-8');
      const meta = JSON.parse(content) as TaskStashMetadata;
      stashes.push(meta);
    } catch {
      // 忽略损坏的 meta 文件
    }
  }

  return stashes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function findMatchingStash(stashes: TaskStashMetadata[], query?: string): TaskStashMetadata | null {
  if (stashes.length === 0) return null;
  if (!query || query.trim() === '') return stashes[0];

  const q = query.trim().toLowerCase();

  // 1. 精确匹配 stash ID
  const exactId = stashes.find((s) => s.id.toLowerCase() === q);
  if (exactId) return exactId;

  // 2. 精确匹配 Task ID
  const exactTaskId = stashes.find((s) => s.taskId.toLowerCase() === q);
  if (exactTaskId) return exactTaskId;

  // 3. 序号匹配 (例如 "1" 表示最新一条, "2" 表示第二条)
  if (/^\d+$/.test(q)) {
    const idx = parseInt(q, 10) - 1;
    if (idx >= 0 && idx < stashes.length) {
      return stashes[idx];
    }
  }

  // 4. 前缀或模糊匹配
  const partial = stashes.find((s) => s.id.toLowerCase().includes(q) || s.taskId.toLowerCase().includes(q));
  return partial ?? null;
}

import { assertTaskNotLeasedByOtherLiveSession } from '../utils/session.js';

/**
 * 暂存当前活跃任务
 */
export async function stashTask(
  cwd: string,
  options: { message?: string; withGit?: boolean; force?: boolean } = {},
): Promise<TaskStashResult> {
  const current = await readCurrentState(cwd);
  if (!current?.task_id || current.phase === 'idle' || current.phase === 'completed') {
    throw new Error(`docpath task stash: 当前没有可暂存的活跃任务（当前 phase=${current?.phase || 'idle'}）`);
  }

  // 1. 活体租约互斥校验：防止跨会话并发强行挂起另一个正在活跃执行的 Agent 任务
  await assertTaskNotLeasedByOtherLiveSession(cwd, current.task_id, {
    command: 'docpath task stash',
    force: options.force,
  });

  const docpathDir = await resolveDocpathDir(cwd);
  const taskId = current.task_id;
  const stashId = `stash-${Date.now()}-${taskId}`;
  const targetDir = join(taskStashesDir(docpathDir), stashId);

  // 2. Git stash (若工作区存在改动且未显式禁用 git，先于创建 stash 目录执行以防 stash -u 扫入暂存目录)
  let gitStashed = false;
  let gitStashMessage: string | undefined;
  if (options.withGit !== false) {
    const dirtyReport = detectDirtyWorktree(cwd);
    if (dirtyReport.isGitRepo && dirtyReport.dirty) {
      gitStashMessage = `docpath-stash:${taskId}:${Date.now()}`;
      try {
        gitSync(cwd, ['stash', 'push', '-u', '-m', gitStashMessage]);
        gitStashed = true;
      } catch (err: any) {
        console.warn(`⚠️  Git stash push 失败: ${err?.message || err}，跳过 Git 改动暂存`);
      }
    }
  }

  // 3. 创建 stash 目标目录
  await mkdir(targetDir, { recursive: true });

  // 4. 备份 canonical 任务目录到 stash/task
  const canonicalDir = canonicalTaskDir(docpathDir, taskId);
  if (existsSync(canonicalDir)) {
    await cp(canonicalDir, join(targetDir, 'task'), { recursive: true });
  }

  // 5. 备份 state.json
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (existsSync(statePath)) {
    await cp(statePath, join(targetDir, 'state.json'));
  }

  // 6. 保存 meta.json
  const meta: TaskStashMetadata = {
    id: stashId,
    taskId,
    taskTitle: current.task_title || '',
    createdAt: nowIso(),
    message: options.message?.trim() || undefined,
    phase: current.phase,
    gate: current.gate,
    currentStep: current.current_step,
    workflowProfile: current.workflow_profile,
    level: current.level,
    gitStashed,
    gitStashMessage,
  };
  await writeFile(join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  // 6. 记录 breadcrumb
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'task.stash',
    status: 'done',
    context: `任务已暂存: ${stashId}${meta.message ? ` (${meta.message})` : ''}`,
  });

  // 7. 清理 current 别名并重置 workspace 为 idle
  await clearCurrentTaskAlias(docpathDir);
  await writeIdleState(cwd, current, `任务已暂存: ${taskId}`);

  return {
    stash: meta,
    stashPath: targetDir,
    gitStashed,
  };
}

/**
 * 恢复暂存的任务
 */
export async function popTaskStash(
  cwd: string,
  query?: string,
  options: { withGit?: boolean } = {},
): Promise<TaskPopResult> {
  const current = await readCurrentState(cwd);
  if (current?.task_id && current.phase !== 'idle' && current.phase !== 'completed') {
    throw new Error(
      `docpath task pop: 当前已有活跃任务 ${current.task_id} (phase=${current.phase})。\n` +
      '请先运行 `docpath task stash` 暂存当前任务，或使用 `docpath task switch <target_id>` 进行平滑切换。',
    );
  }

  const docpathDir = await resolveDocpathDir(cwd);
  const stashes = await listTaskStashes(cwd);
  if (stashes.length === 0) {
    throw new Error('docpath task pop: 暂存区为空，没有可恢复的任务。');
  }

  const targetStash = findMatchingStash(stashes, query);
  if (!targetStash) {
    const list = stashes.map((s, idx) => `  [${idx + 1}] ${s.id} (${s.taskId}: ${s.taskTitle})`).join('\n');
    throw new Error(`docpath task pop: 未找到匹配 "${query}" 的暂存记录。\n现有暂存记录:\n${list}`);
  }

  const stashDir = join(taskStashesDir(docpathDir), targetStash.id);

  // 1. 恢复 canonical 任务目录
  const sourceTaskDir = join(stashDir, 'task');
  const targetCanonicalDir = canonicalTaskDir(docpathDir, targetStash.taskId);
  if (existsSync(sourceTaskDir)) {
    await mkdir(targetCanonicalDir, { recursive: true });
    await cp(sourceTaskDir, targetCanonicalDir, { recursive: true });
  }

  // 2. 同步到 current 视图
  const candidates: ('spec.md' | 'plan.md')[] = ['spec.md', 'plan.md'];
  const existing = candidates.filter((f) => existsSync(join(targetCanonicalDir, f)));
  if (existing.length > 0) {
    await syncActiveTaskFiles(docpathDir, targetStash.taskId, 'canonical', existing);
  }
  await syncCurrentDocument(cwd);

  // 3. 恢复 state.json
  const sourceStatePath = join(stashDir, 'state.json');
  if (existsSync(sourceStatePath)) {
    try {
      const stateData = JSON.parse(await readFile(sourceStatePath, 'utf-8'));
      await mutateCurrentState(cwd, () => ({
        ...stateData,
        updated_at: nowIso(),
      }));
    } catch {
      // 容错: 若 state.json 损坏则按 metadata 重建
      await mutateCurrentState(cwd, (prev) => ({
        level: targetStash.level || prev?.level || 2,
        workflow_profile: (targetStash.workflowProfile as any) || prev?.workflow_profile || 'standard',
        state: 'executing',
        task_id: targetStash.taskId,
        task_title: targetStash.taskTitle,
        phase: targetStash.phase as any,
        gate: targetStash.gate as any,
        current_step: targetStash.currentStep,
        started_at: prev?.started_at || nowIso(),
        updated_at: nowIso(),
      }));
    }
  }

  // 4. Git stash pop
  let gitPopped = false;
  let gitWarning: string | undefined;
  if (targetStash.gitStashed && targetStash.gitStashMessage && options.withGit !== false) {
    const stashList = gitSyncOptional(cwd, ['stash', 'list']);
    if (stashList) {
      const lines = stashList.split('\n').filter(Boolean);
      const idx = lines.findIndex((l) => l.includes(targetStash.gitStashMessage!));
      if (idx >= 0) {
        const stashRef = `stash@{${idx}}`;
        try {
          gitSync(cwd, ['stash', 'pop', stashRef]);
          gitPopped = true;
        } catch (err: any) {
          gitWarning = `⚠️  Git stash 改动恢复遇到冲突: ${err?.message || err}。改动已保存在 ${stashRef}，请手动处理冲突。`;
        }
      }
    }
  }

  // 5. 记录 breadcrumb
  await writeBreadcrumb(cwd, {
    taskId: targetStash.taskId,
    step: 'task.pop',
    status: 'done',
    context: `任务已从暂存区恢复: ${targetStash.taskId} (${targetStash.id})`,
  });

  // 6. 删除已恢复的 stash 目录
  await rm(stashDir, { recursive: true, force: true });

  return {
    stash: targetStash,
    gitPopped,
    gitWarning,
  };
}

/**
 * 丢弃/清理暂存记录
 */
export async function dropTaskStash(
  cwd: string,
  query?: string,
  options: { all?: boolean } = {},
): Promise<string[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const stashes = await listTaskStashes(cwd);
  if (stashes.length === 0) {
    throw new Error('docpath task drop: 暂存区为空，没有可丢弃的记录。');
  }

  if (options.all) {
    const droppedIds = stashes.map((s) => s.id);
    for (const s of stashes) {
      const sDir = join(taskStashesDir(docpathDir), s.id);
      await rm(sDir, { recursive: true, force: true });
    }
    return droppedIds;
  }

  const targetStash = findMatchingStash(stashes, query);
  if (!targetStash) {
    const list = stashes.map((s, idx) => `  [${idx + 1}] ${s.id} (${s.taskId})`).join('\n');
    throw new Error(`docpath task drop: 未找到匹配 "${query}" 的暂存记录。\n现有记录:\n${list}`);
  }

  const sDir = join(taskStashesDir(docpathDir), targetStash.id);
  await rm(sDir, { recursive: true, force: true });
  return [targetStash.id];
}
