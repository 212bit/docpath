/**
 * DocPath 状态机引擎
 * 
 * 定义四级复杂度模型的状态、转移规则和验证逻辑。
 * 文档 + 结构化状态即 FSM。
 *
 * 机器状态以 .docpath/workspace/state.json 为真源；current.md 是由
 * state.json 重建的人类渲染视图。任务 spec/plan 文档仍参与工作流约束，
 * 但运行时状态迁移不得由手写 Markdown 驱动。
 */

import {
  type ComplexityLevel,
  type EscalationState,
  type L0State,
  type L1State,
  type L2State,
  type L3State,
  type WorkflowState,
  type WorkflowPhase,
  type GateStatus,
  type WorkflowSnapshot,
  type RuntimeWorkflowState,
  VALID_WORKFLOW_STATES,
  normalizeWorkflowState,
  snapshotFromState,
  normalizeWorkflowPhase,
  normalizeGateStatus,
  stateFromPhaseGate,
  normalizeWorkflowSnapshot,
} from '../types/state.js';

export {
  type ComplexityLevel,
  type EscalationState,
  type L0State,
  type L1State,
  type L2State,
  type L3State,
  type WorkflowState,
  type WorkflowPhase,
  type GateStatus,
  type WorkflowSnapshot,
  type RuntimeWorkflowState,
  VALID_WORKFLOW_STATES,
  normalizeWorkflowState,
  snapshotFromState,
  normalizeWorkflowPhase,
  normalizeGateStatus,
  stateFromPhaseGate,
  normalizeWorkflowSnapshot,
};

/** 状态寄存器 — 持久化在 state.json 中，并渲染为 current.md 视图。 */
export interface StateRegister {
  level: ComplexityLevel;
  state: RuntimeWorkflowState;
  task_id: string | null;
  task_title: string;
  phase: string | null;
  started_at: string | null;
  updated_at: string | null;
  /** Escalation 评估状态（由 escalation engine 填充） */
  escalation?: EscalationState;
  /** 任务风险档位 R0–R3（R-338；缺省未评估，读取侧按 R1 兜底） */
  risk_tier?: number;
}

/** 默认状态寄存器 */
export function createDefaultState(): StateRegister {
  return {
    level: 0,
    state: 'idle',
    task_id: '',
    task_title: '',
    phase: 'idle',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Level 名称映射 */
export const LEVEL_NAMES: Record<ComplexityLevel, string> = {
  0: '即时响应',
  1: '轻量任务',
  2: '标准任务',
  3: '复杂任务',
};

/** Level 描述映射 */
export const LEVEL_DESCRIPTIONS: Record<ComplexityLevel, string> = {
  0: '1-2 步简单操作，无需文档，直接执行',
  1: '3-5 步，单文件改动，由 task.md 驱动',
  2: '多文件/模块，需调研和设计，由 spec → plan 驱动',
  3: '跨模块/跨会话/多人协作，含完整生命周期',
};
