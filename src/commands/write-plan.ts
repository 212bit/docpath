/**
 * docpath:write-plan — 写入 plan.md
 *
 * 接受 plan 内容（通过参数或 stdin），写入 .docpath/tasks/current/plan.md，
 * 并更新状态为 planning，下一步进入 docpath go。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { validatePlanContent } from '../utils/doc-parser.js';
import { canonicalTaskDir, currentTaskDir, writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';

interface WritePlanOptions {
  cwd: string;
  /** plan 内容（Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
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
  const taskId = current?.task_id || 'current';
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'plan.md', planContent);

  console.log(`✅  plan.md 已写入: ${canonicalPath}`);

  await transitionWorkflow(cwd, 'plan.ready', { currentStep: 'plan 已写入，下一步: docpath go' });
  console.log('📌  状态已更新为 planning');
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

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}
