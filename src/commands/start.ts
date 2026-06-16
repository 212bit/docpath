/**
 * docpath start — 语义化的步骤启动命令
 *
 * 操作层包装，调用现有的 go 命令，提供更短的语义化入口。
 * 实现 Phase 1 操作层优化的核心命令之一。
 */

import { goCommand } from './go.js';
import { resolveBoundTaskId, readCurrentState } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readActiveTaskFile } from '../utils/task-files.js';
import { parsePlanSteps } from '../utils/doc-parser.js';

interface StartOptions {
  cwd: string;
  step: string;
  session?: string;
}

/**
 * 验证步骤是否存在于计划中
 */
async function validateStepExists(cwd: string, taskId: string | undefined, step: string): Promise<boolean> {
  const docpathDir = await resolveDocpathDir(cwd);
  try {
    const planContent = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
    if (!planContent.trim()) return false;

    const tasks = parsePlanSteps(planContent);
    return tasks.some(t => t.id.toLowerCase() === step.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * docpath start 命令实现
 *
 * 语义化包装，调用底层 go 命令，输出审计信息
 */
export async function startCommand(options: StartOptions): Promise<void> {
  const { cwd, step } = options;
  const session = resolveSessionContext(options.session);

  // 前置检查 1: 必须有已绑定的 task_id
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    console.error('❌  无法启动步骤: 当前没有已绑定的任务');
    console.error('    start 命令需要活跃任务上下文。');
    console.error('    建议:');
    console.error('      - 如果有 spec，运行: docpath plan');
    console.error('      - 如果没有任务，运行: docpath backlog promote <id>');
    console.error('      - 或者运行: docpath status --agent 诊断当前状态');
    process.exit(1);
  }

  // 前置检查 2: 步骤必须存在于计划中
  const stepExists = await validateStepExists(cwd, taskId, step);
  if (!stepExists) {
    console.error(`❌  步骤不存在: ${step}`);
    console.error(`    task_id: ${taskId}`);
    console.error('    建议:');
    console.error('      - 检查 .docpath/tasks/current/plan.md 中的步骤列表');
    console.error('      - 步骤 ID 格式: S1, S2, S3 等');
    process.exit(1);
  }

  // 前置检查 3: 确认没有其他 in_progress 步骤（session lease 会检查）
  const currentState = await readCurrentState(cwd);
  if (currentState?.current_step && currentState.current_step !== step) {
    console.error(`❌  已有进行中的步骤: ${currentState.current_step}`);
    console.error(`    无法启动新步骤: ${step}`);
    console.error('    建议:');
    console.error(`      - 先完成当前步骤: docpath agent step --step ${currentState.current_step} --status done`);
    console.error('      - 或标记为阻塞: docpath agent step --step ${currentState.current_step} --status blocked');
    process.exit(1);
  }

  // 调用底层 go 命令（执行所有门禁和状态转换）
  await goCommand({
    cwd,
    step,
    session: session.sessionId,
  });

  // 审计输出
  console.log('');
  console.log('─── 操作层审计 ───');
  console.log(`✅  已启动步骤: ${step}`);
  console.log(`    task_id: ${taskId}`);
  console.log(`    session: ${session.sessionId}`);
  console.log(`    底层调用: docpath go --step ${step}`);
  console.log('');
}
