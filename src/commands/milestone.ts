/**
 * docpath:milestone — 阶段性/版本里程碑总结与发布简报
 *
 * 跨已归档任务 (tasks/done/)、Backlog、架构决策 (ADRs) 与系统规则，
 * 自动聚合生成结构化版本发布报告 docs/releases/vX.Y.Z.md 与 CHANGELOG.md。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  collectMilestoneData,
  renderMilestoneMarkdown,
  persistMilestone,
  listMilestones,
  type MilestoneData,
} from '../utils/milestone.js';

export interface MilestoneOptions {
  cwd: string;
  version?: string;
  title?: string;
  action?: 'create' | 'list' | 'show';
  dryRun?: boolean;
  agent?: boolean;
  json?: boolean;
}

export async function milestoneCommand(options: MilestoneOptions): Promise<void> {
  const { cwd, action = 'create', version, title, dryRun = false, agent = false, json = false } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  // 1. Action: list
  if (action === 'list') {
    const milestones = await listMilestones(cwd);
    if (json) {
      console.log(JSON.stringify(milestones, null, 2));
      return;
    }
    if (agent) {
      console.log(stringify({
        agent_view: 'milestone_list',
        count: milestones.length,
        milestones,
      }));
      return;
    }

    console.log(`\n📦  历史里程碑/发布总结 (${milestones.length} 个记录):\n`);
    if (milestones.length === 0) {
      console.log('   (暂无记录，运行 `docpath milestone create v0.1.0` 创建首个里程碑)');
    } else {
      for (const m of milestones) {
        console.log(`  📌 [${m.version}] ${m.title} (${m.date}) — ${m.taskCount} 个交付任务`);
        console.log(`     路径: ${m.displayPath}`);
      }
    }
    console.log('');
    return;
  }

  // 2. Action: show
  if (action === 'show') {
    if (!version) {
      console.error('❌  请指定要查看的里程碑版本号，例如: `docpath milestone show v0.1.0`');
      process.exit(1);
    }
    const releasesPath = join(cwd, 'docs', 'releases', `${version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`);
    const milestonesPath = join(docpathDir, 'milestones', `${version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`);
    const targetPath = existsSync(releasesPath) ? releasesPath : existsSync(milestonesPath) ? milestonesPath : null;

    if (!targetPath) {
      console.error(`❌  未找到版本 ${version} 的里程碑报告`);
      process.exit(1);
    }

    const content = await readFile(targetPath, 'utf-8');
    console.log(`\n${content}\n`);
    return;
  }

  // 3. Action: create (default)
  if (!version) {
    console.error('❌  请指定里程碑版本号，例如: `docpath milestone create v0.2.0 --title "架构升级"`');
    process.exit(1);
  }

  const milestoneData: MilestoneData = await collectMilestoneData(cwd, version, title);

  if (dryRun) {
    const previewMarkdown = renderMilestoneMarkdown(milestoneData);
    if (agent) {
      console.log(stringify({
        agent_view: 'milestone_preview',
        dry_run: true,
        data: milestoneData,
      }));
    } else {
      console.log(`\n📝  [dry-run] 里程碑发布简报预览 (${version}):\n`);
      console.log(previewMarkdown);
      console.log('\n[dry-run] 预览结束，未修改任何文件。去掉 --dry-run 执行正式发布写入。\n');
    }
    return;
  }

  const { releaseDocPath, changelogPath } = await persistMilestone(cwd, milestoneData);

  if (agent) {
    console.log(stringify({
      agent_view: 'milestone_created',
      version: milestoneData.version,
      title: milestoneData.title,
      tasks_delivered: milestoneData.metrics.totalTasks,
      backlog_closed: milestoneData.metrics.totalBacklogClosed,
      decisions_recorded: milestoneData.metrics.totalDecisions,
      release_doc: releaseDocPath,
      changelog: changelogPath,
    }));
  } else {
    console.log(`\n🎉  里程碑 ${version} 阶段性总结生成完毕！`);
    console.log(`   📄 发布简报: ${releaseDocPath}`);
    console.log(`   📑 变更日志: ${changelogPath} (已自动更新)`);
    console.log(`   🔍 活文档索引: 已自动同步，支持 \`docpath docs search ${version}\` 瞬时检索\n`);
  }
}
