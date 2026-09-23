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
import { resolveGatePolicy, isQuickProfile, isInstantProfile, normalizeWorkflowProfile } from '../engine/workflow-profile.js';
import { isInWorktree } from '../utils/worktree.js';
import { exitWithError } from '../utils/error-helpers.js';
import { detectUncommittedNonDocPathFiles, renderCommitReminder } from '../utils/git-dirty-guard.js';
import { commitCommand } from './commit.js';

export interface DoneOptions {
  cwd: string;
  skipCheck?: boolean;
  skipReview?: boolean;
  skipTests?: boolean;
  skipLint?: boolean;
  approveReview?: boolean;
  note?: string;
  session?: string;
  noDirtyReminder?: boolean;
  commit?: boolean;
  testScope?: 'full' | 'touched';
  allTests?: boolean;
  fix?: boolean;
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
  const profile = normalizeWorkflowProfile(stateAtStart?.workflow_profile);
  const quickProfile = isQuickProfile(profile);
  const instantProfile = isInstantProfile(profile);
  // R-338: 门禁策略按风险档位取地板（缺省 R1 时与原 gatePolicyForProfile 等价）
  const policy = resolveGatePolicy({ profile, riskTier: stateAtStart?.risk_tier }).policy;

  // 前置检查：必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    exitWithError('NO_ACTIVE_TASK');
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
    noDirtyReminder: options.noDirtyReminder,
    testScope: options.testScope,
    allTests: options.allTests,
    fix: options.fix,
  });

  const { nonDocPathFiles, count } = detectUncommittedNonDocPathFiles(cwd);
  if (count > 0 && !options.noDirtyReminder) {
    console.warn(renderCommitReminder(nonDocPathFiles));
  }

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  任务完成流程已执行: ${taskId}`);
  console.log(`    session: ${session.sessionId}`);
  console.log(`    workflow_profile: ${profile}`);
  console.log(`    gate_policy: spec=${policy.requiresSpec}, plan=${policy.requiresPlan}, check=${policy.liteCheck ? 'lite' : policy.requiresCheck}, review=${policy.requiresReview}, journal=${policy.journalMode}`);
  console.log(`    未提交业务文件: ${count}`);
  console.log(`    底层调用: docpath agent done`);
  const gates: string[] = [];
  if (!options.skipCheck) gates.push(instantProfile ? 'check(lite)' : 'check');
  if (!options.skipReview && !quickProfile && !instantProfile) gates.push('review');
  gates.push('journal');
  console.log(`    门禁序列: ${gates.join(' → ')}`);
  if (options.skipCheck) {
    console.log(`    跳过 check: ${options.note || '(未提供原因)'}`);
  }
  if (options.skipReview) {
    console.log(`    跳过 review: ${options.note || '(未提供原因)'}`);
  } else if (instantProfile) {
    console.log('    跳过 review: instant profile policy (lite check 已跑)');
  } else if (quickProfile) {
    console.log('    跳过 review: quick profile policy');
  }
  console.log('');

  if (isInWorktree(cwd)) {
    const worktreeName = cwd.split(/[\\/]/).filter(Boolean).at(-1) || 'worktree';
    console.log('🌳  检测到您当前处于 Git Worktree 环境。');
    console.log(`    当该分支代码合并入 main 后，您可在主仓库中运行以下命令清理工作区和分支：`);
    console.log(`      docpath worktree remove ${worktreeName}`);
    console.log('    或者在主仓库中运行 `docpath worktree prune` 自动清理所有已合并的 worktree。');
    console.log('');
  }

  if (options.commit) {
    console.log('🚀  --commit 已启用，自动将任务改动提交至本地 Git...\n');
    await commitCommand({
      cwd,
      stage: true,
      autoMessage: true,
    });
  }
}
