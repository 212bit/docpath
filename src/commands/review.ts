/**
 * docpath:review — 结构化代码审查流程
 *
 * 借鉴 Superpowers 的 code-review:
 * 1. collect — 收集变更文件
 * 2. analyze — 逐文件分析 (复杂度/安全/性能)
 * 3. approve/request-changes — 结论
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { appendDecision } from '../governance/decisions.js';

interface ReviewOptions {
  cwd: string;
  output?: string;
  scope?: string;
  useAi?: boolean;
  approve?: boolean;
}

interface ReviewFinding {
  file: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export async function reviewCommand(opts: ReviewOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(opts.cwd);

  console.log('🔍 代码审查开始...');

  // 1. 收集变更文件
  let changedFiles: string[] = [];
  try {
    // 多策略 git diff：优先 HEAD~1，fallback 到 --cached，最后 git show HEAD
    const strategies = [
      'git diff --name-only HEAD~1',
      'git diff --name-only --cached',
      'git show --name-only --format="" HEAD',
    ];
    for (const cmd of strategies) {
      try {
        const diff = execSync(cmd, { cwd: opts.cwd, encoding: 'utf-8', timeout: 10000 });
        changedFiles = diff.trim().split('\n').filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json'));
        if (changedFiles.length > 0) break;
      } catch { /* try next strategy */ }
    }
  } catch {
    // 可能没有 git 仓库
  }

  if (changedFiles.length === 0) {
    console.log('⚠️  未发现变更文件');
    return;
  }

  console.log(`📋 审查 ${changedFiles.length} 个文件...`);

  const findings: ReviewFinding[] = [];

  for (const file of changedFiles) {
    const fullPath = join(opts.cwd, file);
    if (!existsSync(fullPath)) continue;

    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // 基础静态分析
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // TODO 未处理
      if (/\/\/\s*TODO/i.test(line)) {
        findings.push({ file, severity: 'info', message: `L${i + 1}: 未处理的 TODO: ${line.trim().slice(0, 80)}` });
      }
      // console.log 遗留
      if (/console\.(log|debug)\(/.test(line) && !file.includes('test')) {
        findings.push({ file, severity: 'warn', message: `L${i + 1}: 生产代码中的 console.log` });
      }
      // any 类型
      if (/:\s*any\b/.test(line)) {
        findings.push({ file, severity: 'warn', message: `L${i + 1}: 使用了 any 类型` });
      }
      // 硬编码路径
      if (/['"]\/(Users|home|tmp)\//.test(line)) {
        findings.push({ file, severity: 'error', message: `L${i + 1}: 硬编码绝对路径` });
      }
    }

    // 复杂度检查 (函数行数 > 50)
    const funcMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*\{[\s\S]*?\n\}/g);
    if (funcMatches) {
      for (const func of funcMatches) {
        const funcLines = func.split('\n').length;
        if (funcLines > 50) {
          const funcName = func.match(/function\s+(\w+)/)?.[1] || 'unknown';
          findings.push({ file, severity: 'warn', message: `函数 ${funcName} 过长 (${funcLines} 行)，建议拆分` });
        }
      }
    }
  }

  // 输出报告
  const errors = findings.filter(f => f.severity === 'error');
  const warns = findings.filter(f => f.severity === 'warn');
  const infos = findings.filter(f => f.severity === 'info');

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} 个错误:`);
    errors.forEach(f => console.log(`  [${f.file}] ${f.message}`));
  }
  if (warns.length > 0) {
    console.log(`\n⚠️  ${warns.length} 个警告:`);
    warns.forEach(f => console.log(`  [${f.file}] ${f.message}`));
  }
  if (infos.length > 0) {
    console.log(`\n💡 ${infos.length} 个提示:`);
    infos.forEach(f => console.log(`  [f.file] ${f.message}`));
  }

  const current = await readCurrentMd(opts.cwd);
  const taskId = current?.task_id || 'review';

  // 如果 --approve，跳过所有检查直接批准
  if (opts.approve) {
    console.log('\n✅ 审查已手动批准 (跳过自动检查)');
    await appendDecision(opts.cwd, 'review', '手动批准: 跳过自动检查');
    await writeBreadcrumb(opts.cwd, {
      taskId,
      step: 'review',
      status: 'done',
      context: '手动批准',
    });
    const reviewPath = join(docpathDir, 'workspace', 'review.md');
    await writeFile(reviewPath, [
      '# Code Review Report', '',
      `**时间**: ${new Date().toISOString()}`,
      `**状态**: ✅ 手动批准 (跳过自动检查)`,
    ].join('\n'), 'utf-8');
    // 更新状态机 → review_pass
    await updateCurrentState(opts.cwd, 'review_pass', { phase: 'reviewing' });
    return;
  }

  const approved = errors.length === 0;
  console.log(`\n${approved ? '✅ 审查通过' : '❌ 需要修改'} (${errors.length} 错误, ${warns.length} 警告)`);

  // 记录决策
  await appendDecision(opts.cwd, 'review',
    `${approved ? '通过' : '需修改'}: ${errors.length} 错误, ${warns.length} 警告`);

  // 写入 breadcrumb
  await writeBreadcrumb(opts.cwd, {
    taskId,
    step: 'review',
    status: approved ? 'done' : 'blocked',
    context: `代码审查: ${errors.length} 错误, ${warns.length} 警告, ${infos.length} 提示`,
  });

  if (approved) {
    await updateCurrentState(opts.cwd, 'review_pass', { phase: 'reviewing' });
  }

  // 写入 review.md
  const reviewPath = join(docpathDir, 'workspace', 'review.md');
  const lines = ['# Code Review Report', '', `**时间**: ${new Date().toISOString()}`, `**文件**: ${changedFiles.length}`, ''];
  for (const f of findings) {
    lines.push(`- [${f.severity.toUpperCase()}] ${f.file}: ${f.message}`);
  }
  await writeFile(reviewPath, lines.join('\n'), 'utf-8');
}
