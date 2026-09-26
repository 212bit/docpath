/**
 * docpath:changelog — 自动化生成并更新 CHANGELOG.md 与版本发布清单
 *
 * 聚合 .docpath/tasks/done/ 归档任务、Backlog 完成项与 Git 提交，
 * 智能分类并一键输出/写盘。
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolveDocpathDir } from '../utils/file.js';
import {
  buildChangelogData,
  writeChangelogFile,
  type ChangelogOptions,
} from '../engine/changelog.js';

export async function changelogCommand(options: ChangelogOptions): Promise<void> {
  const { cwd, version = 'Unreleased', title, since, dryRun = false, agent = false, json = false, output } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  const data = await buildChangelogData(cwd, {
    version,
    title,
    since,
  });

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (agent) {
    console.log(
      stringify({
        agent_view: 'changelog',
        version: data.version,
        title: data.title,
        date: data.date,
        since_ref: data.sinceRef || null,
        metrics: data.metrics,
        categories: {
          breaking_count: data.categories.breaking.length,
          features_count: data.categories.features.length,
          improvements_count: data.categories.improvements.length,
          fixes_count: data.categories.fixes.length,
          decisions_count: data.categories.decisions.length,
          rules_count: data.categories.rules.length,
          other_count: data.categories.other.length,
        },
        markdown: data.markdown,
      }),
    );
    return;
  }

  if (dryRun) {
    console.log(`\n📋  [dry-run] Changelog 预览 (${version}):\n`);
    console.log(data.markdown);
    console.log('\n💡  [dry-run] 预览结束，未修改任何文件。去掉 --dry-run 将自动写入 CHANGELOG.md\n');
    return;
  }

  if (output) {
    await writeFile(output, data.markdown, 'utf-8');
    console.log(`\n✅  Changelog 已成功导出至: ${output}\n`);
    return;
  }

  const changelogPath = await writeChangelogFile(cwd, data.markdown);
  console.log(`\n🎉  CHANGELOG.md 已自动更新 (${data.version})！`);
  console.log(`   📄 路径: ${changelogPath}`);
  console.log(`   📊 统计: ${data.metrics.tasksDelivered} 个任务 | ${data.metrics.backlogClosed} 个需求 | ${data.metrics.decisionsRecorded} 个 ADR\n`);
}
