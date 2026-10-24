/**
 * docpath backlog — 列表与索引刷新
 */

import { stringify } from 'yaml';
import {
  listAllBacklogItems,
  listArchivedBacklogItems,
  listBacklogItems,
  refreshBacklogIndex,
  type BacklogItem,
  type BacklogPriority,
} from '../../engine/backlog.js';
import { normalizePriority, normalizeStatusFilter } from './normalize.js';
import type { BacklogCommandOptions } from './types.js';

function comparePriority(a: BacklogPriority, b: BacklogPriority): number {
  return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
}

function sortBacklogItems(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const priorityOrder = comparePriority(a.priority, b.priority);
    if (priorityOrder !== 0) return priorityOrder;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function renderListTable(items: BacklogItem[]): string {
  const hasAnyArchived = items.some((item) => item.is_archived);
  const lines = [
    '',
    `📚  Backlog 条目 (共 ${items.length} 项)${hasAnyArchived ? ' [包含已归档条目]' : ''}`,
    '',
    '| id | priority | status | level | title | task |',
    '|----|----------|--------|-------|-------|------|',
  ];

  for (const item of items) {
    const statusLabel = item.is_archived ? `${item.status} [已归档]` : item.status;
    lines.push(
      `| ${item.id} | ${item.priority} | ${statusLabel} | ${item.level} | ${item.title} | ${item.links.task ?? ''} |`
    );
  }

  if (items.length === 0) {
    lines.push('| - | - | - | - | 暂无条目 | - |');
  }

  lines.push('');
  return lines.join('\n');
}

export async function backlogList(options: BacklogCommandOptions): Promise<void> {
  const status = normalizeStatusFilter(options.status);
  const priority = options.priority ? normalizePriority(options.priority) : undefined;
  const milestone = options.milestone?.trim().toLowerCase();

  let allItems: BacklogItem[];
  if (options.archivedOnly || (options.archived && !options.all)) {
    allItems = await listArchivedBacklogItems(options.cwd);
  } else if (options.all || options.includeArchived || status === 'done' || status === 'dropped') {
    allItems = await listAllBacklogItems(options.cwd);
  } else {
    allItems = await listBacklogItems(options.cwd);
  }

  const filtered = sortBacklogItems(
    allItems.filter((item) => {
      if (status && item.status !== status) return false;
      if (priority && item.priority !== priority) return false;
      if (milestone && item.links.milestone?.toLowerCase() !== milestone) return false;
      return true;
    })
  );

  if (options.agent) {
    console.log(stringify({
      count: filtered.length,
      archived_count: filtered.filter((item) => item.is_archived).length,
      items: filtered.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        level: item.level,
        readiness: item.readiness,
        is_archived: item.is_archived ?? false,
        file_path: item.file_path || null,
        milestone: item.links.milestone || null,
        task: item.links.task,
      })),
    }));
    return;
  }

  console.log(renderListTable(filtered));
}

export async function backlogRefresh(options: BacklogCommandOptions): Promise<void> {
  const items = await listBacklogItems(options.cwd);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 索引已刷新: ${items.length} 个条目`);
  console.log('   index: .docpath/backlog/backlog.md');
}
