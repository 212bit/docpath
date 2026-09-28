/**
 * Backlog 统计与多维度量 (Backlog Statistics & Metrics)
 */

import {
  listBacklogItems,
  listArchivedBacklogItems,
  type BacklogItem,
  type BacklogPriority,
  type BacklogStatus,
  type BacklogReadiness,
  type BacklogKind,
} from './backlog.js';
import { buildBacklogGraph, type BacklogBottleneck } from './backlog-graph.js';
import { auditBacklogHygiene } from './backlog-groom.js';

export interface BacklogStatsResult {
  summary: {
    total: number;
    active: number;
    archived: number;
    completion_rate_pct: number;
  };
  status: Record<BacklogStatus, number>;
  readiness: Record<BacklogReadiness, number>;
  priority: Record<BacklogPriority, number>;
  level: Record<number, number>;
  kind: Record<BacklogKind, number>;
  topology: {
    ready: number;
    blocked: number;
    cycles_count: number;
    critical_path_length: number;
    critical_path: string[];
    top_blockers: BacklogBottleneck[];
  };
  hygiene: {
    passed: boolean;
    issues_count: number;
    warnings_count: number;
  };
}

export async function computeBacklogStats(cwd: string): Promise<BacklogStatsResult> {
  const [activeItems, archivedItems] = await Promise.all([
    listBacklogItems(cwd),
    listArchivedBacklogItems(cwd),
  ]);

  const allItems = [...activeItems, ...archivedItems];
  const graph = buildBacklogGraph(activeItems);
  const hygiene = auditBacklogHygiene(activeItems);

  const statusMap: Record<BacklogStatus, number> = {
    proposed: 0,
    accepted: 0,
    planned: 0,
    active: 0,
    done: 0,
    dropped: 0,
  };

  const readinessMap: Record<BacklogReadiness, number> = {
    raw: 0,
    shaped: 0,
    analyzed: 0,
    confirmed: 0,
  };

  const priorityMap: Record<BacklogPriority, number> = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
  };

  const levelMap: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
  };

  const kindMap: Record<BacklogKind, number> = {
    feature: 0,
    fix: 0,
    refactor: 0,
    perf: 0,
    debt: 0,
    spike: 0,
    chore: 0,
  };

  for (const item of allItems) {
    if (statusMap[item.status] !== undefined) statusMap[item.status]++;
    if (readinessMap[item.readiness] !== undefined) readinessMap[item.readiness]++;
    if (priorityMap[item.priority] !== undefined) priorityMap[item.priority]++;
    if (levelMap[item.level] !== undefined) levelMap[item.level]++;
    const k = (item.kind || 'feature').toLowerCase() as BacklogKind;
    if (kindMap[k] !== undefined) kindMap[k]++;
  }

  const terminalCount = statusMap.done + statusMap.dropped;
  const completionRate = allItems.length > 0 ? Math.round((statusMap.done / allItems.length) * 100) : 0;

  return {
    summary: {
      total: allItems.length,
      active: activeItems.length,
      archived: archivedItems.length,
      completion_rate_pct: completionRate,
    },
    status: statusMap,
    readiness: readinessMap,
    priority: priorityMap,
    level: levelMap,
    kind: kindMap,
    topology: {
      ready: graph.readyItems.length,
      blocked: graph.blockedItems.length,
      cycles_count: graph.cycles.length,
      critical_path_length: graph.criticalPath.length,
      critical_path: graph.criticalPath,
      top_blockers: graph.bottlenecks.slice(0, 5),
    },
    hygiene: {
      passed: hygiene.issues.length === 0,
      issues_count: hygiene.issues.length,
      warnings_count: hygiene.warnings.length,
    },
  };
}
