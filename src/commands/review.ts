/**
 * docpath:review — 结构化代码审查
 *
 * 收集 git diff + spec.md + plan.md，输出结构化审查 prompt。
 * 由宿主 Agent 执行审查，结果可追加到 spec.md。
 */

import { existsSync } from 'fs';
import { readFile, appendFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';

interface ReviewOptions {
  cwd: string;
  /** 审查范围: 未提交 / 最近一次提交 / 全部分支 */
  scope?: 'staged' | 'last_commit' | 'all';
}

function getGitDiff(scope: string, cwd: string): string {
  try {
    switch (scope) {
      case 'staged':
        return execSync('git diff --cached 2>/dev/null || git diff', { cwd, encoding: 'utf-8', timeout: 10000 });
      case 'last_commit':
        return execSync('git diff HEAD~1..HEAD 2>/dev/null || echo "no commits"', { cwd, encoding: 'utf-8', timeout: 10000 });
      case 'all':
        return execSync('git diff origin/main..HEAD 2>/dev/null || git log --oneline -20', { cwd, encoding: 'utf-8', timeout: 10000 });
      default:
        return execSync('git diff', { cwd, encoding: 'utf-8', timeout: 10000 });
    }
  } catch {
    return '(git diff 不可用)';
  }
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const { cwd, scope = 'staged' } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n🔍  代码审查...\n');

  const current = await readCurrentMd(cwd);
  const level = current?.level || 0;
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');

  const spec = existsSync(specPath) ? await readFile(specPath, 'utf-8') : '';
  const plan = existsSync(planPath) ? await readFile(planPath, 'utf-8') : '';
  const diff = getGitDiff(scope, cwd);

  if (!diff.trim() || diff.includes('not available')) {
    console.log('⚠️  无代码变更可审查。请先完成开发任务。\n');
    return;
  }

  console.log(`📊  审查范围: ${scope === 'staged' ? '未提交' : scope === 'last_commit' ? '最近提交' : '全部分支'}`);
  console.log(`📝  Diff 行数: ${diff.split('\n').length}\n`);

  // [Agent Mode] 输出结构化审查 prompt
  const prompt = emitPrompt({
    task: 'review',
    system: '你是代码审查专家。请审查代码变更，输出结构化报告。',
    context: {
      '项目规约': spec.slice(0, 2000),
      '任务计划': plan.slice(0, 2000),
      '代码变更 (diff)': '```\n' + diff.slice(0, 8000) + '\n```',
    },
    instructions: [
      '请按以下格式输出审查报告：',
      '',
      '### 📋 审查摘要',
      '(一句话总结)',
      '',
      '### ✅ 通过项',
      '- (好的实践)',
      '',
      '### ⚠️ 需关注',
      '- (潜在问题)',
      '',
      '### 🔧 建议修复',
      '- (具体建议)',
      '',
      '### 📊 评分',
      '通过率: X/10',
      '',
      level >= 2 ? '完成后将审查记录追加到 spec.md: docpath write-review' : '',
    ],
  });

  console.log(prompt);

  await updateCurrentState(cwd, 'reviewing');

  const taskId = current?.task_id || 'unknown';
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'review',
    status: 'done',
    context: `代码审查 prompt 已输出 (${scope})`,
  });

  console.log('\n📌 完成后运行: docpath write-review\n');
}
