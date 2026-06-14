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
 * handoff -> persist compact context for session transfer
 */

import { checkCommand } from './check.js';
import { journalCommand } from './journal.js';
import { reviewCommand } from './review.js';
import { compactCommand, nextCommand, runCommand } from './runtime.js';
import { goCommand } from './go.js';
import { generateAgentOutput } from '../utils/agent-output.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { recordSkipReason } from '../engine/policy.js';
import { markPlanStep } from '../utils/plan-sync.js';
import { emit } from '../hooks/lifecycle.js';
import { readCurrentState, resolveBoundTaskId } from '../utils/workspace.js';
import { releaseExecutionLease, resolveSessionContext, touchSession } from '../utils/session.js';

type AgentAction = 'enter' | 'step' | 'done' | 'handoff';

type AgentOptions = {
  cwd: string;
  action: AgentAction;
  step?: string;
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
};

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

function syncStatusForAgentStep(status: NonNullable<AgentOptions['status']>): 'done' | 'blocked' | 'skipped' | 'pending' {
  return status === 'done'
    ? 'done'
    : status === 'skipped'
      ? 'skipped'
      : status === 'blocked'
        ? 'blocked'
        : 'pending';
}

async function handleAgentEnter(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  const current = await readCurrentState(cwd);
  const session = resolveSessionContext(options.session);
  await touchSession(cwd, {
    sessionId: session.sessionId,
    taskId: current?.task_id || 'runtime',
    step: current?.current_step || 'agent enter',
    command: 'agent enter',
  });
  try {
    await emit('task_start', cwd, current?.task_id || undefined, {
      phase: current?.phase || 'executing',
    });
  } catch (error) {
    console.warn(`⚠️  lifecycle task_start 失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n# agent_context');
  console.log(await generateAgentOutput(cwd));
}

async function handleAgentStep(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  const taskId = await requireBoundTask('step', cwd);
  const session = resolveSessionContext(options.session);
  const step = requireStep(options.action, options.step);
  const status = options.status || 'done';
  await runCommand({
    cwd,
    action: 'end',
    step,
    status,
    note: options.note || `agent-step: ${step}`,
    session: session.sessionId,
    releaseLease: false,
  });

  const sync = await markPlanStep(cwd, step, syncStatusForAgentStep(status));
  if (!sync.updated) console.warn(`⚠️  plan checklist 未同步: ${sync.reason}`);
  await releaseExecutionLease(cwd, {
    sessionId: session.sessionId,
    taskId,
    step,
    command: 'agent step',
  });

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
}

async function runAgentCheckGate(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  if (options.skipCheck) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: --skip-check not allowed');
    }
    await recordSkipReason(cwd, 'check', requireSkipReason('--skip-check', options.note));
    return;
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

async function runAgentReviewGate(options: AgentOptions): Promise<void> {
  const { cwd } = options;
  if (options.skipReview) {
    if (options.enforce) {
      throw new Error('docpath agent done --enforce: --skip-review not allowed');
    }
    await recordSkipReason(cwd, 'review', requireSkipReason('--skip-review', options.note));
    return;
  }

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
      skipAi: true,
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
  await requireBoundTask('done', cwd);
  const finalStatus = options.status || 'done';

  await runAgentCheckGate(options);
  await runAgentReviewGate(options);
  await finishAgentDoneTask(options, finalStatus);
  await emitAgentTaskEnd(cwd, finalStatus);
  await nextCommand({ cwd, agent: true });
}

async function handleAgentHandoff(options: AgentOptions): Promise<void> {
  const current = await readCurrentState(options.cwd);
  const session = resolveSessionContext(options.session);
  await touchSession(options.cwd, {
    sessionId: session.sessionId,
    taskId: current?.task_id || 'runtime',
    step: current?.current_step || 'handoff',
    command: 'agent handoff',
  });
  await compactCommand({
    cwd: options.cwd,
    maxEntries: options.maxEntries,
  });
  await runCommand({
    cwd: options.cwd,
    action: 'recover',
    session: session.sessionId,
  });
}

export async function agentCommand(options: AgentOptions): Promise<void> {
  const { cwd, action } = options;

  if (!['enter', 'step', 'done', 'handoff'].includes(action)) {
    throw new Error(`Unsupported agent action: ${action}. Expected enter | step | done | handoff`);
  }

  if (action === 'enter') return handleAgentEnter(options);
  if (action === 'step') return handleAgentStep(options);
  if (action === 'done') return handleAgentDone(options);
  return handleAgentHandoff(options);
}
