/**
 * docpath backlog — merge / combine
 */

import { stringify } from 'yaml';
import { mergeBacklogItems } from '../../engine/backlog-merge.js';
import { parseIdList } from './ids.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogMerge(options: BacklogCommandOptions): Promise<void> {
  const ids = parseIdList(options.id);
  if (ids.length < 2 && !options.target) {
    throw new Error('docpath backlog merge 需要指定至少 2 个待合并条目 ID (例如: docpath backlog merge R-006 R-007 --target R-006)');
  }
  const result = await mergeBacklogItems({
    cwd: options.cwd,
    sourceIds: ids,
    targetId: options.target,
    title: options.title,
    dryRun: options.dryRun,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      agent_view: 'backlog_merge',
      target_id: result.targetId,
      merged_title: result.mergedTitle,
      source_ids: result.sourceIds,
      dropped_ids: result.droppedIds,
      acceptance_criteria_count: result.acceptanceCriteriaCount,
      milestone: result.milestone || null,
      dry_run: result.dryRun,
    }));
    return;
  }

  const dryPrefix = result.dryRun ? ' [预览模式 --dry-run]' : '';
  console.log(`\n🔀  Backlog 智能合并完成${dryPrefix}\n`);
  console.log(`  🎯 目标条目: ${result.targetId} (保留/更新)`);
  console.log(`     标题: ${result.mergedTitle}`);
  console.log(`     AC 验收项数: ${result.acceptanceCriteriaCount} 项`);
  if (result.milestone) console.log(`     关联里程碑: ${result.milestone}`);
  console.log(`  📦 已归并并废弃条目: ${result.droppedIds.join(', ')} (状态置为 dropped 并归档)`);
  console.log('');
}
