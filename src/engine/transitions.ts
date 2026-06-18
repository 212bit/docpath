/**
 * 事件驱动的工作流状态转移入口。
 *
 * 命令层只发出业务事件；phase/gate/state 的具体落盘规则集中在这里。
 */

import { join } from 'node:path';
import { readCurrentState, writeCurrentState, type CurrentState } from '../utils/workspace.js';
import { resolveDocpathDir } from '../utils/file.js';
import { withLock } from '../utils/lock.js';
import { normalizeWorkflowSnapshot, type GateStatus, type WorkflowPhase } from './state-machine.js';

export type WorkflowEvent =
  | 'task.created'
  | 'plan.ready'
  | 'step.started'
  | 'step.completed'
  | 'check.passed'
  | 'check.failed'
  | 'review.passed'
  | 'review.failed'
  | 'journal.archived';

export interface TransitionPayload {
  currentStep?: string;
  taskId?: string;
  taskTitle?: string;
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

const EVENT_RECOVERY_COMMAND: Record<WorkflowEvent, string> = {
  'task.created': 'docpath refine 或 docpath plan',
  'plan.ready': 'docpath go --step S1',
  'step.started': 'docpath next --agent',
  'step.completed': 'docpath next --agent',
  'check.passed': 'docpath review',
  'check.failed': 'docpath check',
  'review.passed': 'docpath journal',
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
  'check.passed': { phase: 'checking', gate: 'check_pass', from: ['executing', 'checking', 'completed'] },
  'check.failed': { phase: 'checking', gate: 'check_fail', from: ['executing', 'checking', 'reviewing', 'completed'] },
  // 评审前置：检查必须已通过（check_pass），或在评审内重入（review_pass/review_fail）。
  'review.passed': { phase: 'reviewing', gate: 'review_pass', from: ['checking', 'reviewing'], requiredGate: ['check_pass', 'review_pass', 'review_fail'] },
  'review.failed': { phase: 'reviewing', gate: 'review_fail', from: ['checking', 'reviewing'], requiredGate: ['check_pass', 'review_pass', 'review_fail'] },
  // 归档前置：评审已通过（review_pass），或 quick profile 跳过评审后检查已通过（check_pass）。
  // 仍拒绝 check_fail / review_fail——失败态不得归档。
  'journal.archived': { phase: 'completed', gate: 'review_pass', from: ['checking', 'reviewing', 'journaling', 'completed'], requiredGate: ['review_pass', 'check_pass'] },
};

const DEFAULT_STEP: Record<WorkflowEvent, string> = {
  'task.created': '任务已创建，下一步: 编写或细化 spec',
  'plan.ready': '计划已就绪，下一步: 开始执行',
  'step.started': '步骤执行中',
  'step.completed': '步骤已完成，继续下一步',
  'check.passed': '质量检查通过，下一步: docpath review',
  'check.failed': '质量检查失败，请修复失败项',
  'review.passed': '审查通过，下一步: docpath journal',
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
  const lockPath = join(await resolveDocpathDir(cwd), 'workspace', 'state.lock');
  return withLock(lockPath, async () => {
    const previous = await readCurrentState(cwd) || fallbackState();
    if (!target.from.includes(previous.phase)) {
      const allowedFrom = target.from.join(', ');
      const suggested = EVENT_RECOVERY_COMMAND[event] || 'docpath next --agent';
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
      const suggested = EVENT_RECOVERY_COMMAND[event] || 'docpath next --agent';
      throw new Error(
        `[docpath] Illegal workflow transition: ${event} cannot run with gate=${previous.gate}` +
        `（允许门禁: ${allowedGate}；建议下一步: ${suggested}）`,
      );
    }

    const snapshot = normalizeWorkflowSnapshot({ phase: target.phase, gate: target.gate });
    if (!snapshot) {
      throw new Error(`[docpath] Invalid transition target for ${event}: phase=${target.phase}, gate=${target.gate}`);
    }

    const next: CurrentState = {
      ...previous,
      state: snapshot.state,
      phase: snapshot.phase,
      gate: snapshot.gate,
      task_id: payload.taskId ?? previous.task_id,
      task_title: payload.taskTitle ?? previous.task_title,
      current_step: payload.currentStep ?? DEFAULT_STEP[event],
      updated_at: nowIso(),
    };

    if (previous.phase !== next.phase) {
      next.started_at = nowIso();
    }

    await writeCurrentState(cwd, next);
    return next;
  });
}
