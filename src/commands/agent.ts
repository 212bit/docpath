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
import { recordSkipReason } from '../engine/policy.js';
import { markPlanStep } from '../utils/plan-sync.js';

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
};

function requireStep(action: AgentAction, step?: string): string {
  if (!step || !step.trim()) {
    throw new Error(`docpath agent ${action} requires --step <step>`);
  }
  return step.trim();
}

export async function agentCommand(options: AgentOptions): Promise<void> {
  const cwd = options.cwd;
  const action = options.action;

  if (!['enter', 'step', 'done', 'handoff'].includes(action)) {
    throw new Error(`Unsupported agent action: ${action}. Expected enter | step | done | handoff`);
  }

  if (action === 'enter') {

    console.log('\n# agent_context');
    console.log(await generateAgentOutput(cwd));
    return;
  }

  if (action === 'step') {
    const step = requireStep(action, options.step);
    const status = options.status || 'done';
    await runCommand({
      cwd,
      action: 'end',
      step,
      status,
      note: options.note || `agent-step: ${step}`,
    });
    if (status === 'done') {
      const sync = await markPlanStep(cwd, step, true);
      if (!sync.updated) console.warn(`⚠️  plan checklist 未同步: ${sync.reason}`);
    }
    if (status !== 'done') {
      await runCommand({
        cwd,
        action: 'start',
        step,
        note: 'agent-step: ready for next action',
      });
    } else if (options.autoNext) {
      console.log('\n─── 自动加载下一个任务 ───\n');
      await goCommand({ cwd, dryRun: true });
    }
    return;
  }

  if (action === 'done') {
    const step = options.step || 'agent-task';
    let finalStatus: 'done' | 'blocked' | 'skipped' = options.status || 'done';

    if (options.skipCheck) {
      if (options.enforce) {
        throw new Error('docpath agent done --enforce: --skip-check not allowed');
      }
      await recordSkipReason(cwd, 'check', options.note || 'agent done --skip-check');
    } else {
      try {
        await checkCommand({
          cwd,
          skipTests: !!options.skipTests,
          skipLint: !!options.skipLint,
        });
      } catch (error) {
        finalStatus = 'blocked';
        await runCommand({
          cwd,
          action: 'end',
          step,
          status: 'blocked',
          note: `agent-done: check failed — ${error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    }

    if (options.skipReview) {
      if (options.enforce) {
        throw new Error('docpath agent done --enforce: --skip-review not allowed');
      }
      await recordSkipReason(cwd, 'review', options.note || 'agent done --skip-review');
    } else {
      try {
        await reviewCommand({
          cwd,
          useAi: false,
          approve: !!options.approveReview,
        });
      } catch (error) {
        finalStatus = 'blocked';
        await runCommand({
          cwd,
          action: 'end',
          step,
          status: 'blocked',
          note: `agent-done: review failed — ${error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    }

    await runCommand({
      cwd,
      action: 'end',
      step,
      status: finalStatus,
      note: options.note || `agent-done: ${finalStatus}`,
    });

    if (finalStatus === 'done') {
      await journalCommand({
        cwd,
        skipAi: true,
        archiveMode: 'skip',
      });
    }

    await nextCommand({ cwd, agent: true });
    return;
  }

  await compactCommand({
    cwd,
    maxEntries: options.maxEntries,
  });
  await runCommand({
    cwd,
    action: 'recover',
  });
}
