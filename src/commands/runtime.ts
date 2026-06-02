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
import { detectActiveTaskFileDrift, syncActiveTaskFiles } from '../utils/task-files.js';
import { syncCurrentDocument } from '../utils/workspace.js';

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
  autoFix?: 'canonical' | 'current';
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

type CompactedContextView = {
  entries: Awaited<ReturnType<typeof readBreadcrumb>>['entries'];
  latestEntries: Awaited<ReturnType<typeof readBreadcrumb>>['entries'];
  completedSteps: Awaited<ReturnType<typeof readBreadcrumb>>['entries'];
  blockedSteps: Awaited<ReturnType<typeof readBreadcrumb>>['entries'];
  recommendedCommand: string;
  nextAction: string;
  requiredFiles: string[];
  progressLine: string;
  recentFailures: string[];
  lastCheckSummary: string;
};

function buildCompactedContextView(
  breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>,
  keepEntries: number,
  agentOutput: string,
  lastCheckContent: string,
): CompactedContextView {
  const entries = breadcrumb.entries.slice(-keepEntries);
  const latestEntries = uniqueLatestByStep(breadcrumb.entries);
  const completedSteps = latestEntries.filter((e) => e.status === 'done');
  const blockedSteps = latestEntries.filter((e) => e.status === 'blocked');
  const recommendedCommand = extractScalarFromAgentYaml(agentOutput, 'recommended_command') || 'docpath next --agent';
  const nextAction = extractScalarFromAgentYaml(agentOutput, 'next_action') || '运行 docpath next --agent';
  const requiredFiles = extractRequiredFiles(agentOutput);
  const lastCheckSummary = summarizeLastCheck(lastCheckContent);
  return {
    entries,
    latestEntries,
    completedSteps,
    blockedSteps,
    recommendedCommand,
    nextAction,
    requiredFiles,
    progressLine: `${completedSteps.length}/${latestEntries.length || 0}`,
    recentFailures: blockedSteps.length > 0
      ? blockedSteps.map((e) => `${e.step}: ${e.context || 'blocked'}`)
      : [lastCheckSummary],
    lastCheckSummary,
  };
}

function renderRequiredFiles(requiredFiles: string[]): string[] {
  return requiredFiles.length > 0
    ? requiredFiles.map((file) => `- ${file}`)
    : ['- .docpath/workspace/current.md'];
}

function renderBreadcrumbList(
  entries: Awaited<ReturnType<typeof readBreadcrumb>>['entries'],
  fallback: string,
): string[] {
  return entries.length > 0
    ? entries.map((e) => `- ${e.step}: ${e.context || e.status}`)
    : [fallback];
}

function renderCompactedOverview(state: RuntimeState, view: CompactedContextView): string[] {
  return [
    `# Context Handoff — ${state.task_id || 'unknown'}`,
    '',
    `> Generated: ${nowIso()}`,
    '',
    `## Current State: ${state.phase} / ${state.gate}`,
    '',
    `## Goal: ${state.task_title || '未命名任务'}`,
    '',
    `## Progress: ${view.progressLine}`,
    '',
    '## Recent Failures',
    '',
    ...view.recentFailures.map((item) => `- ${item}`),
    '',
    '## Next Action',
    '',
    `- next_action: ${view.nextAction}`,
    `- recommended_command: ${view.recommendedCommand}`,
    '',
    '## Required Reading',
    '',
    ...renderRequiredFiles(view.requiredFiles),
  ];
}

function renderResumeProtocol(): string[] {
  return [
    '## Resume Protocol',
    '',
    '1. 先读 `.docpath/workspace/current.md`。',
    '2. 再读本文件中的 `Next Agent Route`。',
    '3. 按 `recommended_command` 执行下一步，除非当前工作区状态已经变化。',
  ];
}

function renderCurrentGoalAndState(state: RuntimeState, view: CompactedContextView): string[] {
  return [
    '## Current Goal',
    '',
    `- task_id: ${state.task_id || 'unknown'}`,
    `- task_title: ${state.task_title || '未命名任务'}`,
    `- current_step: ${state.current_step || '待确认'}`,
    `- next_action: ${view.nextAction}`,
    `- recommended_command: ${view.recommendedCommand}`,
    '',
    '## Current State',
    '',
    `- task_id: ${state.task_id}`,
    `- state: ${state.state}`,
    `- phase: ${state.phase}`,
    `- gate: ${state.gate}`,
    `- current_step: ${state.current_step}`,
    `- updated_at: ${state.updated_at}`,
  ];
}

function renderProgressDetails(view: CompactedContextView): string[] {
  return [
    '## Completed Steps',
    '',
    ...renderBreadcrumbList(view.completedSteps, '- 无已完成 breadcrumb 记录'),
    '',
    '## Current Blockers',
    '',
    ...renderBreadcrumbList(view.blockedSteps, '- 无阻塞 breadcrumb 记录'),
    '',
    '## Verification Evidence',
    '',
    `- last_check: ${view.lastCheckSummary}`,
    `- breadcrumb_events_kept: ${view.entries.length}`,
    '',
    '## Required Files Before Resume',
    '',
    ...renderRequiredFiles(view.requiredFiles),
  ];
}

function renderAgentRouteAndBreadcrumbs(view: CompactedContextView, agentOutput: string): string[] {
  return [
    '## Next Agent Route',
    '',
    '```yaml',
    agentOutput.trim(),
    '```',
    '',
    '## Recent Breadcrumbs',
    '',
    ...view.entries.map((e) => `- ${e.timestamp || ''} [${e.status}] ${e.step}: ${e.context}`),
  ];
}

function renderCompactedContext(
  state: RuntimeState,
  breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>,
  keepEntries: number,
  agentOutput: string,
  lastCheckContent: string,
): string {
  const view = buildCompactedContextView(breadcrumb, keepEntries, agentOutput, lastCheckContent);
  return [
    ...renderCompactedOverview(state, view),
    '',
    ...renderResumeProtocol(),
    '',
    ...renderCurrentGoalAndState(state, view),
    '',
    ...renderProgressDetails(view),
    '',
    ...renderAgentRouteAndBreadcrumbs(view, agentOutput),
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
  // 裁剪 breadcrumb：只保留最近 keepEntries 条
  const trimmedEntries = breadcrumb.entries.slice(-keepEntries);
  const { writeFile: writeFsFile } = await import('node:fs/promises');
  const { formatEntry, BREADCRUMB_HEADER } = await import('../engine/breadcrumb.js');
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.md');
  const body = trimmedEntries.map((entry) => formatEntry(entry)).join('');
  await writeFsFile(breadcrumbPath, BREADCRUMB_HEADER + body, 'utf-8');
  console.log(`🧩 compact: saved ${relative(cwd, output)} (${trimmedEntries.length} events, pruned ${breadcrumb.entries.length - trimmedEntries.length})`);
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
  if (options.autoFix) {
    const state = await readCurrentState(options.cwd);
    if (state?.task_id) {
      const docpathDir = await resolveDocpathDir(options.cwd);
      const drifts = await detectActiveTaskFileDrift(docpathDir, state.task_id);
      if (drifts.length > 0) {
        const synced = await syncActiveTaskFiles(docpathDir, state.task_id, options.autoFix);
        await syncCurrentDocument(options.cwd);
        console.error(`已自动修复 active task 文件漂移 (${options.autoFix}): ${synced.map((item) => item.file).join(', ')}`);
      }
    }
  }
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
