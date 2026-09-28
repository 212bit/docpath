/**
 * docpath session watchdog — 会话轮换与 Token 防膨胀看门狗（R-437）
 *
 * 核心目标：
 * 阻断长会话中 LLM 历史上下文累积导致的 O(N^2) 输入 Token 平方级爆炸。
 * 当检测到当前任务步骤跨度较深或历史事件过多时，在 `docpath next --agent`
 * 中发出 `rotate_recommended` 信号，并生成开箱即用的 Worker Subagent 提示词。
 */

export interface SessionWatchdogReport {
  status: 'healthy' | 'rotate_recommended';
  reason?: string;
  recommended_action?: string;
  subagent_prompt?: string;
  metrics?: {
    breadcrumb_events: number;
    completed_steps: number;
    total_steps: number;
    uncommitted_files: number;
  };
}

export interface SessionWatchdogInput {
  phase?: string;
  taskId?: string;
  currentStep?: { id: string; title: string };
  planTasks?: Array<{ id: string; title: string; done: boolean }>;
  breadcrumbEventCount?: number;
  uncommittedFilesCount?: number;
}

/**
 * 触发会话轮换的阈值常量
 */
export const SESSION_WATCHDOG_THRESHOLDS = {
  /** 单任务内 breadcrumb 事件达到此数值建议轮换 */
  MAX_SAFE_BREADCRUMB_EVENTS: 6,
  /** 计划步骤中已完成步骤数达到此数值且仍有后续步骤时建议轮换 */
  MAX_CONSECUTIVE_STEPS: 2,
};

export function evaluateSessionWatchdog(input: SessionWatchdogInput): SessionWatchdogReport {
  const {
    phase = '',
    currentStep,
    planTasks = [],
    breadcrumbEventCount = 0,
    uncommittedFilesCount = 0,
  } = input;

  const totalSteps = planTasks.length;
  const completedSteps = planTasks.filter((t) => t.done).length;
  const metrics = {
    breadcrumb_events: breadcrumbEventCount,
    completed_steps: completedSteps,
    total_steps: totalSteps,
    uncommitted_files: uncommittedFilesCount,
  };

  // 仅在执行中 (executing) 阶段进行活跃轮换评估
  if (phase !== 'executing') {
    return { status: 'healthy', metrics };
  }

  const reasons: string[] = [];

  if (breadcrumbEventCount >= SESSION_WATCHDOG_THRESHOLDS.MAX_SAFE_BREADCRUMB_EVENTS) {
    reasons.push(`当前任务已累积 ${breadcrumbEventCount} 条执行事件，历史上下文可能已膨胀`);
  }

  if (completedSteps >= SESSION_WATCHDOG_THRESHOLDS.MAX_CONSECUTIVE_STEPS && totalSteps > completedSteps) {
    reasons.push(`已连续完成 ${completedSteps} 个步骤，当前会话面临 O(N^2) 输入 Token 累积风险`);
  }

  if (reasons.length > 0) {
    const stepLabel = currentStep ? `${currentStep.id} (${currentStep.title || '当前步骤'})` : '下一步骤';
    const subagentPrompt = currentStep
      ? `请作为 Worker Subagent 独立执行步骤 ${currentStep.id}: ${currentStep.title || ''}。请先读取 .docpath/workspace/wip-note.md 获取最新上下文，完成定向编码与单测自验后运行 docpath step-pass 收尾。`
      : '请作为 Worker Subagent 独立执行当前步骤。请先读取 .docpath/workspace/wip-note.md 获取最新上下文，完成定向编码与单测自验后运行 docpath step-pass 收尾。';

    return {
      status: 'rotate_recommended',
      reason: reasons.join('；'),
      recommended_action: `使用 invoke_subagent 派发独立 Worker 子代理执行 ${stepLabel}，或新开会话后运行 docpath next --agent`,
      subagent_prompt: subagentPrompt,
      metrics,
    };
  }

  return {
    status: 'healthy',
    metrics,
  };
}
