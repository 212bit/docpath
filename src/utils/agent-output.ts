/**
 * Agent YAML output — 机器可读状态摘要
 *
 * 给 stats --agent 和 context --agent 共用。
 * 输出 state/next_action/recommended_command/required_context/must_update/exit_criteria。
 */

import { stringify } from 'yaml';
import { existsSync } from 'fs';
import { join } from 'path';
import { parsePlanTasks, readCurrentMd, readOptionalFile } from './workspace.js';
import { readBreadcrumb, type BreadcrumbEntry, type BreadcrumbSummary } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { detectPlanBreadcrumbDrift, type PlanBreadcrumbDrift } from './plan-sync.js';

export interface AgentOutput {
  /** 当前状态 (state machine state) */
  state: string;
  /** 复杂度级别 */
  level: number | null;
  /** 任务标识 */
  task_id: string;
  /** 任务标题 */
  task_title: string;
  /** 当前阶段 */
  phase: string;
  /** 当前门禁状态 */
  gate: string;
  /** 下一步动作 (自然语言) */
  next_action: string;
  /** 推荐的 docpath 命令 */
  recommended_command: string;
  /** 需要读取的上下文文件列表 */
  required_context: string[];
  /** required_context 的机器友好别名 */
  required_files: string[];
  /** 需要更新的文件列表 */
  must_update: string[];
  /** 退出标准 (任务完成条件) */
  exit_criteria: string;
  /** 面包屑进度 */
  progress: {
    done: number;
    total: number;
    in_progress: number;
    blocked: number;
  };
  /** 时间戳 */
  generated_at: string;
}

function summarizeCurrentTaskBreadcrumbs(
  bc: BreadcrumbSummary,
  taskId: string,
): BreadcrumbSummary {
  if (!taskId) return bc;

  const latestByStep = new Map<string, BreadcrumbEntry>();
  for (const entry of bc.entries) {
    if (entry.taskId !== taskId) continue;
    latestByStep.set(entry.step, entry);
  }

  const entries = Array.from(latestByStep.values());
  const done = entries.filter((e) => e.status === 'done').length;
  const inProgress = entries.filter((e) => e.status === 'in_progress').length;
  const blocked = entries.filter((e) => e.status === 'blocked').length;

  return {
    total: entries.length,
    done,
    inProgress,
    blocked,
    latest: entries.length > 0 ? entries[entries.length - 1] : null,
    entries,
  };
}

/**
 * 推断下一步动作
 */
function inferNextAction(
  state: Awaited<ReturnType<typeof readCurrentMd>>,
  bc: BreadcrumbSummary,
  planTasks: ReturnType<typeof parsePlanTasks>,
  lastCheckContent: string,
  drift: PlanBreadcrumbDrift,
): {
  next_action: string;
  recommended_command: string;
  required_context: string[];
  required_files: string[];
  must_update: string[];
  exit_criteria: string;
} {
  const currentState = state?.state || 'unknown';
  const phase = state?.phase || '';
  const gate = state?.gate || 'none';
  const firstOpenTask = planTasks.find((task) => !task.done);
  const allPlanDone = planTasks.length > 0 && planTasks.every((task) => task.done);
  const lastCheckFailed = /^\*\*结果\*\*:\s*❌\s*FAIL\s*$/m.test(lastCheckContent);
  const lastCheckPassed = /^\*\*结果\*\*:\s*✅\s*PASS\s*$/m.test(lastCheckContent);

  // 默认值
  let next_action = '评估当前任务状态';
  let recommended_command = 'docpath context';
  let required_context = ['.docpath/workspace/current.md'];
  let must_update: string[] = [];
  let exit_criteria = '任务目标完成';

  if (drift.planDoneWithoutBreadcrumb.length > 0 || drift.breadcrumbDoneWithoutPlan.length > 0) {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'];
    const detail = [
      drift.planDoneWithoutBreadcrumb.length > 0
        ? `plan 已完成但缺少 breadcrumb: ${drift.planDoneWithoutBreadcrumb.join(', ')}`
        : '',
      drift.breadcrumbDoneWithoutPlan.length > 0
        ? `breadcrumb done 但 plan 未勾选: ${drift.breadcrumbDoneWithoutPlan.join(', ')}`
        : '',
    ].filter(Boolean).join('; ');
    return {
      next_action: `修正 plan/breadcrumb 漂移: ${detail}`,
      recommended_command: 'docpath check',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: 'plan checklist 与 breadcrumb done 记录一致',
    };
  }

  if (bc.blocked > 0) {
    const blocked = bc.entries.find(e => e.status === 'blocked');
    return {
      next_action: `处理阻塞步骤: ${blocked?.step || 'unknown'}`,
      recommended_command: 'docpath debug reproduce',
      required_context: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/workspace/last-check.md',
      ],
      required_files: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/workspace/last-check.md',
      ],
      must_update: ['.docpath/workspace/breadcrumb.md'],
      exit_criteria: '阻塞项有复现、定位或修复记录',
    };
  }

  if (gate === 'check_fail' || currentState === 'check_fail' || lastCheckFailed) {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/last-check.md', '.docpath/workspace/breadcrumb.md'];
    return {
      next_action: '修复质量检查失败项',
      recommended_command: 'docpath debug reproduce',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/last-check.md'],
      exit_criteria: '重新运行 docpath check 并通过',
    };
  }

  const activeStep = bc.entries.find(e => e.status === 'in_progress');
  if (activeStep) {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: `完成进行中的步骤: ${activeStep.step}`,
      recommended_command: `docpath agent step --step ${activeStep.step} --status done`,
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: `${activeStep.step} 已完成并记录 breadcrumb`,
    };
  }

  if (firstOpenTask) {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: `执行下一个未完成步骤: ${firstOpenTask.id} ${firstOpenTask.title}`,
      recommended_command: `docpath go --step ${firstOpenTask.id}`,
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: `${firstOpenTask.id} 已完成并勾选 plan checklist`,
    };
  }

  if (allPlanDone && !lastCheckPassed && gate !== 'check_pass' && gate !== 'review_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: '计划已完成，运行质量检查',
      recommended_command: 'docpath check',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/last-check.md', '.docpath/workspace/breadcrumb.md'],
      exit_criteria: 'last-check.md 显示 PASS',
    };
  }

  if (gate === 'check_pass' && currentState !== 'review_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/last-check.md'];
    return {
      next_action: '质量检查已通过，执行审查',
      recommended_command: 'docpath review',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/review.md', '.docpath/workspace/breadcrumb.md'],
      exit_criteria: '审查通过并记录 review 证据',
    };
  }

  if (currentState === 'completed' || phase === 'completed') {
    const required = ['.docpath/workspace/current.md'];
    return {
      next_action: '任务已完成，可启动新任务',
      recommended_command: 'docpath brainstorm',
      required_context: required,
      required_files: required,
      must_update: [],
      exit_criteria: '新任务已创建或导入',
    };
  }

  if (gate === 'review_pass' || currentState === 'review_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/review.md', '.docpath/workspace/last-check.md'];
    return {
      next_action: '审查已通过，执行知识归档',
      recommended_command: 'docpath journal',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/decisions.md'],
      exit_criteria: '任务归档完成并进入 completed',
    };
  }

  switch (currentState) {
    case 'idle':
      next_action = '创建或导入下一项任务';
      recommended_command = 'docpath brainstorm';
      required_context = ['.docpath/workspace/current.md', '.docpath/spec/architecture.md', '.docpath/spec/style.md'];
      exit_criteria = '任务 spec 已创建';
      break;
    case 'drafting':
    case 'planning_done':
      next_action = '读取 spec 和 plan，开始第一个执行步骤';
      recommended_command = 'docpath context';
      required_context = [
        '.docpath/workspace/current.md',
        '.docpath/tasks/current/spec.md',
        '.docpath/tasks/current/plan.md',
      ];
      exit_criteria = '第一步执行完成并记录 breadcrumb';
      break;
    case 'executing':
      next_action = `继续执行阶段: ${phase}`;
      recommended_command = 'docpath breadcrumb add';
      required_context = [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/tasks/current/plan.md',
      ];
      must_update = ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/current.md'];
      if (bc.blocked > 0) {
        next_action = `处理 ${bc.blocked} 个阻塞项后继续: ${phase}`;
      }
      exit_criteria = 'plan.md 中所有步骤标记完成';
      break;
    case 'reviewing':
      next_action = '执行代码/设计审查';
      recommended_command = 'docpath breadcrumb add';
      exit_criteria = '审查通过，无未解决的问题';
      break;
    default:
      next_action = '运行 docpath status 评估当前状态';
      recommended_command = 'docpath status';
  }

  return { next_action, recommended_command, required_context, required_files: required_context, must_update, exit_criteria };
}

/**
 * 生成 Agent YAML 输出
 */
export async function generateAgentOutput(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    // 无 .docpath 时返回最小状态
    return stringify({
      state: 'uninitialized',
      next_action: '运行 docpath init 初始化项目',
      recommended_command: 'docpath init',
      generated_at: new Date().toISOString(),
    });
  }

  const state = await readCurrentMd(cwd);
  const planContent = await readOptionalFile(join(docpathDir, 'tasks', 'current', 'plan.md'));
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const planTasks = parsePlanTasks(planContent);
  const rawBreadcrumb = await readBreadcrumb(cwd);
  const bc = summarizeCurrentTaskBreadcrumbs(rawBreadcrumb, state?.task_id || '');
  const drift = await detectPlanBreadcrumbDrift(cwd);
  const inferred = inferNextAction(state, bc, planTasks, lastCheckContent, drift);

  const output: AgentOutput = {
    state: state?.state || 'unknown',
    level: state?.level ?? null,
    task_id: state?.task_id || '',
    task_title: state?.task_title || '',
    phase: state?.phase || '',
    gate: state?.gate || 'none',
    ...inferred,
    required_context: [...inferred.required_context],
    required_files: [...inferred.required_files],
    must_update: [...inferred.must_update],
    progress: {
      done: bc.done,
      total: bc.total,
      in_progress: bc.inProgress,
      blocked: bc.blocked,
    },
    generated_at: new Date().toISOString(),
  };

  return stringify(output, { indent: 2 });
}
