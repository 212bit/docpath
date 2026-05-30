/**
 * 事件驱动的工作流状态转移入口。
 *
 * 命令层只发出业务事件；phase/gate/state 的具体落盘规则集中在这里。
 */

import { readCurrentState, writeCurrentState, type CurrentState } from '../utils/workspace.js';
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
}

const EVENT_TARGETS: Record<WorkflowEvent, TransitionTarget> = {
  'task.created': { phase: 'drafting', gate: 'none', from: ['idle', 'drafting'] },
  'plan.ready': { phase: 'planning', gate: 'none', from: ['drafting', 'planning'] },
  'step.started': { phase: 'executing', gate: 'none', from: ['idle', 'planning', 'executing', 'checking'] },
  'step.completed': { phase: 'executing', gate: 'none', from: ['executing', 'checking'] },
  'check.passed': { phase: 'checking', gate: 'check_pass', from: ['executing', 'checking'] },
  'check.failed': { phase: 'checking', gate: 'check_fail', from: ['executing', 'checking', 'reviewing'] },
  'review.passed': { phase: 'reviewing', gate: 'review_pass', from: ['checking', 'reviewing'] },
  'review.failed': { phase: 'reviewing', gate: 'review_fail', from: ['checking', 'reviewing'] },
  'journal.archived': { phase: 'completed', gate: 'review_pass', from: ['checking', 'reviewing', 'journaling', 'completed'] },
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
    level: 1,
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

  const previous = await readCurrentState(cwd) || fallbackState();
  if (!target.from.includes(previous.phase)) {
    throw new Error(`[docpath] Illegal workflow transition: ${event} cannot run from phase=${previous.phase}`);
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
}
