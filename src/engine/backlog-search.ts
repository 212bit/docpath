/**
 * Backlog 全文搜索与多维检索 (Backlog Search & Filtering)
 *
 * 支持多关键字搜索、状态/优先级过滤、依赖阻塞态过滤、父子层级检索与相关性打分。
 */

import {
  listBacklogItems,
  listArchivedBacklogItems,
  listAllBacklogItems,
  type BacklogItem,
  type BacklogPriority,
  type BacklogStatus,
} from './backlog.js';
import { buildBacklogGraph } from './backlog-graph.js';

export interface BacklogSearchOptions {
  query?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  parent?: string;
  dependsOn?: string;
  readyOnly?: boolean;
  limit?: number;
  all?: boolean;
  includeArchived?: boolean;
  archived?: boolean;
  archivedOnly?: boolean;
}

export interface BacklogSearchResultItem {
  item: BacklogItem;
  score: number;
  matchedFields: string[];
  isBlocked: boolean;
  unresolvedDependencies: string[];
  layer: number;
  isArchived?: boolean;
}

/**
 * 在 Backlog 中执行搜索与过滤（支持跨 active 与 archived 全生命周期检索）
 */
export async function searchBacklogItems(
  cwd: string,
  options: BacklogSearchOptions = {},
): Promise<BacklogSearchResultItem[]> {
  const statusFilter = options.status?.trim().toLowerCase();
  const isArchivedOnly = (options.archivedOnly === true || options.archived === true) && options.all !== true;
  const shouldIncludeArchived = isArchivedOnly ||
    options.includeArchived === true ||
    options.all === true ||
    statusFilter === 'done' ||
    statusFilter === 'dropped' ||
    statusFilter === 'all';

  let allItems: BacklogItem[];
  let archivedSet = new Set<string>();

  if (isArchivedOnly) {
    allItems = await listArchivedBacklogItems(cwd);
    archivedSet = new Set(allItems.map((it) => it.id));
  } else if (shouldIncludeArchived) {
    const [active, archived] = await Promise.all([
      listBacklogItems(cwd),
      listArchivedBacklogItems(cwd),
    ]);
    archivedSet = new Set(archived.map((it) => it.id));
    allItems = [...active, ...archived];
  } else {
    allItems = await listBacklogItems(cwd);
  }

  const graph = buildBacklogGraph(allItems);

  const query = options.query?.trim().toLowerCase() || '';
  const keywords = query ? query.split(/[\s,，]+/).filter(Boolean) : [];
  const priorityFilter = options.priority?.trim().toUpperCase();
  const milestoneFilter = options.milestone?.trim().toLowerCase();
  const parentFilter = options.parent?.trim();
  const dependsOnFilter = options.dependsOn?.trim();
  const readyOnly = options.readyOnly === true;

  const results: BacklogSearchResultItem[] = [];

  for (const item of allItems) {
    const node = graph.nodes[item.id] || {
      layer: 1,
      isBlocked: false,
      unresolvedDependencies: [],
    };

    // 1. 状态过滤
    if (statusFilter) {
      if (statusFilter === 'open') {
        if (item.status === 'done' || item.status === 'dropped') continue;
      } else if (item.status.toLowerCase() !== statusFilter) {
        continue;
      }
    }

    // 2. 优先级过滤
    if (priorityFilter && item.priority !== priorityFilter) {
      continue;
    }

    // 3. 里程碑过滤
    if (milestoneFilter && item.links.milestone?.toLowerCase() !== milestoneFilter) {
      continue;
    }

    // 4. 父需求过滤
    if (parentFilter && item.links.parent !== parentFilter) {
      continue;
    }

    // 5. 依赖过滤
    if (dependsOnFilter && !item.links.depends_on?.includes(dependsOnFilter)) {
      continue;
    }

    // 6. 就绪过滤 (已就绪可推进，未被前置未完成依赖阻塞)
    if (readyOnly && (node.isBlocked || item.status === 'done' || item.status === 'dropped')) {
      continue;
    }

    // 7. 关键字打分与匹配字段统计
    let score = 0;
    const matchedFields: string[] = [];

    if (keywords.length > 0) {
      const lowerId = item.id.toLowerCase();
      const lowerTitle = item.title.toLowerCase();
      const lowerBody = item.body.toLowerCase();
      const lowerSource = item.source.toLowerCase();
      const lowerEvidence = JSON.stringify(item.evidence).toLowerCase();

      for (const kw of keywords) {
        // ID 匹配
        if (lowerId === kw) {
          score += 15;
          if (!matchedFields.includes('id')) matchedFields.push('id');
        } else if (lowerId.includes(kw)) {
          score += 8;
          if (!matchedFields.includes('id')) matchedFields.push('id');
        }

        // Title 匹配
        if (lowerTitle.includes(kw)) {
          score += 10;
          if (!matchedFields.includes('title')) matchedFields.push('title');
        }

        // Body 匹配
        if (lowerBody.includes(kw)) {
          score += 3;
          if (!matchedFields.includes('body')) matchedFields.push('body');
        }

        // 来源与证据
        if (lowerSource.includes(kw) || lowerEvidence.includes(kw)) {
          score += 2;
          if (!matchedFields.includes('evidence')) matchedFields.push('evidence');
        }
      }

      // 如果有关键字查询但未命中任何字段，排除
      if (score === 0) continue;
    } else {
      score = 1; // 无关键字时默认全选
    }

    results.push({
      item,
      score,
      matchedFields,
      isBlocked: node.isBlocked,
      unresolvedDependencies: node.unresolvedDependencies,
      layer: node.layer,
      isArchived: archivedSet.has(item.id),
    });
  }

  // 排序：先按得分降序，再按优先级升序 (P0 < P1)，再按 ID 升序
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pA = Number.parseInt(a.item.priority.slice(1), 10) || 3;
    const pB = Number.parseInt(b.item.priority.slice(1), 10) || 3;
    if (pA !== pB) return pA - pB;
    return a.item.id.localeCompare(b.item.id);
  });

  const limit = options.limit || 50;
  return results.slice(0, limit);
}
