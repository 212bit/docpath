/**
 * docpath task — 当前任务生命周期管理。
 */

import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { listBacklogItems, setBacklogStatus } from '../engine/backlog.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, writeCurrentState, type CurrentState } from '../utils/workspace.js';
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
  await writeCurrentState(cwd, {
    ...previous,
    state: 'idle',
    phase: 'idle',
    gate: 'none',
    workflow_profile: 'standard',
    task_id: '',
    task_title: '',
    current_step: currentStep,
    started_at: ts,
    updated_at: ts,
  });
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

export async function taskCommand(options: TaskCommandOptions): Promise<void> {
  const action = options.action?.trim().toLowerCase();
  switch (action) {
    case 'abort':
      await taskAbort(options);
      return;
    case 'reset':
      await taskReset(options);
      return;
    default:
      throw new Error(`docpath task: unsupported action ${action || '(empty)'}（允许: abort|reset）`);
  }
}
