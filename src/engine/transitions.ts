/**
 * 事件驱动的工作流状态转移入口。
 *
 * 命令层只发出业务事件；phase/gate/state 的具体落盘规则集中在这里。
 */

import { readCurrentState, stateLockPath, writeCurrentState, type CurrentState } from '../utils/workspace.js';
import { withLock } from '../utils/lock.js';
import { normalizeWorkflowSnapshot, type GateStatus, type WorkflowPhase } from './state-machine.js';
import { normalizeWorkflowProfile, type WorkflowProfile } from './workflow-profile.js';

export type WorkflowEvent =
  | 'task.created'
  | 'task.reopened'
  | 'plan.ready'
  | 'step.started'
  | 'step.completed'
  | 'check.passed'
  | 'check.failed'
  | 'review.passed'
  | 'review.skipped'
  | 'review.failed'
  | 'journal.archived';

export interface TransitionPayload {
  currentStep?: string;
  taskId?: string;
  taskTitle?: string;
  backlogId?: string | null;
  level?: number;
  workflowProfile?: WorkflowProfile;
}

interface TransitionTarget {
  phase: WorkflowPhase;
  gate: GateStatus;
  from: WorkflowPhase[];
  /**
   * 对 previous.gate 的前置约束。phase 级 from 只能保证「阶段顺序」，
   * 无法表达「检查必须先通过才能评审」这类门禁前置——后者粒度是 gate。
   * 声明此字段后，transitionWorkflow 会在持锁段额外校验 previous.gate ∈ requiredGate，
   * 否则 fail-loud 拒绝。未声明的事件行为完全不变（向后兼容）。
   */
  requiredGate?: GateStatus[];
}

export interface WorkflowTransitionMetadata {
  event: WorkflowEvent;
  phase: WorkflowPhase;
  gate: GateStatus;
  from: WorkflowPhase[];
  requiredGate: GateStatus[];
}

const EVENT_RECOVERY_COMMAND: Record<WorkflowEvent, string> = {
  'task.created': 'docpath refine 或 docpath plan',
  'task.reopened': 'docpath go --step <id>',
  'plan.ready': 'docpath go --step S1',
  'step.started': 'docpath next --agent',
  'step.completed': 'docpath next --agent',
  'check.passed': 'docpath review',
  'check.failed': 'docpath check',
  'review.passed': 'docpath journal',
  'review.skipped': 'docpath journal',
  'review.failed': 'docpath review',
  'journal.archived': 'docpath check 或 docpath review',
};

const EVENT_TARGETS: Record<WorkflowEvent, TransitionTarget> = {
  // 起草类事件：放宽 from，允许从 idle/草稿/计划/执行中（重）创建或细化，且不破坏门禁保护。
  // 这样新项目与历史漂移状态都能正常推进，而不会抛非法转移。
  'task.created': { phase: 'drafting', gate: 'none', from: ['idle', 'drafting', 'planning', 'executing', 'completed'] },
  'plan.ready': { phase: 'planning', gate: 'none', from: ['idle', 'drafting', 'planning', 'executing'] },
  'step.started': { phase: 'executing', gate: 'none', from: ['idle', 'drafting', 'planning', 'executing', 'checking'] },
  // 门禁类事件：保持严格 from，禁止跳过验证/审查直达完成。
  // requiredGate 进一步约束 previous.gate：phase 级 from 拦不住「check_fail 仍进 review」，
  // 故评审/归档事件显式声明可接受的前置门禁，未通过检查者在 FSM 层即被拒。
  'step.completed': { phase: 'executing', gate: 'none', from: ['executing', 'checking'] },
  // R-298: 门禁事件禁入 completed——已完成任务的重入必须走显式 task.reopened，
  // 否则 completed 态可被 check/review 静默重入（R-279/R-291 半执行污染家族的 FSM 层残口）。
  // task.created（创建新任务）与 journal.archived（幂等重归档）保留 completed 来源，属合法语义。
  'task.reopened': { phase: 'executing', gate: 'none', from: ['completed'] },
  'check.passed': { phase: 'checking', gate: 'check_pass', from: ['planning', 'executing', 'checking'] },
  'check.failed': { phase: 'checking', gate: 'check_fail', from: ['executing', 'checking', 'reviewing'] },
  // 评审前置：检查必须已通过（check_pass），或在评审内重入（review_pass/review_fail）。
  'review.passed': { phase: 'reviewing', gate: 'review_pass', from: ['checking', 'reviewing'], requiredGate: ['check_pass', 'review_pass', 'review_fail'] },
  'review.skipped': { phase: 'reviewing', gate: 'review_skipped', from: ['checking', 'reviewing'], requiredGate: ['check_pass', 'review_skipped'] },
  'review.failed': { phase: 'reviewing', gate: 'review_fail', from: ['checking', 'reviewing'], requiredGate: ['check_pass', 'review_pass', 'review_fail'] },
  // 归档前置：评审已通过（review_pass），或 quick profile 跳过评审后检查已通过（check_pass）。
  // 仍拒绝 check_fail / review_fail——失败态不得归档。
  'journal.archived': { phase: 'completed', gate: 'review_pass', from: ['checking', 'reviewing', 'journaling', 'completed'], requiredGate: ['review_pass', 'review_skipped', 'check_pass'] },
};

export function listWorkflowTransitions(): WorkflowTransitionMetadata[] {
  return (Object.entries(EVENT_TARGETS) as Array<[WorkflowEvent, TransitionTarget]>).map(([event, target]) => ({
    event,
    phase: target.phase,
    gate: target.gate,
    from: [...target.from],
    requiredGate: [...(target.requiredGate || [])],
  }));
}

export function listValidWorkflowEvents(previous: Pick<CurrentState, 'phase' | 'gate'>): WorkflowTransitionMetadata[] {
  return listWorkflowTransitions().filter((transition) => {
    if (!transition.from.includes(previous.phase)) return false;
    if (transition.requiredGate.length > 0 && !transition.requiredGate.includes(previous.gate)) return false;
    return true;
  });
}

/** Suggested CLI after a named workflow event succeeds (or when recovering that event). */
export function workflowEventSuggestedCommand(event: WorkflowEvent): string {
  return EVENT_RECOVERY_COMMAND[event] || 'docpath next --agent';
}

/** Gate-progression CLI verbs that must stay consistent with FSM legality. */
const WORKFLOW_GATE_COMMAND_PREFIXES = [
  'docpath check',
  'docpath review',
  'docpath journal',
  'docpath done',
  'docpath recover',
  'docpath debug reproduce',
] as const;

export function isWorkflowGateCommand(command: string): boolean {
  const cmd = command.trim();
  return WORKFLOW_GATE_COMMAND_PREFIXES.some((prefix) => cmd === prefix || cmd.startsWith(`${prefix} `));
}

/**
 * Preferred machine command derived only from FSM-valid events at current phase/gate.
 * Gate completion status decides between peer-legal events (e.g. review vs journal
 * both legal from checking/check_pass for quick archive, but standard path wants review first).
 */
export function preferredWorkflowCommand(previous: Pick<CurrentState, 'phase' | 'gate'>): string {
  const valid = new Set(listValidWorkflowEvents(previous).map((item) => item.event));
  const gate = previous.gate;

  // Review already decided → archive next
  if ((gate === 'review_pass' || gate === 'review_skipped') && valid.has('journal.archived')) {
    return 'docpath journal';
  }
  // Check passed, review not yet done → review (or quick done path leaves journal also legal)
  if (gate === 'check_pass' && (valid.has('review.passed') || valid.has('review.skipped') || valid.has('review.failed'))) {
    return 'docpath review';
  }
  if (gate === 'review_fail' && (valid.has('review.passed') || valid.has('review.failed'))) {
    return 'docpath review';
  }
  if (gate === 'check_fail' && (valid.has('check.passed') || valid.has('check.failed'))) {
    return 'docpath check';
  }
  if (valid.has('journal.archived')) return 'docpath journal';
  if (valid.has('review.passed') || valid.has('review.failed') || valid.has('review.skipped')) {
    return 'docpath review';
  }
  if (valid.has('check.passed') || valid.has('check.failed')) return 'docpath check';
  if (valid.has('plan.ready')) return 'docpath plan';
  if (valid.has('step.started')) return 'docpath next --agent';
  return 'docpath next --agent';
}

/** Whether a recommended CLI verb is legal under current FSM phase/gate. */
export function isWorkflowGateCommandAllowed(
  command: string,
  previous: Pick<CurrentState, 'phase' | 'gate'>,
): boolean {
  const cmd = command.trim();
  if (!isWorkflowGateCommand(cmd)) return true;

  const valid = new Set(listValidWorkflowEvents(previous).map((item) => item.event));

  if (cmd === 'docpath review' || cmd.startsWith('docpath review ')) {
    return valid.has('review.passed') || valid.has('review.failed') || valid.has('review.skipped');
  }
  if (cmd === 'docpath check' || cmd.startsWith('docpath check ')) {
    return valid.has('check.passed') || valid.has('check.failed');
  }
  if (cmd === 'docpath journal' || cmd.startsWith('docpath journal ')) {
    return valid.has('journal.archived');
  }
  if (cmd === 'docpath done' || cmd.startsWith('docpath done ')) {
    // quick closeout: legal when archive is open, or check just passed (review skipped path)
    return valid.has('journal.archived') || valid.has('check.passed') || valid.has('review.skipped');
  }
  if (cmd.startsWith('docpath recover')) {
    // recover is breadcrumb-scoped; router only emits it when blocked entries exist.
    // FSM phase/gate alone cannot authorize or deny it — pass through.
    return true;
  }
  if (cmd === 'docpath debug reproduce' || cmd.startsWith('docpath debug ')) {
    // troubleshooting pass-through when check/review failed, else allow if currently failing
    return true;
  }
  return true;
}

/**
 * If recommended_command is a gate verb illegal at current phase/gate, replace with
 * FSM-derived preferred command. Non-gate routes (backlog/learn/go/plan) pass through.
 */
export function constrainRecommendedCommandToWorkflow(
  command: string,
  previous: Pick<CurrentState, 'phase' | 'gate'>,
): string {
  const cmd = command.trim() || 'docpath next --agent';
  if (!isWorkflowGateCommand(cmd)) return cmd;
  if (isWorkflowGateCommandAllowed(cmd, previous)) return cmd;
  return preferredWorkflowCommand(previous);
}

const DEFAULT_STEP: Record<WorkflowEvent, string> = {
  'task.created': '任务已创建，下一步: 编写或细化 spec',
  'task.reopened': '任务已重开，修复后重新走 check/review/journal 闭环',
  'plan.ready': '计划已就绪，下一步: 开始执行',
  'step.started': '步骤执行中',
  'step.completed': '步骤已完成，继续下一步',
  'check.passed': '质量检查通过，下一步: docpath review',
  'check.failed': '质量检查失败，请修复失败项',
  'review.passed': '审查通过，下一步: docpath journal',
  'review.skipped': '审查已按工作流策略跳过，下一步: docpath journal',
  'review.failed': '审查未通过，请修复审查问题',
  'journal.archived': '知识归档完成',
};

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackState(): CurrentState {
  const snapshot = normalizeWorkflowSnapshot({ phase: 'idle', gate: 'none' });
  if (!snapshot) throw new Error('[docpath] failed to create fallback workflow snapshot');
  const ts = nowIso();
  return {
    level: 0,
    workflow_profile: 'standard',
    state: snapshot.state,
    phase: snapshot.phase,
    gate: snapshot.gate,
    task_id: '',
    task_title: '',
    current_step: '等待下一步',
    started_at: ts,
    updated_at: ts,
  };
}

export async function transitionWorkflow(
  cwd: string,
  event: WorkflowEvent,
  payload: TransitionPayload = {},
): Promise<CurrentState> {
  const target = EVENT_TARGETS[event];
  if (!target) throw new Error(`[docpath] Unsupported workflow event: ${event}`);

  // 整个 read-modify-write 序列持锁执行，防止并发 Agent（codex / hive 守护进程 / 人类）
  // 各自读到同一旧状态、各自写回，导致后写者覆盖先写者的转移（lost update）。
  // 锁文件与 state.json 同目录；.gitignore 末尾的 `.docpath` 兜底规则会忽略
  // 所有未追踪的 .docpath/ 文件，故 state.lock 不会泄漏进 git status。
  const lockPath = await stateLockPath(cwd);
  return withLock(lockPath, async () => {
    const previous = await readCurrentState(cwd) || fallbackState();
    if (!target.from.includes(previous.phase)) {
      const allowedFrom = target.from.join(', ');
      const suggested = preferredWorkflowCommand(previous);
      throw new Error(
        `[docpath] Illegal workflow transition: ${event} cannot run from phase=${previous.phase}` +
        `（允许来源: ${allowedFrom}；建议下一步: ${suggested}）`,
      );
    }

    // gate 前置：phase 顺序合法不代表门禁前置满足。
    // 例如 phase=checking 但 gate=check_fail 时，review.passed 的 from 校验会通过，
    // 但「检查未过不得评审」必须由 FSM 层兜住，而非仅靠命令层自觉。
    if (target.requiredGate && !target.requiredGate.includes(previous.gate)) {
      const allowedGate = target.requiredGate.join(', ');
      const suggested = preferredWorkflowCommand(previous);
      throw new Error(
        `[docpath] Illegal workflow transition: ${event} cannot run with gate=${previous.gate}` +
        `（允许门禁: ${allowedGate}；建议下一步: ${suggested}）`,
      );
    }

    const targetGate = event === 'journal.archived' && previous.gate === 'review_skipped'
      ? 'review_skipped'
      : target.gate;
    const snapshot = normalizeWorkflowSnapshot({ phase: target.phase, gate: targetGate });
    if (!snapshot) {
      throw new Error(`[docpath] Invalid transition target for ${event}: phase=${target.phase}, gate=${targetGate}`);
    }

    const createsDifferentTask = event === 'task.created'
      && typeof payload.taskId === 'string'
      && payload.taskId.trim().length > 0
      && payload.taskId !== previous.task_id;
    const nextProfile = payload.workflowProfile
      ? normalizeWorkflowProfile(payload.workflowProfile)
      : createsDifferentTask
        ? 'standard'
        : previous.workflow_profile;
    const nextLevel = typeof payload.level === 'number'
      ? payload.level
      : createsDifferentTask
        ? 1
        : previous.level;

    const next: CurrentState = {
      ...previous,
      level: nextLevel,
      workflow_profile: nextProfile,
      state: snapshot.state,
      phase: snapshot.phase,
      gate: snapshot.gate,
      task_id: payload.taskId ?? previous.task_id,
      task_title: payload.taskTitle ?? previous.task_title,
      ...(payload.backlogId !== undefined ? { backlog_id: payload.backlogId } : {}),
      current_step: payload.currentStep ?? DEFAULT_STEP[event],
      updated_at: nowIso(),
    };

    if (previous.phase !== next.phase) {
      next.started_at = nowIso();
    }

    await writeCurrentState(cwd, next);
    try {
      const { refreshAgentSnapshot } = await import('../hooks/bridge.js');
      await refreshAgentSnapshot(cwd);
    } catch {
      // Snapshot refresh must not make a successful FSM transition fail.
    }
    return next;
  });
}
