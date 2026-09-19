/**
 * docpath:learn — 经验规约固化流水线
 *
 * 将 workspace/lesson-candidates.md 中提炼的踩坑经验与最佳实践，
 * 晋升为 .docpath/rules/style.md 或 architecture.md 的系统级硬规则。
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  classifyCandidateBlocks,
  parseCandidateBlocks,
} from '../utils/lesson-candidates.js';
import { readRuleFile, type RuleName } from '../utils/rules.js';

export interface LearnOptions {
  cwd: string;
  dryRun?: boolean;
  action?: 'learn' | 'groom' | 'prune';
  agent?: boolean;
}

export async function learnCommand(options: LearnOptions): Promise<void> {
  const { cwd, dryRun = false, action = 'learn', agent = false } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);
  const candidatesPath = join(docpathDir, 'workspace', 'lesson-candidates.md');

  if (!existsSync(candidatesPath)) {
    if (agent) {
      console.log(stringify({ agent_view: 'learn', status: 'empty', candidates_count: 0 }));
    } else {
      console.log('ℹ️  暂无可学习的 Lesson 候选（workspace/lesson-candidates.md 不存在）');
    }
    return;
  }

  const content = await readFile(candidatesPath, 'utf-8');
  const blocks = parseCandidateBlocks(content);

  if (blocks.length === 0) {
    if (agent) {
      console.log(stringify({ agent_view: 'learn', status: 'empty', candidates_count: 0 }));
    } else {
      console.log('ℹ️  候选池为空，无需处理');
    }
    return;
  }

  const classifications = classifyCandidateBlocks(blocks);
  const keepList = classifications.filter((c) => c.action === 'keep');
  const skipList = classifications.filter((c) => c.action === 'skip' || c.action === 'archive');

  if (agent && (action === 'groom' || dryRun)) {
    console.log(stringify({
      agent_view: 'learn',
      action: dryRun ? 'preview' : action,
      candidates_count: blocks.length,
      promotable_count: keepList.length,
      noise_count: skipList.length,
      promotable: keepList.map((k) => ({
        title: k.block.title,
        target: k.block.target || 'style',
        type: k.pattern?.type || 'best-practice',
        key: k.block.key,
        task_id: k.block.taskId || '',
        summary: k.block.description.slice(0, 200),
      })),
      noise: skipList.map((s) => ({
        title: s.block.title,
        reasons: s.reasons,
      })),
    }));
    return;
  }

  if (!agent) {
    console.log(`\n🧠  Lesson 经验固化流水线 (${blocks.length} 个候选)...`);
    console.log(`   ✅ 可晋升规则: ${keepList.length} 个`);
    console.log(`   ⏭️ 低信噪比/已忽略: ${skipList.length} 个\n`);
  }

  if (action === 'groom' || dryRun) {
    for (const item of keepList) {
      console.log(`  📌 [晋升候选] ${item.block.title} → target: ${item.block.target || 'style'}`);
      console.log(`     摘要: ${item.block.description.slice(0, 100)}...`);
    }
    for (const item of skipList) {
      console.log(`  🗑️ [待修剪] ${item.block.title} (${item.reasons.join(', ') || '低信号'})`);
    }
    if (dryRun) {
      console.log('\n[dry-run] 预览结束，未修改任何文件。运行 `docpath learn` 执行固化。');
    }
    return;
  }

  if (action === 'prune') {
    const keptContent = keepList.map((c) => c.block.raw).join('\n\n');
    await writeFile(candidatesPath, `# Lesson Candidates\n\n${keptContent}\n`, 'utf-8');
    if (agent) {
      console.log(stringify({
        agent_view: 'learn',
        action: 'prune',
        pruned_count: skipList.length,
        retained_count: keepList.length,
      }));
    } else {
      console.log(`🧹  已清理 ${skipList.length} 个低价值候选，保留 ${keepList.length} 个待固化候选`);
    }
    return;
  }

  const promotedCount: Record<string, number> = { style: 0, architecture: 0 };
  const promotedRules: Array<{ title: string; target: string; file: string }> = [];

  for (const item of keepList) {
    const targetName: string = (item.block.target || 'style').toLowerCase();
    const { content: currentRuleContent, file } = await readRuleFile(docpathDir, targetName);

    const ruleEntry = [
      '',
      `## ${item.pattern?.type || 'pattern'}: ${item.block.title}`,
      `- rationale: ${item.block.description.trim()}`,
      `### Evidence`,
      `- 任务来源: ${item.block.taskId || 'session'}`,
      `- 原始经验: ${item.block.key}`,
      '',
    ].join('\n');

    if (!currentRuleContent.includes(item.block.key)) {
      const initialHeader = currentRuleContent.trim().length === 0
        ? `# ${targetName.charAt(0).toUpperCase() + targetName.slice(1)} Rules\n\n`
        : currentRuleContent.trimEnd() + '\n';
      await writeFile(file.path, initialHeader + ruleEntry, 'utf-8');
      promotedCount[targetName] = (promotedCount[targetName] || 0) + 1;
      promotedRules.push({
        title: item.block.title,
        target: targetName,
        file: file.displayPath,
      });
      if (!agent) {
        console.log(`  ✨ 已晋升到 ${file.displayPath}: ${item.block.title}`);
      }
    }
  }

  await writeFile(candidatesPath, '# Lesson Candidates\n\n', 'utf-8');

  const totalPromoted = Object.values(promotedCount).reduce((sum, count) => sum + count, 0);

  if (agent) {
    console.log(stringify({
      agent_view: 'learn',
      action: 'promoted',
      promoted_count: totalPromoted,
      style_rules_promoted: promotedCount.style || 0,
      architecture_rules_promoted: promotedCount.architecture || 0,
      breakdown: promotedCount,
      promoted_rules: promotedRules,
    }));
  } else {
    const details = Object.entries(promotedCount)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');
    console.log(`\n🎉  固化完成！共晋升 ${totalPromoted} 条规则（${details || '0'}），候选池已清空。\n`);
  }
}
