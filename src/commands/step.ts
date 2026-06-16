/**
 * docpath step — 标记当前步骤状态的语义化命令
 *
 * 支持：
 * - docpath step done [--step S1]
 * - docpath step blocked [--step S1]
 * - docpath step skipped [--step S1]
 *
 * 不传 --step 时，尝试推断 current_step（仅当 unambiguous 时）。
 */

import { agentCommand } from './agent.js';
import { resolveBoundTaskId } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { resolveCurrentStep, describeStepAmbiguity } from '../utils/current-step-inference.js';

interface StepOptions {
  cwd: string;
  status: 'done' | 'blocked' | 'skipped';
  step?: string;
  note?: string;
  session?: string;
}

/**
 * docpath step 命令实现
 *
 * 语义化包装，调用底层 agent step 命令，支持 current_step 推断
 */
export async function stepCommand(options: StepOptions): Promise<void> {
  const { cwd, status, note } = options;
  const session = resolveSessionContext(options.session);

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法标记步骤状态: 当前没有已绑定的任务');
    console.error('    step 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 运行: docpath status --agent 诊断当前状态');
    console.error('      - 如果有任务，检查 .docpath/tasks/current/spec.md');
    process.exit(1);
  }

  // 推断或验证步骤
  const inference = await resolveCurrentStep(cwd, taskId, options.step);
  if (!inference.step) {
    console.error(`❌  无法推断当前步骤`);
    console.error('');
    console.error(describeStepAmbiguity(inference));
    console.error('');
    console.error('建议:');
    console.error('  - 显式指定步骤: docpath step ' + status + ' --step <step>');
    console.error('  - 或运行: docpath status --agent 诊断状态');
    process.exit(1);
  }

  const resolvedStep = inference.step;

  // 调用底层 agent step 命令
  await agentCommand({
    cwd,
    action: 'step',
    step: resolvedStep,
    status,
    note,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  步骤状态已更新: ${resolvedStep} → ${status}`);
  console.log(`    task_id: ${taskId}`);
  console.log(`    session: ${session.sessionId}`);
  if (options.step) {
    console.log(`    step 来源: 显式参数`);
  } else {
    console.log(`    step 来源: 自动推断`);
    if (inference.context?.stateCurrentStep) {
      console.log(`    推断依据: state.current_step = ${inference.context.stateCurrentStep}`);
    }
  }
  console.log(`    底层调用: docpath agent step --step ${resolvedStep} --status ${status}`);
  console.log('');
}
