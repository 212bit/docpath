/**
 * Agent YAML output — 机器可读状态摘要
 *
 * 给 stats --agent 和 context --agent 共用。
 * 输出 state/next_action/recommended_command/required_context/must_update/exit_criteria。
 */

import { stringify } from 'yaml';
import { existsSync } from 'fs';
import { readCurrentMd } from './workspace.js';
import { readBreadcrumb, type BreadcrumbEntry, type BreadcrumbSummary } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';

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
  /** 下一步动作 (自然语言) */
  next_action: string;
  /** 推荐的 docpath 命令 */
  recommended_command: string;
  /** 需要读取的上下文文件列表 */
  required_context: string[];
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
): {
  next_action: string;
  recommended_command: string;
  required_context: string[];
  must_update: string[];
  exit_criteria: string;
} {
  const currentState = state?.state || 'unknown';
  const phase = state?.phase || '';

  // 默认值
  let next_action = '评估当前任务状态';
  let recommended_command = 'docpath context';
  let required_context = ['.docpath/workspace/current.md'];
  let must_update: string[] = [];
  let exit_criteria = '任务目标完成';

  switch (currentState) {
    case 'idle':
      next_action = '等待新任务分配';
      recommended_command = 'docpath go';
      exit_criteria = '新任务已启动';
      break;
    case 'init':
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
    case 'blocked':
      next_action = '解决阻塞问题或请求帮助';
      recommended_command = 'docpath status';
      required_context = ['.docpath/workspace/breadcrumb.md'];
      exit_criteria = '阻塞解除，恢复 executing 状态';
      break;
    case 'review':
      next_action = '执行代码/设计审查';
      recommended_command = 'docpath breadcrumb add';
      exit_criteria = '审查通过，无未解决的问题';
      break;
    case 'done':
      next_action = '任务已完成，可启动新任务';
      recommended_command = 'docpath go';
      exit_criteria = '已归档或已启动新任务';
      break;
    default:
      next_action = '运行 docpath status 评估当前状态';
      recommended_command = 'docpath status';
  }

  // 进行中有步骤时建议继续
  if (bc.inProgress > 0) {
    const activeStep = bc.entries.find(e => e.status === 'in_progress');
    if (activeStep) {
      next_action = `完成进行中的步骤: ${activeStep.step}`;
    }
  }

  return { next_action, recommended_command, required_context, must_update, exit_criteria };
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
  const rawBreadcrumb = await readBreadcrumb(cwd);
  const bc = summarizeCurrentTaskBreadcrumbs(rawBreadcrumb, state?.task_id || '');
  const inferred = inferNextAction(state, bc);

  const output: AgentOutput = {
    state: state?.state || 'unknown',
    level: state?.level ?? null,
    task_id: state?.task_id || '',
    task_title: state?.task_title || '',
    phase: state?.phase || '',
    ...inferred,
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
