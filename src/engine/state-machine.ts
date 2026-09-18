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

// ─── 类型定义 ───────────────────────────────────────────

export type ComplexityLevel = 0 | 1 | 2 | 3;

/** Escalation 决策状态 */
export interface EscalationState {
  /** 当前推荐级别 */
  recommendedLevel: ComplexityLevel;
  /** 决策原因 */
  reason: string;
  /** 触发信号类型 */
  signals: string[];
  /** 建议动作 */
  action: 'auto_escalate' | 'prompt_user' | 'none';
  /** 评估时间 */
  evaluatedAt: string;
}



/** Level 0 状态 — 即时响应 */
export type L0State = 'idle' | 'executing' | 'completed';

/** @deprecated L1 状态仅供入门示例，新流程应使用 L2/L3。保留兼容但不再用于新逻辑。 */
export type L1State = 'idle' | 'executing' | 'completed';

/** Level 2 状态 — 标准任务 */
export type L2State =
  | 'idle'
  | 'brainstorming'
  | 'spec_written'
  | 'planning'
  | 'executing'
  | 'checking'
  | 'reviewing'
  | 'journaling'
  | 'completed';

/** Level 3 状态 — 复杂任务（预留扩展） */
export type L3State = L2State | 'researching' | 'designing' | 'subagent_coordinating';

export type WorkflowState = L0State | L1State | L2State | L3State;

/** 工作流阶段：描述任务当前处于生命周期的哪一段。 */
export type WorkflowPhase =
  | 'idle'
  | 'drafting'
  | 'planning'
  | 'executing'
  | 'checking'
  | 'reviewing'
  | 'journaling'
  | 'completed';

/** 门禁状态：描述最近一次质量/审查/阻塞证据。 */
export type GateStatus =
  | 'none'
  | 'check_pass'
  | 'check_fail'
  | 'review_pass'
  | 'review_skipped'
  | 'review_fail'
  | 'blocked';

/** 新版状态快照。state 仅作为旧调用方兼容字段。 */
export interface WorkflowSnapshot {
  phase: WorkflowPhase;
  gate: GateStatus;
  state: RuntimeWorkflowState;
}

/**
 * DocPath 持久化状态集合。
 *
 * WorkflowState 描述规约状态机的主干状态；RuntimeWorkflowState 是 CLI
 * 实际写入 state.json 的状态全集，包含检查/审查等门禁结果状态。
 */
export type RuntimeWorkflowState =
  | WorkflowState
  | 'uninitialized'
  | 'drafting'
  | 'task_created'
  | 'planning_done'
  | 'ready'
  | 'in_progress'
  | 'verifying'
  | 'check_pass'
  | 'check_fail'
  | 'review_pass'
  | 'review_skipped'
  | 'build_pass'
  | 'blocked'
  | 'archived';

export const VALID_WORKFLOW_STATES = new Set<RuntimeWorkflowState>([
  'idle',
  'uninitialized',
  'drafting',
  'task_created',
  'brainstorming',
  'spec_written',
  'planning',
  'planning_done',
  'ready',
  'in_progress',
  'executing',
  'verifying',
  'checking',
  'check_pass',
  'check_fail',
  'reviewing',
  'review_pass',
  'review_skipped',
  'build_pass',
  'blocked',
  'journaling',
  'completed',
  'archived',
  'researching',
  'designing',
  'subagent_coordinating',
]);

/** 将旧版或外部协议状态归一化为持久化状态全集中的值。 */
export function normalizeWorkflowState(state: string): RuntimeWorkflowState | null {
  return VALID_WORKFLOW_STATES.has(state as RuntimeWorkflowState)
    ? state as RuntimeWorkflowState
    : null;
}

const STATE_TO_SNAPSHOT: Record<RuntimeWorkflowState, WorkflowSnapshot> = {
  idle: { phase: 'idle', gate: 'none', state: 'idle' },
  uninitialized: { phase: 'idle', gate: 'none', state: 'uninitialized' },
  drafting: { phase: 'drafting', gate: 'none', state: 'drafting' },
  task_created: { phase: 'drafting', gate: 'none', state: 'task_created' },
  brainstorming: { phase: 'drafting', gate: 'none', state: 'brainstorming' },
  spec_written: { phase: 'drafting', gate: 'none', state: 'spec_written' },
  planning: { phase: 'planning', gate: 'none', state: 'planning' },
  planning_done: { phase: 'planning', gate: 'none', state: 'planning_done' },
  ready: { phase: 'planning', gate: 'none', state: 'ready' },
  in_progress: { phase: 'executing', gate: 'none', state: 'in_progress' },
  executing: { phase: 'executing', gate: 'none', state: 'executing' },
  verifying: { phase: 'checking', gate: 'none', state: 'verifying' },
  checking: { phase: 'checking', gate: 'none', state: 'checking' },
  check_pass: { phase: 'checking', gate: 'check_pass', state: 'check_pass' },
  check_fail: { phase: 'checking', gate: 'check_fail', state: 'check_fail' },
  // R-349: blocked 是可被 agent.blocked 事件写入的一等状态——任务因阻塞停止，
  // 阶段回到 executing（工作未完成），gate=blocked 阻断归档（失败/阻塞态不得归档）。
  blocked: { phase: 'executing', gate: 'blocked', state: 'blocked' },
  reviewing: { phase: 'reviewing', gate: 'check_pass', state: 'reviewing' },
  review_pass: { phase: 'reviewing', gate: 'review_pass', state: 'review_pass' },
  review_skipped: { phase: 'reviewing', gate: 'review_skipped', state: 'review_skipped' },
  build_pass: { phase: 'checking', gate: 'check_pass', state: 'build_pass' },
  journaling: { phase: 'journaling', gate: 'review_pass', state: 'journaling' },
  completed: { phase: 'completed', gate: 'review_pass', state: 'completed' },
  archived: { phase: 'completed', gate: 'review_pass', state: 'archived' },
  researching: { phase: 'drafting', gate: 'none', state: 'researching' },
  designing: { phase: 'planning', gate: 'none', state: 'designing' },
  subagent_coordinating: { phase: 'executing', gate: 'none', state: 'subagent_coordinating' },
};

const PHASE_GATE_TO_STATE: Record<WorkflowPhase, Partial<Record<GateStatus, RuntimeWorkflowState>>> = {
  idle: { none: 'idle', blocked: 'blocked' },
  drafting: { none: 'drafting', blocked: 'blocked' },
  planning: { none: 'planning_done', blocked: 'blocked' },
  executing: { none: 'executing', blocked: 'blocked' },
  checking: { none: 'checking', check_pass: 'check_pass', check_fail: 'check_fail', blocked: 'blocked' },
  reviewing: { none: 'reviewing', check_pass: 'reviewing', review_pass: 'review_pass', review_skipped: 'review_skipped', review_fail: 'check_fail', blocked: 'blocked' },
  journaling: { none: 'journaling', review_pass: 'journaling', review_skipped: 'journaling', blocked: 'blocked' },
  completed: { none: 'completed', check_pass: 'completed', review_pass: 'completed', review_skipped: 'completed' },
};

export function snapshotFromState(state: string): WorkflowSnapshot | null {
  const normalized = normalizeWorkflowState(state);
  return normalized ? STATE_TO_SNAPSHOT[normalized] : null;
}

export function normalizeWorkflowPhase(phase: string): WorkflowPhase | null {
  const valid: WorkflowPhase[] = ['idle', 'drafting', 'planning', 'executing', 'checking', 'reviewing', 'journaling', 'completed'];
  return valid.includes(phase as WorkflowPhase) ? phase as WorkflowPhase : null;
}

export function normalizeGateStatus(gate: string): GateStatus | null {
  const valid: GateStatus[] = ['none', 'check_pass', 'check_fail', 'review_pass', 'review_skipped', 'review_fail', 'blocked'];
  return valid.includes(gate as GateStatus) ? gate as GateStatus : null;
}

export function stateFromPhaseGate(phase: WorkflowPhase, gate: GateStatus): RuntimeWorkflowState {
  return PHASE_GATE_TO_STATE[phase][gate] || PHASE_GATE_TO_STATE[phase].none || phase;
}

export function normalizeWorkflowSnapshot(input: {
  state?: string;
  phase?: string;
  gate?: string;
}): WorkflowSnapshot | null {
  const phase = input.phase ? normalizeWorkflowPhase(input.phase) : null;
  const gate = input.gate ? normalizeGateStatus(input.gate) : null;

  if (phase) {
    const normalizedGate = gate || snapshotFromState(input.state || '')?.gate || 'none';
    return { phase, gate: normalizedGate, state: stateFromPhaseGate(phase, normalizedGate) };
  }

  if (input.state) return snapshotFromState(input.state);
  return null;
}

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
