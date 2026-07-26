/**
 * docpath task — 当前任务生命周期管理。
 */

import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { listBacklogItems, setBacklogStatus } from '../engine/backlog.js';
import { resolveDocpathDir } from '../utils/file.js';
import { mutateCurrentState, readCurrentState, type CurrentState } from '../utils/workspace.js';
import {
  archivedTaskDir,
  canonicalTaskDir,
  clearCurrentTaskAlias,
} from '../utils/task-files.js';

interface TaskCommandOptions {
  cwd: string;
  action?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertActiveTask(current: CurrentState | null, action: string): CurrentState {
  if (!current?.task_id || current.phase === 'idle' || current.phase === 'completed') {
    throw new Error(`docpath task ${action}: 当前没有可${action === 'abort' ? '废弃' : '重置'}的活跃任务`);
  }
  return current;
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

async function archiveCanonicalTask(docpathDir: string, taskId: string): Promise<string | null> {
  const source = canonicalTaskDir(docpathDir, taskId);
  const target = archivedTaskDir(docpathDir, taskId);
  if (!existsSync(source)) return null;

  await mkdir(join(docpathDir, 'tasks', 'done'), { recursive: true });
  if (existsSync(target)) return target;

  await rename(source, target);
  return target;
}

async function dropLinkedBacklog(cwd: string, taskId: string): Promise<string | null> {
  const linked = (await listBacklogItems(cwd)).find((item) => item.links.task === taskId);
  if (!linked || linked.status === 'dropped') return linked?.id ?? null;
  if (linked.status !== 'active') return null;

  await setBacklogStatus(cwd, linked.id, 'dropped');
  return linked.id;
}

async function taskAbort(options: TaskCommandOptions): Promise<void> {
  const current = assertActiveTask(await readCurrentState(options.cwd), 'abort');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const taskId = current.task_id;

  const droppedBacklogId = await dropLinkedBacklog(options.cwd, taskId);
  await writeBreadcrumb(options.cwd, {
    taskId,
    step: 'task.abort',
    status: 'done',
    context: `任务已废弃并回到 idle${droppedBacklogId ? `，backlog ${droppedBacklogId} -> dropped` : ''}`,
  });

  const archivedPath = await archiveCanonicalTask(docpathDir, taskId);
  await clearCurrentTaskAlias(docpathDir);
  await writeIdleState(options.cwd, current, `任务已废弃: ${taskId}`);

  console.log(`✅  当前任务已废弃: ${taskId}`);
  if (archivedPath) {
    console.log(`📦  任务已归档: ${archivedPath}`);
  } else {
    console.log('⚠️  canonical 任务目录不存在，仅清理 current 视图和状态');
  }
  if (droppedBacklogId) {
    console.log(`🔁  backlog 已回填为 dropped: ${droppedBacklogId}`);
  }
  console.log('📌  工作流已回到 idle');
}

async function taskReset(options: TaskCommandOptions): Promise<void> {
  const current = assertActiveTask(await readCurrentState(options.cwd), 'reset');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const taskId = current.task_id;

  await writeBreadcrumb(options.cwd, {
    taskId,
    step: 'task.reset',
    status: 'done',
    context: '任务上下文已清空并回到 idle',
  });

  await clearCurrentTaskAlias(docpathDir);
  await writeIdleState(options.cwd, current, `任务上下文已重置: ${taskId}`);

  console.log(`✅  当前任务上下文已重置: ${taskId}`);
  console.log('📌  工作流已回到 idle');
}

/**
 * R-298: completed 任务的唯一合法重入路径。门禁事件（check/review）已禁入
 * completed，重开必须显式声明意图并记录 breadcrumb，之后重走完整闭环。
 */
async function taskReopen(options: TaskCommandOptions): Promise<void> {
  const current = await readCurrentState(options.cwd);
  if (!current?.task_id || current.phase !== 'completed') {
    throw new Error(
      `docpath task reopen: 仅 completed 任务可重开（当前 phase=${current?.phase || 'idle'}）。` +
      '活跃任务请直接继续；无任务请走 backlog promote / quick。',
    );
  }
  const next = await transitionWorkflow(options.cwd, 'task.reopened', {
    currentStep: `任务已重开: ${current.task_id}`,
  });
  await writeBreadcrumb(options.cwd, {
    taskId: current.task_id,
    step: 'task.reopened',
    status: 'done',
    context: '完成态任务经显式 reopen 回到 executing（R-298）',
  });
  console.log(`✅  已重开任务: ${current.task_id}（phase: ${next.phase}）`);
  console.log('📌  修复完成后请重新走 check → review → journal 闭环');
}

export async function taskCommand(options: TaskCommandOptions): Promise<void> {
  const action = options.action?.trim().toLowerCase();
  switch (action) {
    case 'abort':
      await taskAbort(options);
      return;
    case 'reset':
      await taskReset(options);
      return;
    case 'reopen':
      await taskReopen(options);
      return;
    default:
      throw new Error(`docpath task: unsupported action ${action || '(empty)'}（允许: abort|reset|reopen）`);
  }
}
