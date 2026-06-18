/**
 * docpath:write-journal — 将归档知识记录写回当前任务 spec.md
 *
 * 接受 markdown 内容（通过参数或 stdin），追加到 .docpath/tasks/current/spec.md。
 * 该命令只负责落盘知识记录，不推进工作流状态。
 */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { readActiveTaskFile, writeActiveTaskFile } from '../utils/task-files.js';
import { readStdin } from '../utils/stdin.js';

interface WriteJournalOptions {
  cwd: string;
  /** knowledge record 内容（Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
}

const JOURNAL_MARKER = '## Journal Record';

export async function writeJournalCommand(options: WriteJournalOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  let journalContent = content || '';
  if (!journalContent && options.stdin !== false) {
    journalContent = await readStdin();
  }

  if (!journalContent.trim()) {
    console.error('❌  未提供 journal 内容。用法：');
    console.error('   docpath write-journal --content "..."');
    console.error('   echo "..." | docpath write-journal --stdin');
    process.exit(1);
  }

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || 'current';
  const previous = await readActiveTaskFile(docpathDir, taskId, 'spec.md');

  // 防御性检查：如果 spec.md 看起来不像一个正常的 spec（缺少标题或章节结构），警告用户
  if (previous && !previous.includes('##') && !previous.includes('# T-')) {
    console.warn('⚠️  警告: spec.md 看起来不像一个正常的规范文档');
    console.warn('   当前内容可能已被破坏或为空');
  }

  // 如果 spec.md 已经以 Journal Record 开头，说明可能已经被覆盖
  if (previous.trim().startsWith(JOURNAL_MARKER)) {
    console.error('❌  错误: spec.md 已经以 Journal Record 开头');
    console.error('   这可能意味着原始 spec 已被覆盖');
    console.error('   请先恢复原始 spec.md 内容，再运行 write-journal');
    process.exit(1);
  }

  const contentToAppend = journalContent.trim();
  const next = previous.trimEnd()
    ? `${previous.trimEnd()}\n\n${JOURNAL_MARKER}\n\n${contentToAppend}\n`
    : `${JOURNAL_MARKER}\n\n${contentToAppend}\n`;

  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'spec.md', next);
  console.log(`✅  journal 记录已写入: ${canonicalPath}`);
  console.log('📌  知识记录已追加到当前任务 spec.md');
}

