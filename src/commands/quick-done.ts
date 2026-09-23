/**
 * docpath quick-done — 一键任务收口（R-340）
 *
 * 组合 `docpath done`（内部已含 check/review/journal 门禁序列）与
 * `docpath changes --agent`（提交就绪报告），把 quick/标准任务的收尾
 * 从多次交互压缩为一次调用；输出提交建议后停止，不做自动提交——
 * 提交仍由 Agent 按 Git 约定执行（suggested_commit_message 作标题）。
 *
 * 门禁不削弱：done 失败时异常上抛，不会进入提交准备阶段。
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { doneCommand } from './done.js';
import { changesCommand } from './changes.js';
import { readCurrentState, resolveBoundTaskId } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { exitWithError } from '../utils/error-helpers.js';
import { resolveDocpathDir } from '../utils/file.js';

export interface QuickDoneOptions {
  cwd: string;
  note?: string;
  session?: string;
  skipCheck?: boolean;
  skipReview?: boolean;
  skipTests?: boolean;
  skipLint?: boolean;
  approveReview?: boolean;
  noDirtyReminder?: boolean;
  gotcha?: string;
  lesson?: string;
  commit?: boolean;
}

async function recordQuickLessonCandidate(cwd: string, taskId: string, text: string): Promise<void> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const lessonsPath = join(docpathDir, 'workspace', 'lesson-candidates.md');
    const now = new Date().toISOString();
    const lessonKey = `${taskId}-gotcha-${Date.now().toString(36)}`;

    const lessonLines = [
      `## ${taskId} — ${now}`,
      '',
      `- task_id: ${taskId}`,
      '- type: anti-pattern',
      '- target: style',
      '- source: quick-done',
      `- key: ${lessonKey}`,
      '',
      '### Lesson',
      '',
      text.trim(),
      '',
      '### Evidence',
      '',
      '- .docpath/workspace/breadcrumb.md',
      '',
      '---',
      '',
    ];

    const previous = existsSync(lessonsPath) ? await readFile(lessonsPath, 'utf-8') : '# Lesson Candidates\n\n';
    await writeFile(lessonsPath, previous.trimEnd() + '\n\n' + lessonLines.join('\n'), 'utf-8');
    console.log('🧠  Lesson/Gotcha 候选已记录: workspace/lesson-candidates.md');
  } catch (e) {
    console.warn('⚠️  Lesson 候选记录失败（非致命）:', (e as Error).message);
  }
}

export async function quickDoneCommand(options: QuickDoneOptions): Promise<void> {
  const { cwd } = options;
  const stateAtStart = await readCurrentState(cwd);
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    exitWithError('NO_ACTIVE_TASK');
  }
  const session = resolveSessionContext(options.session);

  console.log(`🚀  quick-done: 一键收口 ${taskId}（done 门禁序列 + 提交准备）\n`);

  // 阶段 1：完整 done 门禁序列（check → review → journal，按 profile/风险自适应）。
  await doneCommand({
    cwd,
    note: options.note,
    session: session.sessionId,
    skipCheck: options.skipCheck,
    skipReview: options.skipReview,
    skipTests: options.skipTests,
    skipLint: options.skipLint,
    approveReview: options.approveReview,
    noDirtyReminder: options.noDirtyReminder,
    commit: options.commit,
  });

  // 记录轻量经验/踩坑候选（若提供）
  const lessonText = options.gotcha || options.lesson;
  if (lessonText) {
    await recordQuickLessonCandidate(cwd, taskId, lessonText);
  }

  // 阶段 2：提交就绪报告（closeout summary 可直接作 commit 标题）。
  console.log('─── 提交准备 (changes --agent) ───\n');
  await changesCommand({ cwd, agent: true });

  console.log('');
  console.log('👉  收口完成。按 Git 约定提交时，用上方 suggested_commit_message 作标题：');
  console.log('      docpath commit --stage   # 或 git add -A && git commit -m "<suggested_commit_message>"');
}
