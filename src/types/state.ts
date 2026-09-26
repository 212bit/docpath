/**
 * DocPath Workflow State & Lifecycle Types and Pure State Functions (Layer 0)
 */

export type ComplexityLevel = 0 | 1 | 2 | 3;

export interface EscalationState {
  recommendedLevel: ComplexityLevel;
  reason: string;
  signals: string[];
  action: 'auto_escalate' | 'prompt_user' | 'none';
  evaluatedAt: string;
}

export type L0State = 'idle' | 'executing' | 'completed';
export type L1State = 'idle' | 'executing' | 'completed';
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
export type L3State = L2State | 'researching' | 'designing' | 'subagent_coordinating';
export type WorkflowState = L0State | L1State | L2State | L3State;

export type WorkflowPhase =
  | 'idle'
  | 'drafting'
  | 'planning'
  | 'executing'
  | 'checking'
  | 'reviewing'
  | 'journaling'
  | 'completed';

export type GateStatus =
  | 'none'
  | 'spec_ready'
  | 'plan_ready'
  | 'step_done'
  | 'check_pass'
  | 'check_fail'
  | 'check_env_exempt'
  | 'review_pass'
  | 'review_fail'
  | 'review_skipped'
  | 'blocked';

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
  | 'check_env_exempt'
  | 'review_pass'
  | 'review_skipped'
  | 'build_pass'
  | 'blocked'
  | 'archived';

export type WorkflowProfile = 'instant' | 'quick' | 'standard' | 'strict';
export const DEFAULT_WORKFLOW_PROFILE: WorkflowProfile = 'standard';

export function normalizeWorkflowProfile(value: unknown): WorkflowProfile {
  return value === 'quick' || value === 'strict' || value === 'instant' ? value : DEFAULT_WORKFLOW_PROFILE;
}

export interface WorkflowSnapshot {
  phase: WorkflowPhase;
  gate: GateStatus;
  state: RuntimeWorkflowState;
}

export interface CurrentState {
  level: number;
  workflow_profile: WorkflowProfile;
  state: string;
  phase: WorkflowPhase;
  gate: GateStatus;
  task_id: string;
  task_title: string;
  current_step: string;
  started_at: string;
  updated_at: string;
  backlog_id?: string | null;
  risk_tier?: number;
  escalation?: any;
  [key: string]: unknown;
}

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
  'check_env_exempt',
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

export function normalizeWorkflowState(state: string): RuntimeWorkflowState | null {
  return VALID_WORKFLOW_STATES.has(state as RuntimeWorkflowState)
    ? (state as RuntimeWorkflowState)
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
  check_env_exempt: { phase: 'checking', gate: 'check_env_exempt', state: 'check_env_exempt' },
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
  checking: { none: 'checking', check_pass: 'check_pass', check_fail: 'check_fail', check_env_exempt: 'check_env_exempt', blocked: 'blocked' },
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
  return valid.includes(phase as WorkflowPhase) ? (phase as WorkflowPhase) : null;
}

export function normalizeGateStatus(gate: string): GateStatus | null {
  const valid: GateStatus[] = ['none', 'check_pass', 'check_fail', 'check_env_exempt', 'review_pass', 'review_skipped', 'review_fail', 'blocked'];
  return valid.includes(gate as GateStatus) ? (gate as GateStatus) : null;
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
