/** 工作流门禁策略。 */

import { appendDecision } from '../utils/decisions.js';
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
    : ['check_pass', 'review_pass', 'review_skipped', 'check_env_exempt'];

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

/**
 * R-350: 环境豁免（check_env_exempt）的审计留痕。
 *
 * 与 recordSkipReason 的区别：skip 是"用户显式跳过门禁"，豁免是"门禁跑了，
 * 但全部失败项都被确定性判定为工具链不可用"。留痕必须能回答"到底哪些检查没通过、
 * 原始报错是什么、判定依据是哪一类"，否则豁免就退化成无痕放行。
 */
export async function recordEnvExemption(
  cwd: string,
  failures: Array<{ name: string; output?: string; command?: string }>,
): Promise<void> {
  const details = failures.map((failure) => {
    const firstLine = (failure.output || '').split('\n').map((line) => line.trim()).find((line) => line.length > 0);
    const origin = /command not found|not recognized as|spawn.*ENOENT|Permission denied|EACCES/i.test(failure.output || '')
      ? 'toolchain-output'
      : 'runner-probe';
    return `- ${failure.name} [${origin}]${failure.command ? ` (${failure.command})` : ''}: ${firstLine || '无输出'}`;
  });
  await appendDecision(
    cwd,
    'policy.env_exempt',
    `环境豁免 ${failures.length} 项检查`,
    [
      'check 的全部失败项均为确定性可证的工具链不可用（探针失败或命令不存在/不可执行），',
      '按 R-350 落 gate=check_env_exempt 而非 check_fail，允许继续 review/归档。',
      '豁免项与判定依据:',
      ...details,
      '恢复动作: 修复环境后重跑 `docpath check`（豁免非粘性，下次真实失败立即回落 check_fail）。',
      '如需按失败处理: `docpath check --no-env-exempt`。',
    ].join('\n'),
  );
}

/**
 * R-338 S4: check 期风险复评升级的审计留痕。
 * 只在 evaluated tier 超过已记录基线时调用（只升不降）。
 */
export async function recordRiskEscalation(
  cwd: string,
  fromTier: number,
  toTier: number,
  reasons: string[],
): Promise<void> {
  await appendDecision(
    cwd,
    'risk.escalation',
    `check 风险复评升级 R${fromTier} → R${toTier}`,
    reasons.length > 0 ? reasons.join('\n') : '基于实际 diff 的确定性风险复评',
  );
}
