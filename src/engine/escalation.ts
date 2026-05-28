/**
 * Escalation Engine — 融合信号源自动触发级别升级
 *
 * 信号源：
 *   1. 维度: evaluateComplexity() → recommendedLevel
 *   2. 状态: state-machine 定义的必经状态
 *   3. 定时器: 任务持续时间超阈值
 *
 * 写入 .docpath/workspace/current.md 的 escalation_log 区块。
 */

import { evaluateComplexity, type ComplexityVerdict } from './complexity.js';
import { LEVEL_NAMES, LEVEL_TRANSITIONS, type ComplexityLevel, type WorkflowState, canTransition } from './state-machine.js';

export interface EscalationSignal {
  /** 信号类型 */
  type: 'dimension' | 'state' | 'timer';
  /** 推荐级别 */
  recommendedLevel: ComplexityLevel;
  /** 置信度 0-1 */
  confidence: number;
  /** 原因描述 */
  reason: string;
  /** 时间戳 */
  timestamp: string;
}

export interface EscalationDecision {
  /** 融合后推荐的最终级别 */
  finalLevel: ComplexityLevel;
  /** 所有信号 */
  signals: EscalationSignal[];
  /** 触发动作 */
  action: 'auto_upgrade' | 'prompt_user' | 'no_change';
  /** 决策原因 */
  reason: string;
}

/** Level 配置：每级的必经状态 */
const LEVEL_CONFIG: Record<ComplexityLevel, { mandatoryStates: string[] }> = {
  0: { mandatoryStates: [] },
  1: { mandatoryStates: ['defined', 'executing', 'completed'] },
  2: { mandatoryStates: ['defined', 'spec_generated', 'plan_approved', 'peer_reviewed', 'executing', 'completed'] },
  3: { mandatoryStates: ['defined', 'spec_generated', 'plan_approved', 'peer_reviewed', 'executing', 'completed'] },
};

/**
 * 维度信号：基于任务描述的复杂度评估
 */
export function dimensionSignal(taskDescription: string): EscalationSignal {
  const eval_ = evaluateComplexity(taskDescription);
  return {
    type: 'dimension',
    recommendedLevel: eval_.level,
    confidence: 0.8,
    reason: eval_.reason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 状态信号：检查当前状态机是否存在违反必经状态路径的情况
 *
 * 例如：当前任务从 brainstorming 直接跳到 executing（跳过了 spec_written 和 planning_done），
 * 则发出警告信号。
 */
export function stateSignal(currentLevel: ComplexityLevel, currentState: string): EscalationSignal {
  const levelConfig = LEVEL_CONFIG[currentLevel];

  if (!levelConfig) {
    return {
      type: 'state',
      recommendedLevel: currentLevel,
      confidence: 0.0,
      reason: `Unknown level: ${currentLevel}`,
      timestamp: new Date().toISOString(),
    };
  }

  // 检查必经状态路径
  const mandatoryStates = levelConfig.mandatoryStates;
  const currentIdx = mandatoryStates.indexOf(currentState as any);

  if (currentIdx === -1) {
    // 当前状态不在必经路径中，可能是可选状态，不影响升级
    return {
      type: 'state',
      recommendedLevel: currentLevel,
      confidence: 0.3,
      reason: `状态 "${currentState}" 不在 L${currentLevel} 必经路径中`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    type: 'state',
    recommendedLevel: currentLevel,
    confidence: 0.5,
    reason: `当前状态 ${currentState} 是 L${currentLevel} 必经路径第 ${currentIdx + 1}/${mandatoryStates.length} 步`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 定时器信号：任务持续时间超阈值
 *
 * 阈值由级别决定：
 *   L0: 无超时
 *   L1: 30 分钟
 *   L2: 2 小时
 *   L3: 24 小时（日报/周报节奏）
 */
export function timerSignal(
  currentLevel: ComplexityLevel,
  taskStartedAt: string | null,
): EscalationSignal {
  if (!taskStartedAt || currentLevel === 0) {
    return {
      type: 'timer',
      recommendedLevel: currentLevel,
      confidence: 0.0,
      reason: '无开始时间或 L0 无超时',
      timestamp: new Date().toISOString(),
    };
  }

  const THRESHOLDS_MS: Record<ComplexityLevel, number> = {
    0: Infinity,
    1: 30 * 60 * 1000,       // 30 min
    2: 2 * 60 * 60 * 1000,   // 2 hours
    3: 24 * 60 * 60 * 1000,  // 24 hours
  };

  const started = new Date(taskStartedAt).getTime();
  const elapsed = Date.now() - started;
  const threshold = THRESHOLDS_MS[currentLevel];

  if (elapsed > threshold) {
    return {
      type: 'timer',
      recommendedLevel: Math.min(currentLevel + 1, 3) as ComplexityLevel,
      confidence: 0.7,
      reason: `任务已运行 ${Math.round(elapsed / 60000)} 分钟，超过 L${currentLevel} 阈值 ${Math.round(threshold / 60000)} 分钟`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    type: 'timer',
    recommendedLevel: currentLevel,
    confidence: 0.2,
    reason: `任务运行 ${Math.round(elapsed / 60000)} 分钟，未超阈值 ${Math.round(threshold / 60000)} 分钟`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 融合所有信号，做出升级决策
 */
export function fuseSignals(signals: EscalationSignal[]): EscalationDecision {
  if (signals.length === 0) {
    return {
      finalLevel: 0,
      signals: [],
      action: 'no_change',
      reason: '无信号输入',
    };
  }

  // 加权投票：confidence 加权级别
  let weightedSum = 0;
  let totalWeight = 0;

  for (const sig of signals) {
    weightedSum += sig.recommendedLevel * sig.confidence;
    totalWeight += sig.confidence;
  }

  const avgLevel = totalWeight > 0 ? weightedSum / totalWeight : 0;
  // 四舍五入到最近整数，但至少取信号中的最高级别
  const maxSignalLevel = Math.max(...signals.map((s) => s.recommendedLevel));
  const fusedLevel = Math.min(
    Math.max(Math.round(avgLevel), maxSignalLevel),
    3,
  ) as ComplexityLevel;

  // 决策逻辑
  const currentLevel = signals[0]?.recommendedLevel ?? 0;
  if (fusedLevel > currentLevel) {
    return {
      finalLevel: fusedLevel,
      signals,
      action: 'auto_upgrade',
      reason: `信号融合推荐升级到 L${fusedLevel}（维度加权平均: ${avgLevel.toFixed(1)}，信号最高级: L${maxSignalLevel}）`,
    };
  }

  // 如果有高置信度的维度信号且高于当前级别，提示用户
  const highConfDimSignal = signals.find(
    (s) => s.type === 'dimension' && s.confidence > 0.6 && s.recommendedLevel > currentLevel,
  );
  if (highConfDimSignal) {
    return {
      finalLevel: highConfDimSignal.recommendedLevel,
      signals,
      action: 'prompt_user',
      reason: `高置信度维度信号建议升级到 L${highConfDimSignal.recommendedLevel}，需用户确认`,
    };
  }

  return {
    finalLevel: currentLevel,
    signals,
    action: 'no_change',
    reason: '信号融合未触发升级',
  };
}

/**
 * 执行完整的升级评估流程
 *
 * @param taskDescription 任务描述文本
 * @param currentLevel 当前级别
 * @param currentState 当前状态
 * @param taskStartedAt 任务开始时间 (ISO string)
 */
export function evaluateEscalation(
  taskDescription: string,
  currentLevel: ComplexityLevel,
  currentState: string,
  taskStartedAt: string | null,
): EscalationDecision {
  const signals: EscalationSignal[] = [
    dimensionSignal(taskDescription),
    stateSignal(currentLevel, currentState),
    timerSignal(currentLevel, taskStartedAt),
  ];

  return fuseSignals(signals);
}
