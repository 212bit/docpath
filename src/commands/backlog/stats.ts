/**
 * docpath backlog — stats / dashboard
 */

import { stringify } from 'yaml';
import { rankBacklogByImpact } from '../../engine/backlog-graph.js';
import { listBacklogItems } from '../../engine/backlog.js';
import { computeBacklogStats } from '../../engine/backlog-stats.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogStats(options: BacklogCommandOptions): Promise<void> {
  const stats = await computeBacklogStats(options.cwd);

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify(stats));
    return;
  }

  console.log(`\n📊  Backlog 需求池全景统计 (共 ${stats.summary.total} 条)`);
  console.log(`    活跃: ${stats.summary.active} | 已归档: ${stats.summary.archived} | 整体完成率: ${stats.summary.completion_rate_pct}%`);
  console.log('\n--- 状态漏斗 (Status) ---');
  console.log(`    💡 proposed: ${stats.status.proposed} | 📋 accepted: ${stats.status.accepted} | 🚀 planned: ${stats.status.planned} | ✅ done: ${stats.status.done} | 🛑 dropped: ${stats.status.dropped}`);
  console.log('\n--- 成熟度分布 (Readiness) ---');
  console.log(`    🌱 raw: ${stats.readiness.raw} | 📐 shaped: ${stats.readiness.shaped} | 🔍 analyzed: ${stats.readiness.analyzed} | 🤝 confirmed: ${stats.readiness.confirmed}`);
  console.log('\n--- 优先级分布 (Priority) ---');
  console.log(`    🔥 P0: ${stats.priority.P0} | ⚡ P1: ${stats.priority.P1} | 📌 P2: ${stats.priority.P2} | ☕ P3: ${stats.priority.P3}`);
  console.log('\n--- 依赖拓扑与健康指标 (Topology & Health) ---');
  console.log(`    ⚡ 就绪条目: ${stats.topology.ready} | 🔒 阻塞条目: ${stats.topology.blocked} | 🔄 闭环环路: ${stats.topology.cycles_count}`);
  console.log(`    🛤️  最长依赖链 (Critical Path): ${stats.topology.critical_path_length} 步 [${stats.topology.critical_path.join(' -> ') || '无'}]`);
  if (stats.topology.top_blockers.length > 0) {
    console.log('    🚧 核心卡点 (Top Blockers):');
    for (const b of stats.topology.top_blockers) {
      console.log(`       - [${b.id}] ${b.title} (直接阻塞 ${b.directBlocks} 项 / 传递阻塞 ${b.totalTransitiveBlocks} 项)`);
    }
  }
  console.log(`    🛡️  健康门禁: ${stats.hygiene.passed ? '✅ 全部通过' : `⚠️  ${stats.hygiene.issues_count} 异常 / ${stats.hygiene.warnings_count} 警告`}`);
  console.log('');
}

export async function backlogDashboard(options: BacklogCommandOptions): Promise<void> {
  const allItems = await listBacklogItems(options.cwd);
  const stats = await computeBacklogStats(options.cwd);
  const rankResult = rankBacklogByImpact(allItems);

  if (options.json) {
    console.log(JSON.stringify({
      stats,
      rankedReadyItems: rankResult.rankedReadyItems.map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        score: r.score,
        unblockImpactCount: r.unblockImpactCount,
        reasons: r.reasons,
      })),
      criticalPath: rankResult.criticalPath,
      bottlenecks: rankResult.bottlenecks,
    }, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      agent_view: 'backlog_dashboard',
      stats: {
        total: stats.summary.total,
        active: stats.summary.active,
        ready: stats.topology.ready,
        blocked: stats.topology.blocked,
        done: stats.status.done,
      },
      top_recommendations: rankResult.rankedReadyItems.slice(0, 3).map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        impact_score: r.score,
        reasons: r.reasons,
      })),
      next_action: rankResult.rankedReadyItems.length > 0
        ? `推荐启动最高收益就绪条目: docpath start ${rankResult.rankedReadyItems[0].id}`
        : '当前无就绪条目，可运行 docpath backlog add 添加新需求',
    }));
    return;
  }

  console.log('\n📊  Backlog 需求全景看板 (Dashboard)\n');
  console.log(`  • 需求总量: ${stats.summary.total} 条 | 活跃进行中: ${stats.summary.active} 条 | 已完成: ${stats.status.done} 条`);
  console.log(`  • 优先级分布: P0: ${stats.priority.P0} | P1: ${stats.priority.P1} | P2: ${stats.priority.P2} | P3: ${stats.priority.P3}`);
  console.log(`  • 拓扑状态: ⚡ 就绪可启动: ${stats.topology.ready} 条 | 🔒 前置阻塞中: ${stats.topology.blocked} 条\n`);

  if (rankResult.rankedReadyItems.length > 0) {
    console.log('⚡  【智能选单推荐 (Top Actionable Items)】:');
    for (let i = 0; i < Math.min(5, rankResult.rankedReadyItems.length); i++) {
      const r = rankResult.rankedReadyItems[i];
      const pBadge = r.priority === 'P0' ? '🔴 [P0]' : r.priority === 'P1' ? '🟠 [P1]' : '🟡 [P2]';
      const reasonStr = r.reasons.join(' · ');
      console.log(`  ${i + 1}. ${pBadge} ${r.id}: ${r.title}`);
      console.log(`     👉 得分: ${r.score} | ${reasonStr}`);
    }
    console.log('');
    console.log(`💡 提示: 随时运行 \`docpath start ${rankResult.rankedReadyItems[0].id}\` 一键启动最高收益需求！`);
  } else if (stats.summary.active > 0) {
    console.log('🔒  所有活跃条目均处于前置依赖阻塞中，请先解决前置依赖。');
  } else {
    console.log('🎉  当前无待办需求！运行 `docpath backlog add --title "..."` 录入新需求。');
  }
  console.log('');
}
