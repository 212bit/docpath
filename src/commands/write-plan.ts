/**
 * docpath:write-plan — 写入 plan.md
 *
 * 接受 plan 内容（通过参数或 stdin），写入 .docpath/tasks/current/plan.md，
 * 并更新状态为 planning，下一步进入 docpath go。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { nextCommand, runPostWriteSteps } from './runtime.js';
import { validatePlanContent } from '../utils/doc-parser.js';
import { canonicalTaskDir, currentTaskDir, writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { readStdin } from '../utils/stdin.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';

interface WritePlanOptions {
  cwd: string;
  /** plan 内容（Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
  /** R-347: 与 go 同语义 —— 记录 breadcrumb 证据后跳过 dirty guard（代码先于 plan 落盘时用）。 */
  acceptDirty?: string;
}

export async function writePlanCommand(options: WritePlanOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  let planContent = content || '';
  if (!planContent && options.stdin !== false) {
    planContent = await readStdin();
  }

  if (!planContent.trim()) {
    console.error('❌  未提供 plan 内容。用法：');
    console.error('   docpath write-plan --content "..."');
    console.error('   echo "..." | docpath write-plan --stdin');
    process.exit(1);
  }

  const validation = validatePlanContent(planContent);
  if (!validation.ok) {
    const current = await readCurrentState(cwd);
    const taskId = current?.task_id || 'current';
    const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), 'plan.md');
    const currentPath = join(currentTaskDir(docpathDir), 'plan.md');
    console.error('❌  plan.md 结构校验失败：');
    console.error(`   实际目标: ${canonicalPath}`);
    console.error(`   current 视图: ${currentPath}`);
    for (const issue of validation.issues) {
      console.error(`   - ${formatValidationIssue(issue)}`);
    }
    process.exit(1);
  }

  const current = await readCurrentState(cwd);
  const needsCleanGuard = !current?.task_id || current.phase === 'idle' || current.phase === 'completed';
  if (needsCleanGuard && !options.acceptDirty) {
    assertCleanWorktreeForNewTask(cwd, 'docpath write-plan');
  }
  const taskId = current?.task_id || 'current';
  if (needsCleanGuard && options.acceptDirty) {
    // R-347: 首等恢复旗标 —— 与 go --accept-dirty 同语义，记录 breadcrumb 证据后放行。
    await writeBreadcrumb(cwd, {
      taskId,
      step: 'plan',
      status: 'in_progress',
      context: `write-plan --accept-dirty: ${options.acceptDirty}`,
    });
    console.log(`⚠️  --accept-dirty 已记录 breadcrumb 证据: ${options.acceptDirty}`);
  }
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'plan.md', planContent);

  console.log(`✅  plan.md 已写入: ${canonicalPath}`);

  // 文件已写入即命令成功，后续状态转换/next 失败不抛出，避免误导退出码（R-248）。
  // 执行阶段重写计划不触发 plan.ready 回退（R-251）。
  await advanceOrPreservePhase(cwd, current?.phase);
}

// 执行阶段（executing/checking/reviewing/journaling）重写计划时只更新文件，
// 不触发 plan.ready 回退——否则丢失执行态，迫使 agent 绕过 write-plan 手编
// plan.md，进而触发 sha256 / current-canonical / plan-breadcrumb 漂移（R-251）。
const EXECUTING_PHASES = ['executing', 'checking', 'reviewing', 'journaling'];

async function advanceOrPreservePhase(cwd: string, phase: string | undefined): Promise<void> {
  if (phase && EXECUTING_PHASES.includes(phase)) {
    console.log(`📌  当前阶段为 ${phase}，仅更新 plan 文件，不回退阶段`);
    try {
      await nextCommand({ cwd });
    } catch (err) {
      console.error(`⚠️  文件已写入，但后续步骤失败（不影响写入结果）: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  await runPostWriteSteps(cwd, 'plan.ready', { currentStep: 'plan 已写入，下一步: docpath go' });
}

function formatValidationIssue(issue: { message: string; line?: number; section?: string; field?: string }): string {
  const details = [
    issue.line ? `line ${issue.line}` : '',
    issue.section ? `section ${issue.section}` : '',
    issue.field ? `field ${issue.field}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${issue.message} (${details.join(', ')})` : issue.message;
}

