/**
 * Phase4 runtime commands — agent lifecycle, recovery hints, persistent compaction,
 * lightweight discovery, and next-action routing.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readCurrentState, readOptionalFile } from '../utils/workspace.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { generateAgentOutput } from '../utils/agent-output.js';
import { transitionWorkflow } from '../engine/transitions.js';

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

function fallbackState(cwd: string): RuntimeState {
  const taskTitle = cwd.split('/').filter(Boolean).pop() || 'DocPath task';
  const ts = nowIso();
  return {
    level: 1,
    state: 'idle',
    task_id: 'runtime',
    task_title: taskTitle,
    phase: 'idle',
    gate: 'none',
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
    const next = await transitionWorkflow(cwd, 'step.started', { currentStep: step });
    await appendRuntimeEvent(cwd, next, step, 'in_progress', note || 'run-start: agent execution started');
    console.log(`▶️  run-start: ${step}`);
    return;
  }

  if (options.action === 'end') {
    const status = options.status || 'done';
    const next = await transitionWorkflow(cwd, 'step.completed', { currentStep: step });
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

function uniqueLatestByStep(entries: Awaited<ReturnType<typeof readBreadcrumb>>['entries']) {
  const latest = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) latest.set(entry.step, entry);
  return Array.from(latest.values());
}

function extractScalarFromAgentYaml(agentOutput: string, key: string): string {
  try {
    const parsed = parseYaml(agentOutput) as Record<string, unknown> | null;
    const value = parsed?.[key];
    return typeof value === 'string' ? value : '';
  } catch {
    const match = agentOutput.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
  }
}

function extractRequiredFiles(agentOutput: string): string[] {
  try {
    const parsed = parseYaml(agentOutput) as { required_files?: unknown } | null;
    if (Array.isArray(parsed?.required_files)) {
      return parsed.required_files.filter((item): item is string => typeof item === 'string');
    }
  } catch { /* fallback below */ }

  const match = agentOutput.match(/^required_files:\s*\n([\s\S]*?)(?=^\S|$)/m);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.match(/^\s*-\s+(.+)\s*$/)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '')
    .filter(Boolean);
}

function summarizeLastCheck(lastCheckContent: string): string {
  if (!lastCheckContent.trim()) return '未找到 last-check.md';
  const result = lastCheckContent.match(/^\*\*结果\*\*:\s*(.+)$/m)?.[1]?.trim() || '未知';
  const time = lastCheckContent.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim() || '未知时间';
  const failedItems = lastCheckContent
    .split('\n')
    .filter((line) => /^-\s*❌/.test(line.trim()))
    .map((line) => line.replace(/^-\s*/, '').trim());
  return failedItems.length > 0
    ? `${result} (${time}); 失败项: ${failedItems.join(', ')}`
    : `${result} (${time})`;
}

function renderCompactedContext(
  state: RuntimeState,
  breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>,
  keepEntries: number,
  agentOutput: string,
  lastCheckContent: string,
): string {
  const entries = breadcrumb.entries.slice(-keepEntries);
  const latestEntries = uniqueLatestByStep(breadcrumb.entries);
  const completedSteps = latestEntries.filter((e) => e.status === 'done');
  const blockedSteps = latestEntries.filter((e) => e.status === 'blocked');
  const recommendedCommand = extractScalarFromAgentYaml(agentOutput, 'recommended_command') || 'docpath next --agent';
  const nextAction = extractScalarFromAgentYaml(agentOutput, 'next_action') || '运行 docpath next --agent';
  const requiredFiles = extractRequiredFiles(agentOutput);
  return [
    '# Compact Context',
    '',
    `> Generated: ${nowIso()}`,
    '',
    '## Resume Protocol',
    '',
    '1. 先读 `.docpath/workspace/current.md`。',
    '2. 再读本文件中的 `Next Agent Route`。',
    '3. 按 `recommended_command` 执行下一步，除非当前工作区状态已经变化。',
    '',
    '## Current Goal',
    '',
    `- task_id: ${state.task_id || 'unknown'}`,
    `- task_title: ${state.task_title || '未命名任务'}`,
    `- current_step: ${state.current_step || '待确认'}`,
    `- next_action: ${nextAction}`,
    `- recommended_command: ${recommendedCommand}`,
    '',
    '## Current State',
    '',
    `- task_id: ${state.task_id}`,
    `- state: ${state.state}`,
    `- phase: ${state.phase}`,
    `- gate: ${state.gate}`,
    `- current_step: ${state.current_step}`,
    `- updated_at: ${state.updated_at}`,
    '',
    '## Completed Steps',
    '',
    ...(completedSteps.length > 0
      ? completedSteps.map((e) => `- ${e.step}: ${e.context || 'done'}`)
      : ['- 无已完成 breadcrumb 记录']),
    '',
    '## Current Blockers',
    '',
    ...(blockedSteps.length > 0
      ? blockedSteps.map((e) => `- ${e.step}: ${e.context || 'blocked'}`)
      : ['- 无阻塞 breadcrumb 记录']),
    '',
    '## Verification Evidence',
    '',
    `- last_check: ${summarizeLastCheck(lastCheckContent)}`,
    `- breadcrumb_events_kept: ${entries.length}`,
    '',
    '## Required Files Before Resume',
    '',
    ...(requiredFiles.length > 0
      ? requiredFiles.map((file) => `- ${file}`)
      : ['- .docpath/workspace/current.md']),
    '',
    '## Next Agent Route',
    '',
    '```yaml',
    agentOutput.trim(),
    '```',
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
  const agentOutput = await generateAgentOutput(cwd);
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const content = renderCompactedContext(state, breadcrumb, keepEntries, agentOutput, lastCheckContent);
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
