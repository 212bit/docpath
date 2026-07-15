/**
 * docpath:write-spec — 写入 spec.md
 *
 * 接受 spec 内容（通过参数或 stdin），写入 .docpath/tasks/current/spec.md，
 * 并更新状态为 brainstorming → planning。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { nextCommand, runPostWriteSteps } from './runtime.js';
import { validateSpecContent } from '../utils/doc-parser.js';
import { writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';
import { canonicalTaskDir, currentTaskDir } from '../utils/task-files.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { readStdin } from '../utils/stdin.js';
import { taskIdFromMarkdown } from '../utils/structured-docs.js';

interface WriteSpecOptions {
  cwd: string;
  /** spec 内容（YAML/Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
}

interface SpecTaskIdentity {
  taskId: string;
  taskTitle: string;
}

async function assertDocpathWorkspace(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }
  return docpathDir;
}

async function readSpecContent(options: WriteSpecOptions): Promise<string> {
  let specContent = options.content || '';

  if (!specContent && options.stdin !== false) {
    specContent = await readStdin();
  }

  if (!specContent.trim()) {
    console.error('❌  未提供 spec 内容。用法：');
    console.error('   docpath write-spec --content "..."');
    console.error('   echo "..." | docpath write-spec --stdin');
    process.exit(1);
  }

  return specContent;
}

async function validateSpecOrExit(cwd: string, docpathDir: string, specContent: string): Promise<void> {
  const validation = validateSpecContent(specContent);
  if (validation.ok) return;

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || taskIdFromMarkdown(specContent) || 'current';
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), 'spec.md');
  const currentPath = join(currentTaskDir(docpathDir), 'spec.md');
  console.error('❌  spec.md 结构校验失败：');
  console.error(`   实际目标: ${canonicalPath}`);
  console.error(`   current 视图: ${currentPath}`);
  for (const issue of validation.issues) {
    console.error(`   - ${formatValidationIssue(issue)}`);
  }
  process.exit(1);
}

function titleFromSpecHeading(specContent: string): string {
  return specContent.match(/^#\s+T-\S+\s+-\s+(.+)$/m)?.[1]?.trim() || '';
}

function resolveSpecTaskIdentity(
  current: Awaited<ReturnType<typeof readCurrentState>>,
  specContent: string,
): SpecTaskIdentity {
  const declaredTaskId = taskIdFromMarkdown(specContent);
  const activeStateTaskId = current && !['idle', 'completed'].includes(current.phase)
    ? current.task_id?.trim()
    : '';
  const taskId = activeStateTaskId || declaredTaskId || '';
  if (!taskId) {
    console.error('❌  无法从 spec 首行解析 task_id。请使用 `# T-<date>-<slug> - <title>` 作为标题。');
    process.exit(1);
  }

  return {
    taskId,
    taskTitle: activeStateTaskId ? current?.task_title?.trim() || titleFromSpecHeading(specContent) : titleFromSpecHeading(specContent),
  };
}

function shouldRequireCleanWorktreeForSpecWrite(current: Awaited<ReturnType<typeof readCurrentState>>): boolean {
  return !current || current.phase === 'idle' || current.phase === 'completed';
}

function isSameActiveTaskSpecResync(
  current: Awaited<ReturnType<typeof readCurrentState>>,
  specContent: string,
): boolean {
  if (!current || ['idle', 'completed'].includes(current.phase)) return false;
  const declaredTaskId = taskIdFromMarkdown(specContent);
  return !!declaredTaskId && declaredTaskId === current.task_id?.trim();
}

export async function writeSpecCommand(options: WriteSpecOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await assertDocpathWorkspace(cwd);
  const specContent = await readSpecContent(options);
  await validateSpecOrExit(cwd, docpathDir, specContent);

  const current = await readCurrentState(cwd);
  const { taskId, taskTitle } = resolveSpecTaskIdentity(current, specContent);

  if (shouldRequireCleanWorktreeForSpecWrite(current)) {
    assertCleanWorktreeForNewTask(cwd, 'docpath write-spec');
  }
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  console.log(`✅  spec.md 已写入: ${canonicalPath}`);

  if (isSameActiveTaskSpecResync(current, specContent)) {
    await nextCommand({ cwd });
    return;
  }

  // 更新状态为 drafting → planning（brainstorm 完成）。
  // 文件已写入即命令成功，后续状态转换/next 失败不抛出，避免误导退出码（R-248）。
  await runPostWriteSteps(cwd, 'task.created', {
    taskId,
    taskTitle,
    currentStep: 'spec 已写入，下一步: docpath plan',
  });
}

function formatValidationIssue(issue: { message: string; line?: number; section?: string; field?: string }): string {
  const details = [
    issue.line ? `line ${issue.line}` : '',
    issue.section ? `section ${issue.section}` : '',
    issue.field ? `field ${issue.field}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${issue.message} (${details.join(', ')})` : issue.message;
}

/**
 * 从 stdin 读取全部内容
 */
