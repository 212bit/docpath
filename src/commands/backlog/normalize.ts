/**
 * docpath backlog — 优先级、级别、成熟度与状态过滤归一化
 */

import {
  type BacklogPriority,
  type BacklogReadiness,
  type BacklogStatus,
  isBacklogPriority,
  isBacklogReadiness,
} from '../../engine/backlog.js';

export function normalizePriority(priority?: string): BacklogPriority {
  const value = (priority || 'P2').toUpperCase();
  if (!isBacklogPriority(value)) {
    throw new Error(`docpath backlog: priority 非法: ${priority}（允许: P0|P1|P2|P3）`);
  }
  return value;
}

export function normalizeLevel(level?: string): number {
  const raw = level ?? '2';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    throw new Error(`docpath backlog: level 非法: ${raw}（允许: 0|1|2|3）`);
  }
  return parsed;
}

export function normalizeReadiness(readiness: string | undefined, fallback: BacklogReadiness): BacklogReadiness {
  const value = (readiness || fallback).trim().toLowerCase();
  if (!isBacklogReadiness(value)) {
    throw new Error(`docpath backlog: readiness 非法: ${readiness}（允许: raw|shaped|analyzed|confirmed）`);
  }
  return value;
}

export function normalizeStatusFilter(status?: string): BacklogStatus | undefined {
  if (!status) return undefined;
  const value = status.trim().toLowerCase();
  const valid: BacklogStatus[] = ['proposed', 'accepted', 'planned', 'active', 'done', 'dropped'];
  if (!valid.includes(value as BacklogStatus)) {
    throw new Error(`docpath backlog list: status 非法: ${status}`);
  }
  return value as BacklogStatus;
}
