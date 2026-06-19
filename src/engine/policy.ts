/** 工作流门禁策略。 */

import { appendDecision } from '../governance/decisions.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { readLastCheckEvidence } from '../utils/workspace-evidence.js';

export interface PolicyVerdict {
  allowed: boolean;
  reasons: string[];
}

export interface CompletionPolicyOptions {
  requireReview?: boolean;
}

export async function evaluateCompletionPolicy(
  cwd: string,
  options: CompletionPolicyOptions = {},
): Promise<PolicyVerdict> {
  const reasons: string[] = [];
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const lastCheck = await readLastCheckEvidence(docpathDir);

  if (!state) reasons.push('缺少 workflow state，请先运行 docpath init');
  if (!lastCheck) reasons.push('缺少 last-check.md，请先运行 docpath check');
  if (lastCheck && !lastCheck.passed) reasons.push('last-check.md 未显示 PASS，请先修复检查失败项');

  if (state?.gate === 'check_fail') reasons.push('当前 gate 为 check_fail，不能完成任务');
  const allowedCompletionGates = options.requireReview
    ? ['check_pass', 'review_pass']
    : ['check_pass', 'review_pass', 'review_skipped'];

  if (state && !allowedCompletionGates.includes(state.gate) && state.phase !== 'completed') {
    reasons.push(`当前 gate 为 ${state.gate}，需要 check_pass${options.requireReview ? ' / review_pass' : ''}`);
  }
  if (options.requireReview && state?.gate !== 'review_pass' && state?.phase !== 'completed') {
    reasons.push('当前任务要求 review_pass 后才能完成');
  }

  return { allowed: reasons.length === 0, reasons };
}

export async function recordSkipReason(
  cwd: string,
  gate: 'check' | 'review',
  reason: string,
): Promise<void> {
  await appendDecision(
    cwd,
    'policy.skip',
    `跳过 ${gate}`,
    reason || `用户显式使用 --skip-${gate}`,
  );
}
