/**
 * current-step 推断逻辑
 *
 * 用于操作层命令在不传 --step 时自动推断当前步骤。
 * 设计原则：只在唯一确定时推断，ambiguous 时返回 null 并 fail-loud。
 */

import { readCurrentState } from './workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { readActiveTaskFile } from './task-files.js';
import { parsePlanSteps } from './doc-parser.js';

export interface StepInferenceResult {
  /** 推断出的步骤 ID，null 表示无法推断 */
  step: string | null;
  /** 推断失败的原因（用于错误提示） */
  reason?: string;
  /** 推断上下文（用于诊断） */
  context?: {
    stateCurrentStep?: string;
    breadcrumbLastInProgress?: string;
    planSteps: string[];
  };
}

/**
 * 推断当前步骤
 *
 * 逻辑：
 * 1. 如果 explicitStep 存在，直接返回
 * 2. 读取 state.current_step 和 breadcrumb 的最后一个 in_progress 步骤
 * 3. 两者必须一致且步骤存在于 plan 中
 * 4. 任何不一致或不确定情况返回 null
 */
export async function resolveCurrentStep(
  cwd: string,
  taskId: string | undefined,
  explicitStep?: string,
): Promise<StepInferenceResult> {
  // 显式传了 step → 直接使用
  if (explicitStep?.trim()) {
    return { step: explicitStep.trim() };
  }

  // 读取状态
  const state = await readCurrentState(cwd);
  const bc = await readBreadcrumb(cwd);

  // 读取 plan 步骤列表
  const docpathDir = await resolveDocpathDir(cwd);
  let planSteps: string[] = [];
  try {
    const planContent = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
    if (planContent.trim()) {
      const tasks = parsePlanSteps(planContent);
      planSteps = tasks.map(t => t.id);
    }
  } catch {
    // plan 不存在或无法读取
  }

  const stateCurrentStep = state?.current_step?.trim();
  const lastInProgressFromBc = bc.entries
    .slice()
    .reverse()
    .find(e => e.status === 'in_progress')?.step?.trim();

  const context = {
    stateCurrentStep,
    breadcrumbLastInProgress: lastInProgressFromBc,
    planSteps,
  };

  // 检查 state.current_step 是否是有效步骤 ID（不是错误信息）
  const isValidStepId = (step: string | undefined): boolean => {
    if (!step) return false;
    // 有效的步骤 ID 格式：S1, S2, check, review 等
    // 错误信息通常包含空格、中文、冒号等
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(step) && step.length < 30;
  };

  const validStateStep = isValidStepId(stateCurrentStep) ? stateCurrentStep : undefined;

  // 两个来源都没有 → 无法推断
  if (!validStateStep && !lastInProgressFromBc) {
    return {
      step: null,
      reason: '无进行中的步骤',
      context,
    };
  }

  // 两个来源都有，但不一致 → 优先使用 breadcrumb
  // 因为 state.current_step 可能被 check/review 失败污染
  if (validStateStep && lastInProgressFromBc && validStateStep !== lastInProgressFromBc) {
    // 如果 breadcrumb 的步骤在 plan 中，优先使用它
    if (planSteps.length === 0 || planSteps.some(id => id.toLowerCase() === lastInProgressFromBc.toLowerCase())) {
      return {
        step: lastInProgressFromBc,
        context: {
          ...context,
          stateCurrentStep: `${stateCurrentStep} (已忽略，使用 breadcrumb)`,
        },
      };
    }

    return {
      step: null,
      reason: `state.current_step (${validStateStep}) 与 breadcrumb 最后 in_progress (${lastInProgressFromBc}) 不一致`,
      context,
    };
  }

  // 推断出的步骤：优先使用 breadcrumb
  const inferredStep = lastInProgressFromBc || validStateStep;
  if (!inferredStep) {
    return {
      step: null,
      reason: '无法确定当前步骤',
      context,
    };
  }

  // 验证步骤存在于 plan 中
  if (planSteps.length > 0 && !planSteps.some(id => id.toLowerCase() === inferredStep.toLowerCase())) {
    return {
      step: null,
      reason: `推断的步骤 ${inferredStep} 不在 plan 中`,
      context,
    };
  }

  // 唯一确定
  return {
    step: inferredStep,
    context,
  };
}

/**
 * 描述步骤推断失败的上下文（用于错误提示）
 */
export function describeStepAmbiguity(result: StepInferenceResult): string {
  if (!result.context) return '无法推断当前步骤';

  const lines: string[] = [
    '推断上下文:',
    `  state.current_step: ${result.context.stateCurrentStep || '(无)'}`,
    `  breadcrumb.last_in_progress: ${result.context.breadcrumbLastInProgress || '(无)'}`,
    `  plan.steps: [${result.context.planSteps.join(', ') || '(无)'}]`,
  ];

  if (result.reason) {
    lines.push('');
    lines.push(`原因: ${result.reason}`);
  }

  return lines.join('\n');
}
