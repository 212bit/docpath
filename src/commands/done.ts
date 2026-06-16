/**
 * docpath done — 任务完成的语义化命令
 *
 * 操作层包装，调用现有的 agent done 命令，保留完整的门禁序列：
 * - check: 质量检查
 * - review: 代码审查
 * - journal: 知识归档
 *
 * 不削弱任何门禁，只是提供更短的入口。
 */

import { agentCommand } from './agent.js';
import { readCurrentState, resolveBoundTaskId } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { isQuickProfile } from '../engine/workflow-profile.js';

interface DoneOptions {
  cwd: string;
  skipCheck?: boolean;
  skipReview?: boolean;
  skipTests?: boolean;
  skipLint?: boolean;
  approveReview?: boolean;
  note?: string;
  session?: string;
}

/**
 * docpath done 命令实现
 *
 * 语义化包装，调用底层 agent done 命令，保留所有门禁
 */
export async function doneCommand(options: DoneOptions): Promise<void> {
  const { cwd } = options;
  const session = resolveSessionContext(options.session);
  const stateAtStart = await readCurrentState(cwd);
  const quickProfile = isQuickProfile(stateAtStart?.workflow_profile);

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法完成任务: 当前没有已绑定的任务');
    console.error('    done 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 运行: docpath status --agent 诊断当前状态');
    process.exit(1);
  }

  // 调用底层 agent done 命令（保留所有门禁序列）
  await agentCommand({
    cwd,
    action: 'done',
    skipCheck: options.skipCheck,
    skipReview: options.skipReview,
    skipTests: options.skipTests,
    skipLint: options.skipLint,
    approveReview: options.approveReview,
    note: options.note,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  任务完成流程已执行: ${taskId}`);
  console.log(`    session: ${session.sessionId}`);
  console.log(`    底层调用: docpath agent done`);
  const gates: string[] = [];
  if (!options.skipCheck) gates.push('check');
  if (!options.skipReview && !quickProfile) gates.push('review');
  gates.push('journal');
  console.log(`    门禁序列: ${gates.join(' → ')}`);
  if (options.skipCheck) {
    console.log(`    跳过 check: ${options.note || '(未提供原因)'}`);
  }
  if (options.skipReview) {
    console.log(`    跳过 review: ${options.note || '(未提供原因)'}`);
  } else if (quickProfile) {
    console.log('    跳过 review: quick profile policy');
  }
  console.log('');
}
