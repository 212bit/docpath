/**
 * docpath agent — lifecycle commands for coding agents.
 *
 * These commands are the enforceable bridge for Codex / Claude Code / OpenCode.
 * 与 `continue` 的分工：
 * - **agent enter**: agent 生命周期入口，加载 state.json 标记执行开始，会修改运行时状态
 * - **continue**: 断线恢复，只读 breadcrumb + current.md 给建议，不改变状态
 *
 * enter   -> load state and mark execution start
 * step    -> record progress for a sub-task
 * done    -> run quality gates and mark completion/blocked
 */

import { execFileSync } from 'node:child_process';
import { checkCommand } from './check.js';
import { journalCommand } from './journal.js';
import { reviewCommand } from './review.js';
import { endStepExecution, runCommand } from './runtime.js';
import { writeHybridContextIndex } from '../utils/context-index.js';
import { goCommand } from './go.js';
import { assertWorktreeContract } from './worktree.js';
import { generateAgentOutput } from '../utils/agent-output.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { recordSkipReason } from '../engine/policy.js';
import { markPlanStep } from '../utils/plan-sync.js';
import { emit } from '../hooks/lifecycle.js';
import { mutateCurrentState, readCurrentState, resolveBoundTaskId } from '../utils/workspace.js';
import { readActiveStructuredSpecDocument } from '../utils/task-files.js';
import { resolveSessionContext, touchSession } from '../utils/session.js';
import { resolveDocpathDir } from '../utils/file.js';
import { join } from 'node:path';
import { assertMajorChangeGateReady } from '../utils/major-change.js';
import { emitNextHint } from '../utils/next-hint.js';
import { isQuickProfile, isInstantProfile, gatePolicyForProfile } from '../engine/workflow-profile.js';
import { assertQuickScope } from '../engine/quick-guard.js';
import { readLastCheckEvidence, readReviewEvidence } from '../utils/workspace-evidence.js';
import { assertCleanWorktreeForNewTask, assertNoNonDocPathChangesForExecutionStart, detectDirtyWorktree, detectUncommittedNonDocPathFiles, renderCommitReminder } from '../utils/git-dirty-guard.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';

type AgentAction = 'enter' | 'step' | 'done';

type AgentOptions = {
  cwd: string;
  action: AgentAction;
  step?: string;
  batch?: string;
  note?: string;
  status?: 'done' | 'blocked' | 'skipped';
  skipCheck?: boolean;
  skipReview?: boolean;
  skipTests?: boolean;
  skipLint?: boolean;
  approveReview?: boolean;
  maxEntries?: number;
  autoNext?: boolean;
  enforce?: boolean;
  session?: string;
  noDirtyReminder?: boolean;
};

const GATE_EVIDENCE_FRESH_MS = 60 * 60 * 1000;

function requireStep(action: AgentAction, step?: string): string {
  if (!step || !step.trim()) {
    throw new Error(`docpath agent ${action} requires --step <step>`);
  }
  return step.trim();
}

/**
 * 硬门禁：agent step / done 推进生命周期前必须有已绑定的 task_id。
 * 缺失时 fail-loud，而不是经 runCommand 静默兜底成 runtime —— 否则会在
 * 「无任务」状态下记录进度/跑完门禁，导致 state.json 与代码漂移
 * （与 go 同源的漂移根因；底层原语 run 不走此门禁，保留为逃生通道）。
 */
async function requireBoundTask(action: AgentAction, cwd: string): Promise<string> {
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    throw new Error(
      `docpath agent ${action}: 无法解析 task_id，当前没有已绑定的任务。\n` +
      `    agent 不会在「无任务」状态下推进，以免 state.json 与代码漂移。\n` +
      `    请先创建任务（docpath brainstorm / refine / write-spec），确保 ` +
      `.docpath/tasks/current/spec.md 存在且首行为 \`# T-<date>-<slug> - <标题>\`。`,
    );
  }
  return taskId;
}

function requireSkipReason(flag: '--skip-tests' | '--skip-check' | '--skip-review', note?: string): string {
  if (!note || !note.trim()) {
    throw new Error(`docpath agent done ${flag} requires --note "<reason>"`);
  }
  return note.trim();
}



async function writeWipNoteFile(
  cwd: string,
  payload: {
    taskId: string;
    step: string;
    source: 'agent enter';
    dirtyFiles: number;
    nonDocPathFiles: number;
  },
): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const notePath = join(docpathDir, 'workspace', 'wip-note.md');
  const body = [
    '# WIP Note',
    '',
    `> source: ${payload.source}`,
    `> task_id: ${payload.taskId}`,
    `> step: ${payload.step}`,
    `> updated_at: ${new Date().toISOString()}`,
    '',
    payload.dirtyFiles > 0
      ? `- Status: code/docs may be written but **unverified** (uncommitted files=${payload.dirtyFiles}, non-docpath=${payload.nonDocPathFiles}).`
      : '- Status: worktree clean at capture time; still confirm verification before claiming done.',
    '- Next agent: run `docpath next --agent`, inspect this note + `git status`, then resume the active step.',
    '',
  ].join('\n');
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(notePath), { recursive: true });
  await writeFile(notePath, body, 'utf-8');
  return notePath;
}

/**
 * R-274/FR-2: enter 时清理属于其他任务的陈旧 WIP note。
 * note 的 task_id 从 `> task_id: ` 行解析; 解析不出视为陈旧一并清理。
 */
async function cleanupStaleWipNote(cwd: string, currentTaskId: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const notePath = join(docpathDir, 'workspace', 'wip-note.md');
  const { readFile, rm } = await import('node:fs/promises');
  let content: string;
  try {
    content = await readFile(notePath, 'utf-8');
  } catch {
    return; // 无 note, 无事可做
  }
  const noteTaskId = content.match(/^> task_id: (\S+)$/m)?.[1];
  if (noteTaskId === currentTaskId) return;
  try {
    await rm(notePath, { force: true });
    console.log(`🧹  已清理陈旧 WIP note (task_id: ${noteTaskId || 'unknown'} ≠ 当前 ${currentTaskId})`);
  } catch { /* 清理失败不阻断 enter */ }
}

async function maybeRecordWipNote(cwd: string, taskId: string | undefined): Promise<void> {
  if (!taskId) return;
  const bc = await readBreadcrumb(cwd);
  const active = [...bc.entries].reverse().find((entry) => entry.status === 'in_progress' && entry.taskId === taskId);
  if (!active) return;
  const dirty = detectDirtyWorktree(cwd);
  if (!dirty.isGitRepo || !dirty.dirty) return;
  const path = await writeWipNoteFile(cwd, {
    taskId,
    step: active.step,
    source: 'agent enter',
    dirtyFiles: dirty.files.length,
    nonDocPathFiles: dirty.nonDocPathFiles.length,
  });
  console.log(`\n📝  WIP note written: ${path}`);
  console.log(`    step ${active.step} in_progress with ${dirty.files.length} uncommitted change(s); code may be written but unverified`);
}

async function handleAgentEnter(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  await assertWorktreeContract(cwd);
  // R-309: handoff 删除后 context-index 生成迁至 enter（会话入口构建上下文包）。
  try {
    await writeHybridContextIndex(cwd);
  } catch { /* index 生成失败不阻断 enter */ }
  const current = await readCurrentState(cwd);
  const session = resolveSessionContext(options.session);
  const phase = current?.phase || '';
  if (!current?.task_id || phase === 'idle' || phase === 'completed') {
    assertCleanWorktreeForNewTask(cwd, 'docpath agent enter');
  } else if (current?.task_id && phase === 'executing') {
    assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath agent enter', {
      taskId: current.task_id,
      backlogId: current.backlog_id,
      step: current.current_step,
    });
  }
  if (current?.task_id && !['completed', 'reviewing'].includes(phase)) {
    const docpathDir = await resolveDocpathDir(cwd);
    await assertMajorChangeGateReady(cwd, docpathDir, current.task_id, 'agent enter');
  }
  if (current?.task_id && phase !== 'executing') {
    console.log('\n# agent_context');
    console.log(await generateAgentOutput(cwd));
    throw new Error(
      `docpath agent enter: 当前 phase=${phase || 'unknown'} 尚未进入执行阶段。\n` +
      `    正常路径: 先运行上方 recommended_command，通常是 docpath go --step <id>。\n` +
      `    恢复路径: 如果代码已经改动且确认属于当前任务，可运行 docpath run start --step <id> --note "<reason>" 记录恢复意图。\n` +
      `    若 dirty worktree 包含无关文件，先运行 docpath changes --agent 或使用 docpath worktree create <slug>。\n` +
      `    agent enter 只在具体步骤已进入 executing 后使用，避免提前写入 pending-done。`,
    );
  }
  await touchSession(cwd, {
    sessionId: session.sessionId,
    taskId: current?.task_id || 'runtime',
    step: current?.current_step || 'agent enter',
    command: 'agent enter',
  });

  // R-274: 任何 phase 进入都先清属于其他任务的陈旧 WIP note
  if (current?.task_id) {
    await cleanupStaleWipNote(cwd, current.task_id);
  }
  // R-272: resume with in-progress step + dirty tree → surface/record WIP note
  if (current?.task_id && phase === 'executing') {
    await maybeRecordWipNote(cwd, current.task_id);
  }

  // Refresh backlog_id in state.json from spec.json if not already set.
  if (current?.task_id && !current.backlog_id) {
    const docpathDir = await resolveDocpathDir(cwd);
    const spec = await readActiveStructuredSpecDocument(docpathDir, current.task_id);
    if (spec?.backlog_id) {
      const base = current;
      await mutateCurrentState(cwd, (previous) => ({ ...(previous ?? base), backlog_id: spec.backlog_id }));
    }
  }

  // FR-3: If there are other active sessions, print warning
  try {
    const { listActiveSessions } = await import('../utils/session.js');
    const activeSessions = await listActiveSessions(cwd, {
      excludeSelf: true,
      selfSessionId: session.sessionId,
    });
    if (activeSessions.length > 0) {
      console.warn(`\n⚠️  警告: 检测到其他活跃 Agent 会话正在运行 (PIDs: ${activeSessions.map((s) => s.pid).join(', ')}). 并发执行可能会导致状态竞争或文件冲突。\n`);
    }
  } catch (error) {
    // Non-blocking try-catch
  }

  try {
    await emit('task_start', cwd, current?.task_id || undefined, {
      phase: current?.phase || 'executing',
    });
  } catch (error) {
    console.warn(`⚠️  lifecycle task_start 失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n# agent_context');
  console.log(await generateAgentOutput(cwd));
  await emitNextHint(cwd);
}

async function handleAgentStep(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  const current = await readCurrentState(cwd);
  if (current?.phase === 'completed') {
    throw new Error(
      `docpath agent step: 当前任务已处于 completed 状态，无法修改子任务状态。\n` +
      `    如果是新工作，请运行 docpath next --agent 或 docpath backlog promote <id> 推进新任务。`
    );
  }
  const taskId = await requireBoundTask('step', cwd);
  const session = resolveSessionContext(options.session);

  // 批量补账模式：一次性处理多个步骤，避免 N*2 次调用往返。
  if (options.batch) {
    const steps = options.batch.split(',').map((s) => s.trim()).filter(Boolean);
    if (steps.length === 0) {
      throw new Error('docpath agent step --batch: 未提供步骤 ID（逗号分隔）');
    }
    const status = options.status || 'done';
    console.log(`📦  批量补账: ${steps.length} 个步骤 (${steps.join(', ')})`);
    for (const step of steps) {
      const sync = await endStepExecution({
        cwd,
        step,
        status,
        note: options.note || `agent-step-batch: ${step}`,
        session: session.sessionId,
      });
      if (!sync.planSynced) console.warn(`⚠️  plan checklist 未同步 [${step}]: ${sync.planSyncReason}`);
      console.log(`  ✅  ${step} → ${status}`);
    }
    await emitNextHint(cwd);
    return;
  }

  const step = requireStep(options.action, options.step);
  const status = options.status || 'done';
  const sync = await endStepExecution({
    cwd,
    step,
    status,
    note: options.note || `agent-step: ${step}`,
    session: session.sessionId,
  });
  if (!sync.planSynced) console.warn(`⚠️  plan checklist 未同步: ${sync.planSyncReason}`);

  if (status !== 'done') {
    await runCommand({
      cwd,
      action: 'start',
      step,
      note: 'agent-step: ready for next action',
      session: session.sessionId,
    });
  } else if (options.autoNext) {
    console.log('\n─── 自动加载下一个任务 ───\n');
    await goCommand({ cwd, dryRun: true });
  }
  await emitNextHint(cwd);
}

function isFreshEvidence(timestamp: string | undefined): boolean {
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && Date.now() - time <= GATE_EVIDENCE_FRESH_MS;
}

async function canReuseCheckGate(cwd: string, stateAtStart: Awaited<ReturnType<typeof readCurrentState>>): Promise<string | null> {
  if (stateAtStart?.gate !== 'check_pass' && stateAtStart?.gate !== 'review_pass' && stateAtStart?.gate !== 'review_skipped') {
    return `state gate is ${stateAtStart?.gate || 'none'}`;
  }
  const docpathDir = await resolveDocpathDir(cwd);
  const evidence = await readLastCheckEvidence(docpathDir);
  if (!evidence) return 'last-check evidence missing';
  if (!evidence.passed) return 'last-check evidence did not pass';
  if (!isFreshEvidence(evidence.timestamp)) return 'last-check evidence is stale';
  // R-276(补齐): 证据带 head 时绑定复用——check 之后有新提交则强制重跑
  // (旧证据无 head 维持时间窗判定)。此前缺失该守卫, 导致窗口内提交后仍跳过
  // 全量 check。
  if (evidence.head) {
    const head = currentGitHeadOptional(cwd);
    if (head && evidence.head !== head) return 'HEAD moved since check evidence';
  }
  return null;
}

async function canReuseReviewGate(cwd: string, stateAtStart: Awaited<ReturnType<typeof readCurrentState>>): Promise<string | null> {
  if (stateAtStart?.gate !== 'review_pass') {
    return `state gate is ${stateAtStart?.gate || 'none'}`;
  }
  const docpathDir = await resolveDocpathDir(cwd);
  const evidence = await readReviewEvidence(docpathDir);
  if (!evidence) return 'review evidence missing';
  if (!evidence.approved || evidence.errors > 0) return 'review evidence is not approved';
  if (!isFreshEvidence(evidence.timestamp)) return 'review evidence is stale';
  // R-276: 证据带 head 时绑定复用——review 之后有新提交则强制重审 (旧证据无 head 维持时间窗判定)。
  if (evidence.head) {
    const head = currentGitHeadOptional(cwd);
    if (head && evidence.head !== head) return 'HEAD moved since review evidence';
  }
  return null;
}

function currentGitHeadOptional(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 10000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function runAgentCheckGate(options: AgentOptions, stateAtStart: Awaited<ReturnType<typeof readCurrentState>>): Promise<void> {
  const { cwd } = options;
  if (options.skipCheck) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: --skip-check not allowed');
    }
    await recordSkipReason(cwd, 'check', requireSkipReason('--skip-check', options.note));
    return;
  }

  // instant profile: 跳 build+test+lint,仅跑 typecheck + 结构门禁(lite check)。
  if (gatePolicyForProfile(stateAtStart?.workflow_profile).liteCheck) {
    try {
      console.log('⚡  instant profile: lite check (typecheck + 结构门禁,跳 build/test)');
      await checkCommand({ cwd, lite: true });
    } catch (error) {
      await transitionWorkflow(cwd, 'check.failed', {
        currentStep: `lite 检查失败: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
    return;
  }

  if (!options.skipTests && !options.skipLint) {
    const rejectReason = await canReuseCheckGate(cwd, stateAtStart);
    if (!rejectReason) {
      console.log('⏭️  check reused: fresh successful evidence and pass gate are present');
      return;
    }
    console.log(`ℹ️  check reuse rejected: ${rejectReason}`);
  }

  if (options.skipTests) {
    requireSkipReason('--skip-tests', options.note);
    await recordSkipReason(cwd, 'check', options.note!.trim());
  }
  try {
    await checkCommand({
      cwd,
      skipTests: !!options.skipTests,
      skipLint: !!options.skipLint,
    });
  } catch (error) {
    await transitionWorkflow(cwd, 'check.failed', {
      currentStep: `质量检查失败: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}

async function runAgentReviewGate(options: AgentOptions, stateAtStart: Awaited<ReturnType<typeof readCurrentState>>): Promise<void> {
  const { cwd } = options;
  const profile = stateAtStart?.workflow_profile;
  if (isInstantProfile(profile) && !options.skipReview) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: instant profile review skip not allowed');
    }
    await recordSkipReason(cwd, 'review', 'instant profile: review skipped; lite check (typecheck) already run');
    await transitionWorkflow(cwd, 'review.skipped', {
      currentStep: 'review skipped by instant profile',
    });
    console.log('⏭️  review skipped by instant profile');
    return;
  }
  if (isQuickProfile(profile) && !options.skipReview) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: quick profile review skip not allowed');
    }
    await recordSkipReason(cwd, 'review', 'quick profile: full review skipped; check gate remains required');
    await transitionWorkflow(cwd, 'review.skipped', {
      currentStep: 'review skipped by quick profile',
    });
    console.log('⏭️  review skipped by quick profile');
    return;
  }

  if (options.skipReview) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: --skip-review not allowed');
    }
    await recordSkipReason(cwd, 'review', requireSkipReason('--skip-review', options.note));
    return;
  }

  const rejectReason = await canReuseReviewGate(cwd, stateAtStart);
  if (!rejectReason) {
    console.log('⏭️  review reused: fresh approved evidence and review_pass gate are present');
    return;
  }
  console.log(`ℹ️  review reuse rejected: ${rejectReason}`);

  try {
    await reviewCommand({
      cwd,
      approve: !!options.approveReview,
    });
  } catch (error) {
    await transitionWorkflow(cwd, 'review.failed', {
      currentStep: `审查失败: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}

async function finishAgentDoneTask(options: AgentOptions, finalStatus: NonNullable<AgentOptions['status']>): Promise<void> {
  const { cwd } = options;
  if (finalStatus === 'done') {
    await journalCommand({
      cwd,
      quietPrompt: true,
      archiveMode: 'skip',
    });
    return;
  }

  if (finalStatus === 'blocked') {
    await transitionWorkflow(cwd, 'review.failed', {
      currentStep: options.note || `agent-done: ${finalStatus}`,
    });
    return;
  }

  throw new Error(`docpath agent done 暂不支持状态 ${finalStatus}`);
}

function normalizePlanStepCandidate(step: string | undefined): string | null {
  const match = step?.trim().match(/^(S\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

async function completeFinalPlanStepIfNeeded(options: AgentOptions, taskId: string, step: string | null): Promise<void> {
  if (!step) return;
  const session = resolveSessionContext(options.session);
  const sync = await markPlanStep(options.cwd, step, 'done');
  if (!sync.updated) return;
  await writeBreadcrumb(options.cwd, {
    taskId,
    step,
    status: 'done',
    context: `agent-done: ${step}`,
    sessionId: session.sessionId,
  });
}

async function emitAgentTaskEnd(cwd: string, finalStatus: NonNullable<AgentOptions['status']>): Promise<void> {
  try {
    const current = await readCurrentState(cwd);
    await emit('task_end', cwd, current?.task_id || undefined, {
      phase: current?.phase || 'completed',
      finalStatus,
    });
  } catch (error) {
    console.warn(`⚠️  lifecycle task_end 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleAgentDone(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  const taskId = await requireBoundTask('done', cwd);
  const stateAtStart = await readCurrentState(cwd);
  const finalPlanStep = normalizePlanStepCandidate(options.step || stateAtStart?.current_step);
  const finalStatus = options.status || 'done';
  const quickProfile = isQuickProfile(stateAtStart?.workflow_profile);
  const instantProfile = isInstantProfile(stateAtStart?.workflow_profile);

  // quick / instant 都压缩了门禁，必须由范围守卫兜底：超文件数或触风险路径则拒绝完成。
  if (quickProfile || instantProfile) {
    assertQuickScope(cwd);
  }

  await runAgentCheckGate(options, stateAtStart);
  const stateAfterCheck = await readCurrentState(cwd);
  await runAgentReviewGate(options, stateAfterCheck);
  if (finalStatus === 'done') {
    await completeFinalPlanStepIfNeeded(options, taskId, finalPlanStep);
  }
  await finishAgentDoneTask(options, finalStatus);
  await emitAgentTaskEnd(cwd, finalStatus);

  const { nonDocPathFiles, count } = detectUncommittedNonDocPathFiles(cwd);
  if (count > 0 && !options.noDirtyReminder) {
    console.warn(renderCommitReminder(nonDocPathFiles));
  }

  await emitNextHint(cwd);
}

export async function agentCommand(options: AgentOptions): Promise<void> {
  const { action } = options;

  if (!['enter', 'step', 'done'].includes(action)) {
    throw new Error(`Unsupported agent action: ${action}. Expected enter | step | done`);
  }

  if (action === 'enter') return handleAgentEnter(options);
  if (action === 'step') return handleAgentStep(options);
  return handleAgentDone(options);
}
