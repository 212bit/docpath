/**
 * 恢复命令集 — recover, retry, unblock
 *
 * 语义化的恢复命令，用于从 blocked/skipped 步骤恢复。
 * 记录 recovery intent 到 breadcrumb，然后调用 go 重新启动步骤。
 */

import { goCommand } from './go.js';
import { resolveBoundTaskId } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { readBreadcrumb, type BreadcrumbEntry } from '../engine/breadcrumb.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';

interface RecoverOptions {
  cwd: string;
  step: string;
  session?: string;
}

/**
 * docpath recover 命令实现
 *
 * 从 blocked 状态恢复执行
 */
export async function recoverCommand(options: RecoverOptions): Promise<void> {
  const { cwd, step } = options;
  const session = resolveSessionContext(options.session);

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法恢复步骤: 当前没有已绑定的任务');
    console.error('    recover 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 运行: docpath status --agent 诊断当前状态');
    process.exit(1);
  }

  // 检查步骤是否 blocked
  const bc = await readBreadcrumb(cwd);
  const blockedEntry = bc.entries
    .slice()
    .reverse()
    .find(e => e.step === step && e.status === 'blocked');

  if (!blockedEntry) {
    console.error(`❌  步骤 ${step} 不在 blocked 状态`);
    console.error('    recover 命令仅用于恢复 blocked 步骤。');
    console.error('    建议:');
    console.error('      - 如果步骤是 skipped，使用: docpath retry ' + step);
    console.error('      - 如果步骤需要重新开始，使用: docpath start ' + step);
    console.error('      - 运行: docpath status --agent 查看当前状态');
    process.exit(1);
  }

  // 记录 recovery intent
  await writeBreadcrumb(cwd, {
    taskId,
    step,
    status: 'in_progress',
    context: `recovery-recover: 从 blocked 恢复执行`,
    sessionId: session.sessionId,
  });

  console.log('');
  console.log('─── 恢复操作 ───');
  console.log(`📌  recovery_intent: recover`);
  console.log(`    step: ${step}`);
  console.log(`    previous_status: blocked`);
  console.log(`    task_id: ${taskId}`);
  console.log('');

  // 调用 go 重新启动步骤
  await goCommand({
    cwd,
    step,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  已从 blocked 恢复: ${step}`);
  console.log(`    recovery_intent: recover`);
  console.log(`    底层调用: writeBreadcrumb + docpath go --step ${step}`);
  console.log('');
}

interface RetryOptions {
  cwd: string;
  step: string;
  session?: string;
}

/**
 * docpath retry 命令实现
 *
 * 重试 skipped 或 failed 步骤
 */
export async function retryCommand(options: RetryOptions): Promise<void> {
  const { cwd, step } = options;
  const session = resolveSessionContext(options.session);

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法重试步骤: 当前没有已绑定的任务');
    console.error('    retry 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 运行: docpath status --agent 诊断当前状态');
    process.exit(1);
  }

  // 检查步骤是否 skipped
  const bc = await readBreadcrumb(cwd);
  const skippedEntry = bc.entries
    .slice()
    .reverse()
    .find(e => e.step === step && e.status === 'skipped');

  if (!skippedEntry) {
    console.error(`❌  步骤 ${step} 不在 skipped 状态`);
    console.error('    retry 命令仅用于重试 skipped 步骤。');
    console.error('    建议:');
    console.error('      - 如果步骤是 blocked，使用: docpath resume ' + step);
    console.error('      - 如果步骤需要重新开始，使用: docpath start ' + step);
    console.error('      - 运行: docpath status --agent 查看当前状态');
    process.exit(1);
  }

  // 记录 recovery intent
  await writeBreadcrumb(cwd, {
    taskId,
    step,
    status: 'in_progress',
    context: `recovery-retry: 重试 skipped 步骤`,
    sessionId: session.sessionId,
  });

  console.log('');
  console.log('─── 恢复操作 ───');
  console.log(`📌  recovery_intent: retry`);
  console.log(`    step: ${step}`);
  console.log(`    previous_status: skipped`);
  console.log(`    task_id: ${taskId}`);
  console.log('');

  // 调用 go 重新启动步骤
  await goCommand({
    cwd,
    step,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  已重试 skipped 步骤: ${step}`);
  console.log(`    recovery_intent: retry`);
  console.log(`    底层调用: writeBreadcrumb + docpath go --step ${step}`);
  console.log('');
}

interface UnblockOptions {
  cwd: string;
  step: string;
  session?: string;
}

/**
 * docpath unblock 命令实现
 *
 * 显式标记解除阻塞并重新开始步骤
 */
export async function unblockCommand(options: UnblockOptions): Promise<void> {
  const { cwd, step } = options;
  const session = resolveSessionContext(options.session);

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法解除阻塞: 当前没有已绑定的任务');
    console.error('    unblock 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 运行: docpath status --agent 诊断当前状态');
    process.exit(1);
  }

  // 记录 recovery intent（允许任何状态的步骤）
  await writeBreadcrumb(cwd, {
    taskId,
    step,
    status: 'in_progress',
    context: `recovery-unblock: 显式解除阻塞并重新开始`,
    sessionId: session.sessionId,
  });

  console.log('');
  console.log('─── 恢复操作 ───');
  console.log(`📌  recovery_intent: unblock`);
  console.log(`    step: ${step}`);
  console.log(`    task_id: ${taskId}`);
  console.log('');

  // 调用 go 重新启动步骤
  await goCommand({
    cwd,
    step,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  已解除阻塞并重新启动: ${step}`);
  console.log(`    recovery_intent: unblock`);
  console.log(`    底层调用: writeBreadcrumb + docpath go --step ${step}`);
  console.log('');
}
