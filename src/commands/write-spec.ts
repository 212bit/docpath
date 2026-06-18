/**
 * docpath:write-spec — 写入 spec.md
 *
 * 接受 spec 内容（通过参数或 stdin），写入 .docpath/tasks/current/spec.md，
 * 并更新状态为 brainstorming → planning。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { validateSpecContent } from '../utils/doc-parser.js';
import { writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';
import { canonicalTaskDir, currentTaskDir } from '../utils/task-files.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { readStdin } from '../utils/stdin.js';

interface WriteSpecOptions {
  cwd: string;
  /** spec 内容（YAML/Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
}

export async function writeSpecCommand(options: WriteSpecOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  // 读取内容：优先参数，否则 stdin
  let specContent = content || '';

  if (!specContent && options.stdin !== false) {
    // 从 stdin 读取
    specContent = await readStdin();
  }

  if (!specContent.trim()) {
    console.error('❌  未提供 spec 内容。用法：');
    console.error('   docpath write-spec --content "..."');
    console.error('   echo "..." | docpath write-spec --stdin');
    process.exit(1);
  }

  const validation = validateSpecContent(specContent);
  if (!validation.ok) {
    const current = await readCurrentState(cwd);
    const taskId = current?.task_id || 'current';
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

  const current = await readCurrentState(cwd);
  if (!current?.task_id || current.phase === 'idle' || current.phase === 'completed') {
    assertCleanWorktreeForNewTask(cwd, 'docpath write-spec');
  }
  const taskId = current?.task_id || 'current';
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  console.log(`✅  spec.md 已写入: ${canonicalPath}`);

  // 更新状态为 drafting → planning（brainstorm 完成）
  await transitionWorkflow(cwd, 'task.created', { currentStep: 'spec 已写入，下一步: docpath plan' });
  console.log('📌  状态已更新为 drafting (spec-written)');
  await nextCommand({ cwd });
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
