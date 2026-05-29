/**
 * Phase4 runtime commands — agent lifecycle, recovery hints, persistent compaction,
 * lightweight discovery, and next-action routing.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readCurrentState, writeCurrentState } from '../utils/workspace.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { generateAgentOutput } from '../utils/agent-output.js';

type RuntimeState = NonNullable<Awaited<ReturnType<typeof readCurrentState>>>;

type RunOptions = {
  cwd: string;
  action: 'start' | 'end' | 'recover';
  step?: string;
  note?: string;
  status?: 'done' | 'blocked' | 'skipped';
};

type CompactOptions = {
  cwd: string;
  maxEntries?: number;
  dryRun?: boolean;
};

type DiscoverOptions = {
  cwd: string;
  format?: 'text' | 'json';
};

type NextOptions = {
  cwd: string;
  agent?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function withState(state: RuntimeState, patch: Partial<RuntimeState>): RuntimeState {
  return {
    ...state,
    ...patch,
    updated_at: nowIso(),
  };
}

function fallbackState(cwd: string): RuntimeState {
  const taskTitle = cwd.split('/').filter(Boolean).pop() || 'DocPath task';
  const ts = nowIso();
  return {
    level: 1,
    state: 'idle',
    task_id: 'runtime',
    task_title: taskTitle,
    phase: 'runtime',
    current_step: '等待下一步',
    started_at: ts,
    updated_at: ts,
  };
}

async function getState(cwd: string): Promise<RuntimeState> {
  return (await readCurrentState(cwd)) || fallbackState(cwd);
}

async function appendRuntimeEvent(cwd: string, state: RuntimeState, step: string, status: 'done' | 'in_progress' | 'blocked' | 'skipped', context: string): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId: state.task_id || 'runtime',
    step,
    status,
    context,
  });
}

export async function runCommand(options: RunOptions): Promise<void> {
  if (!['start', 'end', 'recover'].includes(options.action)) {
    throw new Error(`Unsupported run action: ${options.action}. Expected start | end | recover`);
  }
  if (options.status && !['done', 'blocked', 'skipped'].includes(options.status)) {
    throw new Error(`Unsupported run status: ${options.status}. Expected done | blocked | skipped`);
  }

  const cwd = options.cwd;
  const state = await getState(cwd);
  const step = options.step || state.current_step || options.action;
  const note = options.note || '';

  if (options.action === 'start') {
    const next = withState(state, {
      state: 'executing',
      phase: 'runtime',
      current_step: step,
      started_at: state.started_at || nowIso(),
    });
    await writeCurrentState(cwd, next);
    await appendRuntimeEvent(cwd, next, step, 'in_progress', note || 'run-start: agent execution started');
    console.log(`▶️  run-start: ${step}`);
    return;
  }

  if (options.action === 'end') {
    const status = options.status || 'done';
    const nextState = status === 'blocked' ? 'check_fail' : 'check_pass';
    const next = withState(state, {
      state: nextState,
      phase: 'runtime',
      current_step: step,
    });
    await writeCurrentState(cwd, next);
    await appendRuntimeEvent(cwd, next, step, status, note || `run-end: ${status}`);
    console.log(`⏹️  run-end: ${step} (${status})`);
    return;
  }

  const breadcrumb = await readBreadcrumb(cwd);
  console.log(await generateAgentOutput(cwd));
  if (breadcrumb.latest) {
    console.log('\n# latest_event');
    console.log(`step: ${breadcrumb.latest.step}`);
    console.log(`status: ${breadcrumb.latest.status}`);
    console.log(`context: ${breadcrumb.latest.context}`);
  }
}

function renderCompactedContext(state: RuntimeState, breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>, keepEntries: number): string {
  const entries = breadcrumb.entries.slice(-keepEntries);
  return [
    '# Compact Context',
    '',
    `> Generated: ${nowIso()}`,
    '',
    '## Current State',
    '',
    `- task_id: ${state.task_id}`,
    `- state: ${state.state}`,
    `- phase: ${state.phase}`,
    `- current_step: ${state.current_step}`,
    '',
    '## Recent Breadcrumbs',
    '',
    ...entries.map((e) => `- ${e.timestamp || ''} [${e.status}] ${e.step}: ${e.context}`),
    '',
  ].join('\n');
}

export async function compactCommand(options: CompactOptions): Promise<void> {
  const cwd = options.cwd;
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await getState(cwd);
  const breadcrumb = await readBreadcrumb(cwd);
  const keepEntries = Math.max(1, options.maxEntries || 20);
  const content = renderCompactedContext(state, breadcrumb, keepEntries);
  const output = join(docpathDir, 'workspace', 'compact-context.md');

  if (options.dryRun) {
    console.log(content);
    return;
  }

  await mkdir(join(docpathDir, 'workspace'), { recursive: true });
  await writeFile(output, content, 'utf-8');
  console.log(`🧩 compact: saved ${relative(cwd, output)} (${Math.min(breadcrumb.entries.length, keepEntries)} events)`);
}

async function existsFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function discoverCommand(options: DiscoverOptions): Promise<void> {
  const cwd = options.cwd;
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  const taskId = (await getState(cwd)).task_id;
  const taskDir = join(docpathDir, 'tasks', taskId);
  const candidates = [
    join(workspaceDir, 'state.json'),
    join(workspaceDir, 'current.md'),
    join(workspaceDir, 'breadcrumb.md'),
    join(workspaceDir, 'compact-context.md'),
    join(workspaceDir, 'last-check.md'),
    join(taskDir, 'spec.md'),
    join(taskDir, 'plan.md'),
    join(taskDir, 'review.md'),
  ];
  const files = [] as { path: string; bytes: number; summary: string }[];
  for (const file of candidates) {
    if (!(await existsFile(file))) continue;
    const content = await readFile(file, 'utf-8');
    const firstText = content.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('---')) || '';
    files.push({ path: relative(cwd, file), bytes: Buffer.byteLength(content), summary: firstText.slice(0, 120) });
  }

  if (options.format === 'json') {
    console.log(JSON.stringify({ files }, null, 2));
    return;
  }
  console.log('# DocPath Discovery');
  for (const f of files) console.log(`- ${f.path} (${f.bytes} bytes) — ${f.summary}`);
}

export async function nextCommand(options: NextOptions): Promise<void> {
  const output = await generateAgentOutput(options.cwd);
  if (options.agent) {
    console.log(output);
    return;
  }
  const recommended = output.match(/^recommended_command:\s*(.+)$/m)?.[1] || 'docpath status --agent';
  const action = output.match(/^next_action:\s*(.+)$/m)?.[1] || '查看状态';
  console.log(`下一步: ${action}`);
  console.log(`建议命令: ${recommended}`);
}
