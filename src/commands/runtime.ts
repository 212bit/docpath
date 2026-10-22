/**
 * Phase4 runtime commands — agent lifecycle, recovery hints, persistent compaction,
 * lightweight discovery, and next-action routing.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { readCurrentState, readOptionalFile } from '../utils/workspace.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { claimTaskDirtyPaths } from '../utils/git-dirty-guard.js';
import { markPlanStep } from '../utils/plan-sync.js';
import { generateAgentOutput } from '../engine/agent-output.js';
import { transitionWorkflow } from '../engine/transitions.js';
import type { WorkflowEvent, TransitionPayload } from '../engine/transitions.js';
import { detectActiveTaskFileDrift, readActiveTaskFile, syncActiveTaskFiles } from '../utils/task-files.js';
import { syncCurrentDocument } from '../utils/workspace.js';
import { writeHybridContextIndex, readHybridContextIndexSummary } from '../utils/context-index.js';
import { parsePlanSteps } from '../utils/doc-parser.js';
import { readLastCheckMarkdown, readReviewMarkdown } from '../utils/workspace-evidence.js';
import {
  resolveSessionContext,
  touchSession,
} from '../utils/session.js';

const execFileAsync = promisify(execFile);

type RuntimeState = NonNullable<Awaited<ReturnType<typeof readCurrentState>>>;

type RunOptions = {
  cwd: string;
  action: 'start' | 'end' | 'recover';
  step?: string;
  note?: string;
  status?: 'done' | 'blocked' | 'skipped';
  session?: string;
  };

type CompactOptions = {
  cwd: string;
  maxEntries?: number;
  dryRun?: boolean;
  cleanup?: boolean;
};

type DiscoverOptions = {
  cwd: string;
  format?: 'text' | 'json';
};

type NextOptions = {
  cwd: string;
  agent?: boolean;
  autoFix?: 'canonical' | 'current' | 'merge';
  verbose?: boolean;
  compact?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackState(cwd: string): RuntimeState {
  const taskTitle = cwd.split('/').filter(Boolean).pop() || 'DocPath task';
  const ts = nowIso();
  return {
    level: 1,
    workflow_profile: 'standard',
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

async function appendRuntimeEvent(
  cwd: string,
  state: RuntimeState,
  step: string,
  status: 'done' | 'in_progress' | 'blocked' | 'skipped',
  context: string,
  sessionId?: string,
): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId: state.task_id || 'runtime',
    step,
    status,
    context,
    ...(sessionId ? { sessionId } : {}),
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
  const session = resolveSessionContext(options.session);
  await touchSession(cwd, {
    sessionId: session.sessionId,
    taskId: state.task_id || 'runtime',
    step,
    command: `run ${options.action}`,
  });

  if (options.action === 'start') {
    const next = await transitionWorkflow(cwd, 'step.started', { currentStep: step });
    await appendRuntimeEvent(cwd, next, step, 'in_progress', note || 'run-start: agent execution started', session.sessionId);
    console.log(`▶️  run-start: ${step}`);
    return;
  }

  if (options.action === 'end') {
    const status = options.status || 'done';
    const next = await transitionWorkflow(cwd, 'step.completed', {
      currentStep: status === 'blocked' ? step : undefined,
    });
    await appendRuntimeEvent(cwd, next, step, status, note || `run-end: ${status}`, session.sessionId);
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

/** R-337 W3: 步骤收尾单一原语的结果 */
export interface EndStepResult {
  planSynced: boolean;
  planSyncReason: string;
}

/**
 * R-337 W3: 步骤收尾单一原语 —— runtime end（breadcrumb + 状态转移）与
 * plan checklist 同步此前是两条平行实现（go --status 与 agent step 各写一份，
 * 行为漂移风险）。go/agent 统一走本原语。
 */
export async function endStepExecution(options: {
  cwd: string;
  step: string;
  status: 'done' | 'blocked' | 'skipped';
  note?: string;
  session?: string;
}): Promise<EndStepResult> {
  await runCommand({
    cwd: options.cwd,
    action: 'end',
    step: options.step,
    status: options.status,
    note: options.note,
    session: options.session,
  });
  const sync = await markPlanStep(options.cwd, options.step, options.status);
  // 步骤收尾时把这一步留下的脏路径归给当前任务。step-pass 随后调用的 go
  // 才能放行本任务自己的未提交代码，而不必再传 --accept-dirty。
  const taskId = (await readCurrentState(options.cwd))?.task_id?.trim();
  if (taskId) {
    claimTaskDirtyPaths(options.cwd, taskId, 'step');
  }
  return { planSynced: sync.updated, planSyncReason: sync.reason };
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
    const parsed = parseYaml(agentOutput) as { context_refs?: Array<{ path: string }> } | null;
    if (Array.isArray(parsed?.context_refs)) {
      return parsed.context_refs.map((ref) => ref.path);
    }
  } catch { /* fallback below */ }

  const match = agentOutput.match(/^context_refs:\s*\n([\s\S]*?)(?=^\S|$)/m);
  if (!match) return [];
  const lines = match[1].split('\n');
  const paths: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const pathMatch = line.match(/^\s*-\s+path:\s*(.+)$/);
      if (pathMatch) {
        paths.push(pathMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    } else if (trimmed.startsWith('path:')) {
      const pathMatch = line.match(/^\s*path:\s*(.+)$/);
      if (pathMatch) {
        paths.push(pathMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return paths.filter(Boolean);
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

function summarizeReview(reviewContent: string): string {
  if (!reviewContent.trim()) return '未找到 review.md';
  const status = reviewContent.match(/^\*\*(?:状态|结果)\*\*:\s*(.+)$/m)?.[1]?.trim() || '未知';
  const time = reviewContent.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim() || '未知时间';
  const findings = reviewContent
    .split('\n')
    .filter((line) => /^-\s*(?:❌|⚠️)/.test(line.trim()))
    .map((line) => line.replace(/^-\s*/, '').trim())
    .slice(0, 5);
  return findings.length > 0
    ? `${status} (${time}); 关注项: ${findings.join(', ')}`
    : `${status} (${time})`;
}

function summarizePlanForHandoff(planContent: string): string {
  const steps = parsePlanSteps(planContent);
  if (steps.length === 0) return '未找到可解析计划步骤';
  const done = steps.filter((step) => step.done).length;
  const blocked = steps.filter((step) => step.marker === '!').length;
  const next = steps.find((step) => !step.done && step.marker !== '~');
  return next
    ? `${done}/${steps.length} 完成，${blocked} 阻塞；下一步 ${next.id}: ${next.name}`
    : `${done}/${steps.length} 完成，${blocked} 阻塞；计划步骤已全部处理`;
}

function isPassSummary(summary: string): boolean {
  return /PASS|✅/.test(summary) && !/FAIL|❌|未找到|未知/.test(summary);
}

function buildReadiness(state: RuntimeState, view: CompactedContextView): { status: string; guidance: string; risks: string[] } {
  const risks: string[] = [];
  const gate = state.gate || 'none';

  if (/fail|blocked/.test(gate)) {
    risks.push(`当前 gate=${gate}，必须先处理失败门禁或阻塞项。`);
  }
  if (view.blockedSteps.length > 0) {
    risks.push(`存在 ${view.blockedSteps.length} 个阻塞 breadcrumb。`);
  }
  if (!isPassSummary(view.lastCheckSummary)) {
    risks.push(`check 未通过或缺失：${view.lastCheckSummary}`);
  }
  if (!isPassSummary(view.reviewSummary)) {
    risks.push(`review 未通过或缺失：${view.reviewSummary}`);
  }

  if (/fail|blocked/.test(gate) || view.blockedSteps.length > 0) {
    return {
      status: 'blocked',
      guidance: '不要直接继续完成任务；先按 recommended_command 处理阻塞，再重新运行 check/review。',
      risks,
    };
  }

  if (risks.length > 0) {
    return {
      status: 'not_ready_to_finish',
      guidance: '可以继续接手执行，但不能声明完成；先补齐或修复 check/review 证据。',
      risks,
    };
  }

  return {
    status: 'ready_for_handoff',
    guidance: '可以接手下一步；执行前仍需确认工作区未发生新的外部变更。',
    risks: ['未发现阻塞态；仍需按 recommended_command 恢复。'],
  };
}

async function summarizeChangeScope(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--short'], { cwd, timeout: 5000 });
    const lines = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (lines.length === 0) return ['- git_status: clean'];
    return [
      `- git_status: ${lines.length} dirty paths`,
      ...lines.slice(0, 12).map((line) => `- ${line}`),
      ...(lines.length > 12 ? [`- ... ${lines.length - 12} more paths`] : []),
    ];
  } catch {
    return ['- git_status: unavailable (not a git repository or git not available)'];
  }
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
  reviewSummary: string;
  planSummary: string;
  changeScope: string[];
};

function buildCompactedContextView(
  breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>,
  keepEntries: number,
  agentOutput: string,
  lastCheckContent: string,
  reviewContent: string,
  planContent: string,
  changeScope: string[],
): CompactedContextView {
  const entries = breadcrumb.entries.slice(-keepEntries);
  const latestEntries = uniqueLatestByStep(breadcrumb.entries);
  const completedSteps = latestEntries.filter((e) => e.status === 'done');
  const blockedSteps = latestEntries.filter((e) => e.status === 'blocked');
  const recommendedCommand = extractScalarFromAgentYaml(agentOutput, 'recommended_command') || 'docpath next --agent';
  const nextAction = extractScalarFromAgentYaml(agentOutput, 'next_action') || '运行 docpath next --agent';
  const requiredFiles = extractRequiredFiles(agentOutput);
  const lastCheckSummary = summarizeLastCheck(lastCheckContent);
  const reviewSummary = summarizeReview(reviewContent);
  const planSummary = summarizePlanForHandoff(planContent);
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
    reviewSummary,
    planSummary,
    changeScope,
  };
}

function renderRequiredFiles(requiredFiles: string[]): string[] {
  return requiredFiles.length > 0
    ? requiredFiles.map((file) => `- ${file}`)
    : ['- .docpath/workspace/current.md'];
}

function renderContextIndexReference(summary: Awaited<ReturnType<typeof readHybridContextIndexSummary>>): string[] {
  if (!summary) return [];
  return [
    '',
    '## Hybrid Context Index',
    '',
    `- path: ${summary.path}`,
    `- trunk: ${summary.trunk_count}`,
    `- leaves: ${summary.leaf_count}`,
    `- generated_at: ${summary.generated_at || 'unknown'}`,
  ];
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
  const readiness = buildReadiness(state, view);
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
    '## Handoff Readiness',
    '',
    `- status: ${readiness.status}`,
    `- guidance: ${readiness.guidance}`,
    '',
    '## Remaining Risks',
    '',
    ...readiness.risks.map((item) => `- ${item}`),
    '',
    '## Verification Status',
    '',
    `- last_check: ${view.lastCheckSummary}`,
    `- review: ${view.reviewSummary}`,
    '',
    '## Change Scope',
    '',
    ...view.changeScope,
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
    '1. Start with `docpath next --agent` when resuming or when state is uncertain.',
    '2. Read this compact context only as a handoff summary, not as a replacement for the CLI route.',
    '3. Treat `next --agent` as advisory routing, not as permission, a lock, or a replacement for command preflight gates.',
    '4. Check `Verification Status`, `Remaining Risks`, `Change Scope`, and `Next Agent Route`.',
    '5. If readiness is `blocked` or `not_ready_to_finish`, handle the blocker or missing verification before claiming completion.',
    '6. Use `docpath status --agent` only for explicit status/debug snapshots, suspected drift, or confirmation after state-changing commands.',
    '7. Explicit deterministic commands may run directly, but state-changing commands must re-read state and enforce their own gates.',
    '8. Follow `recommended_command` unless the workspace state has changed.',
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
    `- review: ${view.reviewSummary}`,
    `- plan: ${view.planSummary}`,
    `- breadcrumb_events_kept: ${view.entries.length}`,
    '',
    '## Required Files Before Resume',
    '',
    '- Prefer CLI summaries first: `docpath next --agent`, `docpath reveal --topic <keyword> --level 1-3`; use `docpath status --agent` only for diagnostics.',
    '- Treat the paths below as direct-read candidates for debugging or deep context, not as files to read by default.',
    ...[
      '.docpath/workspace/current.md',
      '.docpath/workspace/breadcrumb.md',
      '.docpath/workspace/last-check.md',
      '.docpath/workspace/review.md',
      '.docpath/tasks/current/plan.md',
      ...view.requiredFiles,
    ].filter((file, index, list) => list.indexOf(file) === index).map((file) => `- ${file}`),
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
  reviewContent: string,
  planContent: string,
  changeScope: string[],
  contextIndexSummary: Awaited<ReturnType<typeof readHybridContextIndexSummary>>,
): string {
  const view = buildCompactedContextView(
    breadcrumb,
    keepEntries,
    agentOutput,
    lastCheckContent,
    reviewContent,
    planContent,
    changeScope,
  );
  return [
    ...renderCompactedOverview(state, view),
    ...renderContextIndexReference(contextIndexSummary),
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
  await writeHybridContextIndex(cwd);
  const contextIndexSummary = await readHybridContextIndexSummary(cwd);
  const agentOutput = await generateAgentOutput(cwd);
  const lastCheckContent = await readLastCheckMarkdown(docpathDir);
  const reviewContent = await readReviewMarkdown(docpathDir);
  const planContent = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
  const changeScope = await summarizeChangeScope(cwd);
  const content = renderCompactedContext(
    state,
    breadcrumb,
    keepEntries,
    agentOutput,
    lastCheckContent,
    reviewContent,
    planContent,
    changeScope,
    contextIndexSummary,
  );
  const output = join(docpathDir, 'workspace', 'compact-context.md');

  if (options.dryRun) {
    console.log(content);
    return;
  }

  await mkdir(join(docpathDir, 'workspace'), { recursive: true });
  await writeFile(output, content, 'utf-8');

  console.log(`🧩 compact: saved ${relative(cwd, output)} (${Math.min(breadcrumb.entries.length, keepEntries)} events in handoff view)`);

  if (options.cleanup) {
    const { cleanupWorkspace, renderWorkspaceCleanupSummary } = await import('../utils/workspace-cleanup.js');
    const cleanup = await cleanupWorkspace(cwd);
    for (const line of renderWorkspaceCleanupSummary(cwd, cleanup)) console.log(`   ${line}`);
  }
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
        if (options.autoFix === 'merge') {
          const { writeActiveTaskFile } = await import('../utils/task-files.js');
          const { tryThreeWayMerge } = await import('../utils/structured-heal.js');
          const mergedFiles: string[] = [];
          for (const drift of drifts) {
            if (drift.reason === 'content-mismatch') {
              const res = await tryThreeWayMerge(drift.currentPath, drift.canonicalPath, drift.file);
              await writeActiveTaskFile(docpathDir, state.task_id, drift.file, res.mergedContent);
              mergedFiles.push(drift.file);
            }
          }
          await syncCurrentDocument(options.cwd);
          console.error(`已自动通过三方合并修复 active task 文件漂移: ${mergedFiles.join(', ')}`);
        } else {
          const synced = await syncActiveTaskFiles(docpathDir, state.task_id, options.autoFix);
          await syncCurrentDocument(options.cwd);
          console.error(`已自动修复 active task 文件漂移 (${options.autoFix}): ${synced.map((item) => item.file).join(', ')}`);
        }
      }
    }
  }
  const output = await generateAgentOutput(options.cwd, { view: 'next', verbose: options.verbose, compact: options.compact });
  if (options.agent) {
    console.log(output);
    return;
  }
  const recommended = output.match(/^recommended_command:\s*(.+)$/m)?.[1] || 'docpath status --agent';
  const action = output.match(/^next_action:\s*(.+)$/m)?.[1] || '查看状态';
  console.log(`下一步: ${action}`);
  console.log(`建议命令: ${recommended}`);
}

/**
 * 文件写入成功后执行状态转换 + next 路由。
 *
 * 文件已落盘 = 命令本质成功，后续步骤（状态转换 / next 计算）失败不应让命令以
 * 退出码 1 结束并覆盖前面的成功信号（R-248）。这里把后续步骤包进 try-catch，
 * 失败时打印 ⚠️ 警告 + 具体错误信息，不抛出，让命令保留 exit 0。
 * 写入本身的失败仍由调用方抛出 / exit 1。
 */
export async function runPostWriteSteps(
  cwd: string,
  event: WorkflowEvent,
  eventPayload: TransitionPayload,
): Promise<void> {
  try {
    await transitionWorkflow(cwd, event, eventPayload);
    await nextCommand({ cwd });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`⚠️  文件已写入，但后续步骤失败（不影响写入结果）: ${msg}`);
    console.error('   运行 DOCPATH_DEBUG=1 docpath ... 查看详细堆栈，或 docpath next --agent 查看当前路由');
  }
}
