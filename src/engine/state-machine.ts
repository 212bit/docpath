/**
 * DocPath 状态机引擎
 * 
 * 定义四级复杂度模型的状态、转移规则和验证逻辑。
 * 文档即 FSM — 所有状态由 .docpath/workspace/current.md 驱动。
 */

// ─── 类型定义 ───────────────────────────────────────────

export type ComplexityLevel = 0 | 1 | 2 | 3;

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

/** 状态寄存器 — 持久化在 current.md 中 */
export interface StateRegister {
  level: ComplexityLevel;
  state: WorkflowState;
  task_id: string | null;
  task_title: string;
  phase: string | null;
  started_at: string | null;
  updated_at: string | null;
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
    task_id: null,
    task_title: '',
    phase: null,
    started_at: null,
    updated_at: null,
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
