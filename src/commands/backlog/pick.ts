/**
 * docpath backlog — pick / next
 */

import { stringify } from 'yaml';
import { rankBacklogByImpact } from '../../engine/backlog-graph.js';
import { listBacklogItems } from '../../engine/backlog.js';
import { readCurrentState } from '../../utils/workspace.js';
import { backlogPromote } from './promote.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogPick(options: BacklogCommandOptions): Promise<void> {
  let allItems = await listBacklogItems(options.cwd);
  if (options.milestone) {
    const targetMilestone = options.milestone.trim().toLowerCase();
    allItems = allItems.filter((item) => item.links.milestone?.toLowerCase() === targetMilestone);
  }
  const rankResult = rankBacklogByImpact(allItems);

  if (options.start || options.promote || options.adopt) {
    const targetId = options.id || rankResult.rankedReadyItems[0]?.id;
    if (!targetId) {
      throw new Error(options.milestone
        ? `docpath backlog pick: 里程碑 ${options.milestone} 下当前没有可启动的就绪条目`
        : 'docpath backlog pick: 当前没有可启动的就绪条目');
    }
    if (options.promote && !options.start) {
      await backlogPromote({
        ...options,
        id: targetId,
      });
      return;
    }
    console.log(`🚀  [智能选单] 自动选中并拉起条目: ${targetId}...\n`);
    await backlogPromote({
      ...options,
      id: targetId,
      draft: options.draft ?? true,
    });
    const { planCommand } = await import('../plan.js');
    const { goCommand } = await import('../go.js');
    const stateAfterPromote = await readCurrentState(options.cwd);
    if (stateAfterPromote?.phase === 'drafting' || stateAfterPromote?.phase === 'planning') {
      await planCommand({ cwd: options.cwd });
    }
    await goCommand({
      cwd: options.cwd,
      step: 'S1',
      adopt: options.adopt,
    });
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({
      milestone: options.milestone || undefined,
      ...rankResult,
    }, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      agent_view: 'backlog_pick',
      milestone: options.milestone || undefined,
      ready_count: rankResult.readyCount,
      critical_path: rankResult.criticalPath,
      recommendations: rankResult.rankedReadyItems.map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        score: r.score,
        unblock_impact: r.unblockImpactCount,
        reasons: r.reasons,
      })),
      recommended_command: rankResult.rankedReadyItems.length > 0
        ? `docpath start ${rankResult.rankedReadyItems[0].id}`
        : 'docpath backlog list',
    }));
    return;
  }

  const milestoneHeader = options.milestone ? ` [里程碑: ${options.milestone}]` : '';
  console.log(`\n🎯  Backlog 关键路径与智能选单 (Top Actionable Queue)${milestoneHeader}\n`);
  if (rankResult.criticalPath.length > 0) {
    console.log(`🔗  关键依赖链 (Critical Path): ${rankResult.criticalPath.join(' ➔ ')}\n`);
  }

  if (rankResult.rankedReadyItems.length === 0) {
    console.log(options.milestone
      ? `   (里程碑 ${options.milestone} 下当前没有就绪可开发的条目)\n`
      : '   (当前没有就绪可开发的条目)\n');
    return;
  }

  for (let i = 0; i < rankResult.rankedReadyItems.length; i++) {
    const r = rankResult.rankedReadyItems[i];
    const pBadge = r.priority === 'P0' ? '🔴 [P0]' : r.priority === 'P1' ? '🟠 [P1]' : '🟡 [P2]';
    console.log(`[${i + 1}] ${pBadge} ${r.id}: ${r.title} (得分: ${r.score})`);
    console.log(`    💡 解锁分析: ${r.reasons.join(' · ')}`);
    console.log(`    🚀 启动命令: docpath start ${r.id}`);
    console.log('');
  }
}
