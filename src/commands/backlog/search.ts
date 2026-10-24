/**
 * docpath backlog — search / find
 */

import { stringify } from 'yaml';
import { searchBacklogItems } from '../../engine/backlog-search.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogSearch(options: BacklogCommandOptions): Promise<void> {
  const query = options.query || options.title || options.id;
  const results = await searchBacklogItems(options.cwd, {
    query,
    status: options.status,
    priority: options.priority,
    milestone: options.milestone,
    parent: options.parent,
    dependsOn: options.dependsOn,
    readyOnly: options.readyOnly || options.unblocked,
    limit: options.limit,
    all: options.all,
    archived: options.archived,
    archivedOnly: options.archivedOnly,
    includeArchived: options.includeArchived || options.all,
  });

  if (options.json) {
    console.log(JSON.stringify({ query, count: results.length, results }, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      query: query || null,
      count: results.length,
      results: results.map((r) => ({
        id: r.item.id,
        title: r.item.title,
        status: r.item.status,
        priority: r.item.priority,
        level: r.item.level,
        score: r.score,
        is_blocked: r.isBlocked,
        is_archived: r.isArchived || false,
        unresolved_dependencies: r.unresolvedDependencies,
        layer: r.layer,
        parent: r.item.links.parent || null,
      })),
    }));
    return;
  }

  if (results.length === 0) {
    console.log(`未找到匹配条件的 Backlog 条目${query ? ` (query: "${query}")` : ''}。`);
    return;
  }

  console.log(`=== Backlog 检索结果 (共 ${results.length} 条)${query ? ` — 关键词: "${query}"` : ''} ===\n`);
  for (const r of results) {
    const archiveBadge = r.isArchived ? ' [已归档]' : '';
    const badge = r.item.status === 'done' ? '✅' : r.item.status === 'dropped' ? '🛑' : r.isBlocked ? '🔒 [阻塞]' : '⚡ [就绪]';
    const layer = `Layer ${r.layer}`;
    console.log(`  ${badge} ${r.item.id} [${r.item.priority}] ${r.item.title} (${r.item.status}${archiveBadge} | ${layer})`);
    if (r.unresolvedDependencies.length > 0) {
      console.log(`      未解前置依赖: ${r.unresolvedDependencies.join(', ')}`);
    }
    if (r.item.links.parent) {
      console.log(`      父需求: ${r.item.links.parent}`);
    }
  }
}
