/**
 * docpath:milestone — 阶段性/版本里程碑目标规划、Backlog拆解、跟踪与验收发布闭环
 *
 * 支持大目标前置规划 (M-###)、智能/批量拆解为 Backlog (R-###)、
 * 进度大盘跟踪 (status/board)、集成质量与准则验收 (verify/accept)、以及发布简报自动生成 (release/publish)。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  buildChangelogData,
  publishMilestoneRelease,
  renderMilestoneReleaseDocMarkdown,
  type ChangelogReleaseData,
} from '../engine/changelog.js';
import {
  renderGlobalTimelineMarkdown,
  listMilestones,
  listMilestoneItems,
  createMilestoneItem,
  readMilestoneItem,
  bindMilestoneBacklogs,
  unbindMilestoneBacklogs,
  decomposeMilestone,
  getMilestoneProgress,
  verifyMilestone,
  acceptMilestone,
  releaseMilestone,
  editMilestoneItem,
  auditMilestonesHygiene,
  type MilestoneItem,
  type MilestonePriority,
  type DecomposeItemInput,
} from '../engine/milestone.js';
import type { BacklogKind, BacklogPriority } from '../engine/backlog.js';

export interface MilestoneOptions {
  cwd: string;
  version?: string;
  version_target?: string;
  releaseVersion?: string;
  ver?: string;
  title?: string;
  status?: string;
  since?: string;
  action?:
    | 'create'
    | 'draft'
    | 'publish'
    | 'list'
    | 'show'
    | 'timeline'
    | 'add'
    | 'plan'
    | 'decompose'
    | 'split'
    | 'bind'
    | 'link'
    | 'unbind'
    | 'status'
    | 'board'
    | 'track'
    | 'verify'
    | 'check'
    | 'accept'
    | 'release'
    | 'edit'
    | 'doctor'
    | 'groom';
  dryRun?: boolean;
  agent?: boolean;
  json?: boolean;
  priority?: string;
  targetDate?: string;
  owner?: string;
  objective?: string;
  nonGoals?: string;
  body?: string;
  criteria?: string[];
  backlogIds?: string[];
  items?: string | DecomposeItemInput[];
  force?: boolean;
}

export async function milestoneCommand(options: MilestoneOptions): Promise<void> {
  const {
    cwd,
    action = 'create',
    version,
    version_target,
    releaseVersion,
    ver,
    title,
    status,
    since,
    dryRun = false,
    agent = false,
    json = false,
    priority,
    targetDate,
    owner,
    objective,
    nonGoals,
    body,
    criteria,
    backlogIds = [],
    items,
    force = false,
  } = options;

  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  // 0. Action: timeline
  if (action === 'timeline') {
    const milestones = await listMilestones(cwd);
    const timelineMd = renderGlobalTimelineMarkdown(milestones);
    if (json) {
      console.log(JSON.stringify({ milestones, timeline_markdown: timelineMd }, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_timeline',
          count: milestones.length,
          timeline_markdown: timelineMd,
        }),
      );
      return;
    }
    console.log(`\n${timelineMd}\n`);
    return;
  }

  // 1. Action: list
  if (action === 'list') {
    const planningMilestones = await listMilestoneItems(cwd);
    const historicalMilestones = await listMilestones(cwd);

    if (json) {
      console.log(
        JSON.stringify(
          {
            active_milestones: planningMilestones,
            historical_releases: historicalMilestones,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_list',
          active_count: planningMilestones.length,
          historical_count: historicalMilestones.length,
          milestones: planningMilestones,
          historical_releases: historicalMilestones,
        }),
      );
      return;
    }

    console.log(`\n🎯  当前规划中里程碑 (${planningMilestones.length} 个):\n`);
    if (planningMilestones.length === 0) {
      console.log('   (暂无活跃规划里程碑，运行 `docpath milestone add "<title>"` 规划新目标)');
    } else {
      for (const m of planningMilestones) {
        const vTag = m.version_target ? ` [${m.version_target}]` : '';
        const dTag = m.target_date ? ` (截止: ${m.target_date})` : '';
        console.log(`  📌 [${m.id}]${vTag} ${m.title} [${m.status.toUpperCase()}] [${m.priority}]${dTag}`);
        console.log(`     关联需求: ${m.backlog_ids.length} 项 | 验收准则: ${m.acceptance_criteria.length} 项`);
      }
    }

    console.log(`\n📦  历史发布与发布简报 (${historicalMilestones.length} 个):\n`);
    if (historicalMilestones.length === 0) {
      console.log('   (暂无历史发布记录)');
    } else {
      for (const m of historicalMilestones) {
        console.log(`  🏷️  [${m.version}] ${m.title} (${m.date}) — ${m.taskCount} 个交付任务`);
        console.log(`     路径: ${m.displayPath}`);
      }
    }
    console.log('');
    return;
  }

  // 2. Action: add / plan
  if (action === 'add' || action === 'plan') {
    const milestoneTitle = title || version;
    if (!milestoneTitle) {
      console.error('❌  请指定里程碑标题，例如: `docpath milestone add "权限系统重构" --version v1.2.0`');
      process.exit(1);
    }

    const created = await createMilestoneItem(cwd, {
      title: milestoneTitle,
      version_target: version,
      target_date: targetDate,
      priority: (priority as MilestonePriority) || 'P1',
      owner,
      objective,
      criteria,
      nonGoals,
      body,
    });

    if (json) {
      console.log(JSON.stringify(created, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_created',
          id: created.id,
          title: created.title,
          status: created.status,
          priority: created.priority,
          version_target: created.version_target,
          target_date: created.target_date,
          file: created.filePath,
        }),
      );
      return;
    }

    console.log(`\n✅  成功创建里程碑: [${created.id}] ${created.title}`);
    console.log(`   🏷️  状态: ${created.status} | 优先级: ${created.priority}`);
    if (created.version_target) console.log(`   🎯 目标版本: ${created.version_target}`);
    if (created.target_date) console.log(`   📅 目标日期: ${created.target_date}`);
    console.log(`   📄 路径: .docpath/milestones/${created.id}.md`);
    console.log(`   💡 下一步: 运行 \`docpath milestone decompose ${created.id}\` 拆解 Backlog 或 \`docpath milestone bind ${created.id} R-xxx\` 关联已有需求\n`);
    return;
  }

  // 3. Action: bind / link
  if (action === 'bind' || action === 'link') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要关联的里程碑 ID，例如: `docpath milestone bind M-001 R-101 R-102`');
      process.exit(1);
    }
    if (backlogIds.length === 0) {
      console.error('❌  请提供要关联的 Backlog 需求 ID，例如: `docpath milestone bind M-001 R-101 R-102`');
      process.exit(1);
    }

    const res = await bindMilestoneBacklogs(cwd, milestoneId, backlogIds);

    if (json) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_bound',
          id: res.milestone.id,
          title: res.milestone.title,
          bound_ids: res.boundIds,
          total_backlogs: res.milestone.backlog_ids.length,
        }),
      );
      return;
    }

    console.log(`\n🔗  成功将 ${res.boundIds.length} 个需求关联至里程碑 [${res.milestone.id}] ${res.milestone.title}:`);
    res.boundIds.forEach((id) => console.log(`   - 关联: ${id}`));
    console.log(`   📊 当前里程碑总共关联 ${res.milestone.backlog_ids.length} 个需求\n`);
    return;
  }

  // 4. Action: unbind
  if (action === 'unbind') {
    const milestoneId = version;
    if (!milestoneId || backlogIds.length === 0) {
      console.error('❌  请指定里程碑 ID 及要解绑的需求 ID，例如: `docpath milestone unbind M-001 R-101`');
      process.exit(1);
    }

    const res = await unbindMilestoneBacklogs(cwd, milestoneId, backlogIds);
    if (json) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_unbound',
          id: res.milestone.id,
          unbound_ids: res.unboundIds,
          total_backlogs: res.milestone.backlog_ids.length,
        }),
      );
      return;
    }

    console.log(`\n🔓  成功从里程碑 [${res.milestone.id}] 解绑需求: ${res.unboundIds.join(', ')}\n`);
    return;
  }

  // 5. Action: decompose / split
  if (action === 'decompose' || action === 'split') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要拆解的里程碑 ID，例如: `docpath milestone decompose M-001`');
      process.exit(1);
    }

    let parsedItems: DecomposeItemInput[] = [];
    if (Array.isArray(items)) {
      parsedItems = items;
    } else if (typeof items === 'string') {
      try {
        parsedItems = JSON.parse(items);
      } catch {
        // split by newline / comma
        parsedItems = items
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((titleStr) => ({ title: titleStr.replace(/^[-*\d.]+\s*/, '') }));
      }
    } else if (title) {
      parsedItems = [{ title }];
    }

    const res = await decomposeMilestone(cwd, milestoneId, parsedItems);

    if (json) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_decomposed',
          id: res.milestone.id,
          title: res.milestone.title,
          created_backlogs: res.createdBacklogs.map((b) => ({
            id: b.id,
            title: b.title,
            kind: b.kind,
            priority: b.priority,
          })),
        }),
      );
      return;
    }

    console.log(`\n🧩  里程碑 [${res.milestone.id}] ${res.milestone.title} 拆解完成，生成 ${res.createdBacklogs.length} 个需求条目:\n`);
    for (const b of res.createdBacklogs) {
      console.log(`  👉 [${b.id}] [${b.kind || 'feature'}] [${b.priority}]: ${b.title}`);
    }
    console.log(`\n💡 运行 \`docpath backlog board\` 或 \`docpath milestone status ${res.milestone.id}\` 查看整体进度\n`);
    return;
  }

  // 6. Action: status / board / track
  if (action === 'status' || action === 'board' || action === 'track') {
    const milestoneId = version;
    if (!milestoneId) {
      // If no ID specified, list all active progress
      const itemsList = await listMilestoneItems(cwd);
      if (itemsList.length === 0) {
        console.log('\n📊  暂无活跃里程碑规划。使用 `docpath milestone add "<title>"` 创建\n');
        return;
      }
      const progressList = await Promise.all(itemsList.map((m) => getMilestoneProgress(cwd, m.id)));
      if (json) {
        console.log(JSON.stringify(progressList, null, 2));
        return;
      }
      if (agent) {
        console.log(
          stringify({
            agent_view: 'milestone_board',
            milestones: progressList.map((p) => ({
              id: p.milestone.id,
              title: p.milestone.title,
              status: p.milestone.status,
              percent: p.overall_percent,
              backlogs_done: `${p.backlog_summary.done}/${p.backlog_summary.total}`,
              ready_for_acceptance: p.is_ready_for_acceptance,
            })),
          }),
        );
        return;
      }

      console.log(`\n📊  DocPath 里程碑全景看板 (${progressList.length} 个规划):\n`);
      for (const p of progressList) {
        const bar = renderProgressBar(p.overall_percent);
        console.log(`  🎯 [${p.milestone.id}] ${p.milestone.title} [${p.milestone.status.toUpperCase()}]`);
        console.log(`     进度: ${bar} ${p.overall_percent}% (需求: ${p.backlog_summary.done}/${p.backlog_summary.total} 完成)`);
        if (p.blockers.length > 0) {
          console.log(`     ⚠️  阻塞项: ${p.blockers.slice(0, 2).join('; ')}`);
        }
        console.log('');
      }
      return;
    }

    const progress = await getMilestoneProgress(cwd, milestoneId);

    if (json) {
      console.log(JSON.stringify(progress, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_status',
          id: progress.milestone.id,
          title: progress.milestone.title,
          status: progress.milestone.status,
          priority: progress.milestone.priority,
          version_target: progress.milestone.version_target,
          health: progress.health,
          overall_percent: progress.overall_percent,
          backlog_summary: progress.backlog_summary,
          criteria_summary: progress.criteria_summary,
          top_blockers: progress.top_blockers,
          is_ready_for_acceptance: progress.is_ready_for_acceptance,
          blockers: progress.blockers,
        }),
      );
      return;
    }

    const m = progress.milestone;
    console.log(`\n🎯  里程碑看板: [${m.id}] ${m.title}`);
    console.log(`   🏷️  状态: ${m.status.toUpperCase()} | 优先级: ${m.priority} | 目标版本: ${m.version_target || '未指定'}`);
    console.log(`   🩺 健康状态: ${progress.health.label}`);
    if (progress.health.risk_reasons.length > 0) {
      progress.health.risk_reasons.forEach((r) => console.log(`      ⚠️  ${r}`));
    }
    console.log(`   📊 综合完成度: ${renderProgressBar(progress.overall_percent)} ${progress.overall_percent}%\n`);

    console.log(`📋  关联需求进度 (${progress.backlog_summary.done}/${progress.backlog_summary.total} 完成 - ${progress.backlog_summary.percent}%):`);
    if (progress.backlog_summary.items.length === 0) {
      console.log('   (暂无关联需求，使用 `docpath milestone decompose` 拆解或 `bind` 关联)');
    } else {
      for (const b of progress.backlog_summary.items) {
        const badge = b.status === 'done' ? '✅' : b.status === 'active' ? '🔄' : b.is_blocked ? '🔒' : '⬜';
        const taskTag = b.task ? ` (Task: ${b.task})` : '';
        console.log(`   ${badge} [${b.id}] [${b.status}] [${b.priority}]: ${b.title}${taskTag}`);
      }
    }

    if (progress.top_blockers.length > 0) {
      console.log(`\n🔒  关键阻碍链分析 (Top Blockers):`);
      for (const tb of progress.top_blockers) {
        console.log(`   - 🔴 [${tb.id}] ${tb.title} (${tb.status}): 阻塞了 ${tb.blocked_count} 个后续需求`);
      }
    }

    console.log(`\n🏁  验收准则状态 (${progress.criteria_summary.done}/${progress.criteria_summary.total} 满足):`);
    for (const c of progress.criteria_summary.items) {
      const badge = c.done ? '✅' : '⬜';
      console.log(`   ${badge} [${c.id}] ${c.text}`);
    }

    if (!progress.is_ready_for_acceptance) {
      console.log('\n⚠️  未解决的阻碍/未完成项:');
      progress.blockers.forEach((b) => console.log(`   - ${b}`));
    } else {
      console.log('\n🎉  全部需求与验收准则已就绪！可运行 `docpath milestone accept ' + m.id + '` 进行验收归档。\n');
    }
    console.log('');
    return;
  }

  // 7. Action: verify / check
  if (action === 'verify' || action === 'check') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要验证的里程碑 ID，例如: `docpath milestone verify M-001`');
      process.exit(1);
    }

    const { passed, blockers, progress } = await verifyMilestone(cwd, milestoneId);

    if (json) {
      console.log(JSON.stringify({ passed, blockers, progress }, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_verify',
          id: progress.milestone.id,
          passed,
          blockers,
          overall_percent: progress.overall_percent,
          backlogs_done: progress.backlog_summary.done,
          backlogs_total: progress.backlog_summary.total,
        }),
      );
      return;
    }

    console.log(`\n🔍  里程碑验收验证: [${progress.milestone.id}] ${progress.milestone.title}\n`);
    if (passed) {
      console.log('✅  【验证通过】所有关联需求已全部闭环，验收条件满足！');
      console.log(`💡 运行 \`docpath milestone accept ${progress.milestone.id}\` 确认阶段性验收\n`);
    } else {
      console.log('❌  【验证未通过】存在以下未完成或阻塞项:');
      blockers.forEach((b) => console.log(`   - ${b}`));
      console.log(`\n💡 解决上述项或使用 \`docpath milestone accept ${progress.milestone.id} --force\` 强制跳过\n`);
    }
    return;
  }

  // 8. Action: accept
  if (action === 'accept') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要验收的里程碑 ID，例如: `docpath milestone accept M-001`');
      process.exit(1);
    }

    try {
      const accepted = await acceptMilestone(cwd, milestoneId, { force });

      if (json) {
        console.log(JSON.stringify(accepted, null, 2));
        return;
      }
      if (agent) {
        console.log(
          stringify({
            agent_view: 'milestone_accepted',
            id: accepted.id,
            title: accepted.title,
            status: accepted.status,
            version_target: accepted.version_target,
          }),
        );
        return;
      }

      console.log(`\n🎉  里程碑 [${accepted.id}] ${accepted.title} 已成功完成阶段性验收！`);
      console.log(`   🏷️  状态流转为: ACCEPTED`);
      console.log(`   💡 下一步: 运行 \`docpath milestone release ${accepted.id}\` 正式生成版本发布简报与 CHANGELOG\n`);
      return;
    } catch (err) {
      console.error(`\n❌  验收失败: ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  // 9. Action: release
  if (action === 'release') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要发布的里程碑 ID，例如: `docpath milestone release M-001`');
      process.exit(1);
    }

    const { milestone: releasedM, releaseDocPath, changelogPath } = await releaseMilestone(cwd, milestoneId, {
      title,
      since,
      dryRun,
    });

    if (dryRun) {
      console.log(`\n📝  [dry-run] 里程碑发布预览: [${releasedM.id}] ${releasedM.title}\n`);
      return;
    }

    if (json) {
      console.log(
        JSON.stringify(
          {
            milestone: releasedM,
            releaseDocPath,
            changelogPath,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_released',
          id: releasedM.id,
          title: releasedM.title,
          status: releasedM.status,
          release_doc: releaseDocPath,
          changelog: changelogPath,
        }),
      );
      return;
    }

    console.log(`\n🎉  里程碑 [${releasedM.id}] ${releasedM.title} 正式发布完成！`);
    console.log(`   📄 发布简报: ${releaseDocPath}`);
    console.log(`   📑 变更日志: ${changelogPath} (已自动更新)`);
    console.log(`   🔍 活文档索引: 已自动同步，支持 \`docpath docs search ${releasedM.version_target || releasedM.id}\` 检索\n`);
    return;
  }

  // 10. Action: show
  if (action === 'show') {
    if (!version) {
      console.error('❌  请指定要查看的里程碑 ID 或版本号，例如: `docpath milestone show M-001`');
      process.exit(1);
    }

    const planningItem = await readMilestoneItem(cwd, version);
    if (planningItem) {
      if (json) {
        console.log(JSON.stringify(planningItem, null, 2));
        return;
      }
      if (agent) {
        console.log(
          stringify({
            agent_view: 'milestone_show',
            ...planningItem,
          }),
        );
        return;
      }
      const raw = await readFile(planningItem.filePath!, 'utf-8');
      console.log(`\n${raw}\n`);
      return;
    }

    const releasesPath = join(cwd, 'docs', 'releases', `${version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`);
    const milestonesPath = join(docpathDir, 'milestones', `${version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`);
    const targetPath = existsSync(releasesPath) ? releasesPath : existsSync(milestonesPath) ? milestonesPath : null;

    if (!targetPath) {
      console.error(`❌  未找到里程碑或版本 ${version} 的文档`);
      process.exit(1);
    }

    const content = await readFile(targetPath, 'utf-8');
    console.log(`\n${content}\n`);
    return;
  }

  // 11. Action: edit
  if (action === 'edit') {
    const milestoneId = version;
    if (!milestoneId) {
      console.error('❌  请指定要编辑的里程碑 ID，例如: `docpath milestone edit M-001 --priority P0`');
      process.exit(1);
    }

    const updated = await editMilestoneItem(cwd, milestoneId, {
      title,
      status: status as any,
      priority: priority as any,
      target_date: targetDate,
      version_target: version_target || releaseVersion || ver,
      owner,
      objective,
      nonGoals,
    });

    if (json) {
      console.log(JSON.stringify(updated, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_edited',
          id: updated.id,
          title: updated.title,
          status: updated.status,
          priority: updated.priority,
          target_date: updated.target_date,
          version_target: updated.version_target,
          owner: updated.owner,
        }),
      );
      return;
    }

    console.log(`\n✅  成功更新里程碑: [${updated.id}] ${updated.title}`);
    console.log(`   🏷️  状态: ${updated.status} | 优先级: ${updated.priority}`);
    if (updated.version_target) console.log(`   🎯 目标版本: ${updated.version_target}`);
    if (updated.target_date) console.log(`   📅 目标日期: ${updated.target_date}`);
    if (updated.owner) console.log(`   👤 负责人: ${updated.owner}`);
    console.log(`   📄 路径: .docpath/milestones/${updated.id}.md\n`);
    return;
  }

  // 12. Action: doctor / groom
  if (action === 'doctor' || action === 'groom') {
    const report = await auditMilestonesHygiene(cwd);

    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_doctor',
          passed: report.passed,
          issue_count: report.issues.length,
          warning_count: report.warnings.length,
          issues: report.issues,
          warnings: report.warnings,
        }),
      );
      return;
    }

    console.log(`\n🩺  DocPath 里程碑与需求血缘健康度巡检 (Milestone Doctor):\n`);
    if (report.passed && report.warnings.length === 0) {
      console.log('   ✅ 所有里程碑与关联需求健康状态良好，无悬空引用与异常！\n');
      return;
    }

    if (report.issues.length > 0) {
      console.log(`❌  发现 ${report.issues.length} 个异常问题 (Error):`);
      for (const issue of report.issues) {
        console.log(`   🔴 [${issue.id}] [${issue.field}]: ${issue.message}`);
        console.log(`      💡 修复建议: ${issue.suggestion}`);
      }
      console.log('');
    }

    if (report.warnings.length > 0) {
      console.log(`⚠️  发现 ${report.warnings.length} 个关注告警 (Warning):`);
      for (const warn of report.warnings) {
        console.log(`   🟡 [${warn.id}] [${warn.field}]: ${warn.message}`);
        console.log(`      💡 建议: ${warn.suggestion}`);
      }
      console.log('');
    }

    if (!report.passed) {
      process.exit(1);
    }
    return;
  }

  // 13. Action: draft
  if (action === 'draft') {
    const targetVersion = version || 'Draft';
    const releaseData: ChangelogReleaseData = await buildChangelogData(cwd, {
      version: targetVersion,
      title,
      since,
    });

    if (json) {
      console.log(JSON.stringify(releaseData, null, 2));
      return;
    }

    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_draft',
          version: releaseData.version,
          title: releaseData.title,
          date: releaseData.date,
          since_ref: releaseData.sinceRef || null,
          metrics: releaseData.metrics,
          categories: {
            breaking_count: releaseData.categories.breaking.length,
            features_count: releaseData.categories.features.length,
            improvements_count: releaseData.categories.improvements.length,
            fixes_count: releaseData.categories.fixes.length,
            decisions_count: releaseData.categories.decisions.length,
            rules_count: releaseData.categories.rules.length,
            other_count: releaseData.categories.other.length,
          },
          markdown: releaseData.markdown,
        }),
      );
      return;
    }

    console.log(`\n📝  DocPath 里程碑发布草案 (Milestone Draft: ${targetVersion})\n`);
    console.log(`📊  变更统计: ${releaseData.metrics.tasksDelivered} 任务 | ${releaseData.metrics.backlogClosed} 需求 | ${releaseData.metrics.decisionsRecorded} 决策`);
    console.log(`${'─'.repeat(50)}\n`);
    console.log(releaseData.markdown);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`💡  确认无误后运行 \`docpath milestone publish ${targetVersion}\` 正式生成版本报告并更新 CHANGELOG.md\n`);
    return;
  }

  // 12. Action: publish / create (default for version string)
  if (!version) {
    console.error('❌  请指定里程碑版本号，例如: `docpath milestone publish v0.2.0 --title "架构升级"`');
    process.exit(1);
  }

  const releaseData: ChangelogReleaseData = await buildChangelogData(cwd, {
    version,
    title,
    since,
  });

  if (dryRun) {
    const previewMarkdown = renderMilestoneReleaseDocMarkdown(releaseData);
    if (agent) {
      console.log(
        stringify({
          agent_view: 'milestone_preview',
          dry_run: true,
          data: releaseData,
        }),
      );
    } else {
      console.log(`\n📝  [dry-run] 里程碑发布简报预览 (${version}):\n`);
      console.log(previewMarkdown);
      console.log('\n[dry-run] 预览结束，未修改任何文件。去掉 --dry-run 执行正式发布写入。\n');
    }
    return;
  }

  const { releaseDocPath, changelogPath } = await publishMilestoneRelease(cwd, releaseData);

  if (agent) {
    console.log(
      stringify({
        agent_view: 'milestone_created',
        version: releaseData.version,
        title: releaseData.title,
        tasks_delivered: releaseData.metrics.tasksDelivered,
        backlog_closed: releaseData.metrics.backlogClosed,
        decisions_recorded: releaseData.metrics.decisionsRecorded,
        breaking_count: releaseData.metrics.breakingCount,
        release_doc: releaseDocPath,
        changelog: changelogPath,
      }),
    );
  } else {
    console.log(`\n🎉  里程碑 ${version} 阶段性总结生成完毕！`);
    console.log(`   📄 发布简报: ${releaseDocPath}`);
    console.log(`   📑 变更日志: ${changelogPath} (已自动更新)`);
    console.log(`   🔍 活文档索引: 已自动同步，支持 \`docpath docs search ${version}\` 瞬时检索\n`);
  }
}

function renderProgressBar(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
