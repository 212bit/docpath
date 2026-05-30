/**
 * DocPath 状态机引擎
 * 
 * 定义四级复杂度模型的状态、转移规则和验证逻辑。
 * 文档即 FSM — 所有状态由 .docpath/workspace/current.md 驱动。
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

/** Level 1 状态 — 轻量任务 */
export type L1State = 'idle' | 'task_created' | 'executing' | 'verifying' | 'completed';

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
  | 'planning_done'
  | 'ready'
  | 'in_progress'
  | 'check_pass'
  | 'check_fail'
  | 'review_pass'
  | 'build_pass'
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
  'build_pass',
  'journaling',
  'completed',
  'archived',
  'researching',
  'designing',
  'subagent_coordinating',
]);

const STATE_ALIASES: Record<string, RuntimeWorkflowState> = {
  spec_generated: 'spec_written',
  plan_approved: 'planning_done',
  peer_reviewed: 'review_pass',
  defined: 'drafting',
};

/** 将旧版或外部协议状态归一化为持久化状态全集中的值。 */
export function normalizeWorkflowState(state: string): RuntimeWorkflowState | null {
  const normalized = STATE_ALIASES[state] || state;
  return VALID_WORKFLOW_STATES.has(normalized as RuntimeWorkflowState)
    ? normalized as RuntimeWorkflowState
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
  reviewing: { phase: 'reviewing', gate: 'check_pass', state: 'reviewing' },
  review_pass: { phase: 'reviewing', gate: 'review_pass', state: 'review_pass' },
  build_pass: { phase: 'checking', gate: 'check_pass', state: 'build_pass' },
  journaling: { phase: 'journaling', gate: 'review_pass', state: 'journaling' },
  completed: { phase: 'completed', gate: 'review_pass', state: 'completed' },
  archived: { phase: 'completed', gate: 'review_pass', state: 'archived' },
  researching: { phase: 'drafting', gate: 'none', state: 'researching' },
  designing: { phase: 'planning', gate: 'none', state: 'designing' },
  subagent_coordinating: { phase: 'executing', gate: 'none', state: 'subagent_coordinating' },
};

const PHASE_GATE_TO_STATE: Record<WorkflowPhase, Partial<Record<GateStatus, RuntimeWorkflowState>>> = {
  idle: { none: 'idle', blocked: 'check_fail' },
  drafting: { none: 'drafting', blocked: 'check_fail' },
  planning: { none: 'planning_done', blocked: 'check_fail' },
  executing: { none: 'executing', blocked: 'check_fail' },
  checking: { none: 'checking', check_pass: 'check_pass', check_fail: 'check_fail', blocked: 'check_fail' },
  reviewing: { none: 'reviewing', check_pass: 'reviewing', review_pass: 'review_pass', review_fail: 'check_fail', blocked: 'check_fail' },
  journaling: { none: 'journaling', review_pass: 'journaling', blocked: 'check_fail' },
  completed: { none: 'completed', check_pass: 'completed', review_pass: 'completed' },
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
  const valid: GateStatus[] = ['none', 'check_pass', 'check_fail', 'review_pass', 'review_fail', 'blocked'];
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

/** 状态寄存器 — 持久化在 current.md 中 */
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
}

/** 状态转移规则 */
export interface Transition {
  from: WorkflowState[];
  to: WorkflowState;
  description: string;
  /** 转移所需的检查条件描述 */
  guard?: string;
}

// ─── Level 2 转移定义（需提取为变量避免对象自引用） ────

const LEVEL_2_TRANSITIONS: Transition[] = [
  { from: ['idle'], to: 'brainstorming', description: '需求模糊，进入拷问' },
  { from: ['brainstorming'], to: 'spec_written', description: '需求澄清，输出 spec.md' },
  { from: ['brainstorming'], to: 'idle', description: '需求被否决或搁置' },
  { from: ['spec_written'], to: 'planning', description: '基于 spec 制定 plan.md' },
  { from: ['planning'], to: 'executing', description: '计划就绪，开始执行' },
  { from: ['planning'], to: 'spec_written', description: '计划中发现 spec 不足，需补充' },
  { from: ['executing'], to: 'checking', description: '执行完成，进入验证' },
  { from: ['executing'], to: 'planning', description: '执行中发现计划需要调整', guard: '需求变更或架构问题' },
  { from: ['executing'], to: 'spec_written', description: '执行中发现需求需要修改', guard: '需求理解偏差' },
  { from: ['checking'], to: 'reviewing', description: '验证通过，进入审查' },
  { from: ['checking'], to: 'executing', description: '验证失败，返回执行修复', guard: '测试不通过' },
  { from: ['reviewing'], to: 'journaling', description: '审查通过，归档知识' },
  { from: ['reviewing'], to: 'executing', description: '审查发现问题，返回修改', guard: '审查发现问题' },
  { from: ['journaling'], to: 'completed', description: '知识归档完成' },
  { from: ['completed'], to: 'idle', description: '归档后重置' },
];

// ─── 状态机定义 ─────────────────────────────────────────

export const LEVEL_TRANSITIONS: Record<ComplexityLevel, Transition[]> = {
  // Level 0: 即时响应 — 最少状态
  0: [
    { from: ['idle'], to: 'executing', description: '任务开始执行' },
    { from: ['executing'], to: 'completed', description: '执行完成' },
    { from: ['completed'], to: 'idle', description: '重置到空闲' },
  ],

  // Level 1: 轻量任务 — task.md 驱动
  1: [
    { from: ['idle'], to: 'task_created', description: '创建 task.md' },
    { from: ['task_created'], to: 'executing', description: '开始执行任务' },
    { from: ['executing'], to: 'verifying', description: '执行完毕，进入验证' },
    { from: ['verifying'], to: 'completed', description: '验证通过，任务完成' },
    { from: ['executing'], to: 'idle', description: '执行中止，回到空闲', guard: '用户取消或任务废弃' },
    { from: ['verifying'], to: 'executing', description: '验证失败，继续执行', guard: '验证不通过需要修复' },
    { from: ['completed'], to: 'idle', description: '归档后重置' },
  ],

  // Level 2: 标准任务 — brainstorm → spec → plan → execute → check → review → journal
  2: LEVEL_2_TRANSITIONS,

  // Level 3: 复杂任务 — 含 research/design/subagent（继承 Level 2 全部状态）
  3: [
    ...LEVEL_2_TRANSITIONS.map((t) => ({ ...t })),
    { from: ['idle'], to: 'researching', description: '需要前期调研' },
    { from: ['researching'], to: 'designing', description: '调研完毕，进入设计' },
    { from: ['researching'], to: 'brainstorming', description: '调研产出触发需求细化' },
    { from: ['designing'], to: 'brainstorming', description: '设计方案需要需求确认' },
    { from: ['designing'], to: 'spec_written', description: '设计产出写入 spec' },
    { from: ['executing'], to: 'subagent_coordinating', description: '需要并行执行子任务', guard: '多文件/多模块并行' },
    { from: ['subagent_coordinating'], to: 'checking', description: '子代理全部完成' },
  ],
};

/** 获取指定 Level 的合法转移目标 */
export function getValidTransitions(level: ComplexityLevel, currentState: WorkflowState): Transition[] {
  return LEVEL_TRANSITIONS[level].filter((t) => t.from.includes(currentState));
}

/** 检查状态转移是否合法 */
export function canTransition(level: ComplexityLevel, from: WorkflowState, to: WorkflowState): boolean {
  return LEVEL_TRANSITIONS[level].some((t) => t.from.includes(from) && t.to === to);
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
