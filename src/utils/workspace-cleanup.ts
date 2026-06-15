/**
 * Workspace 老化策略 — 自动清理运行时状态
 *
 * 按 R-178 规范实现：
 * - check-history.json 保留最近 20 条
 * - breadcrumb.jsonl 保留最近 500 行
 * - sessions/ 7 天后清理
 * - leases/ 按 expires_at 或默认 TTL 清理过期锁
 */

import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from './file.js';
import { DEFAULT_LEASE_TTL_MS } from './session.js';

export const CHECK_HISTORY_MAX_ENTRIES = 20;

type CheckHistoryEntry = Record<string, unknown>;

interface CheckHistory {
  entries: CheckHistoryEntry[];
  [key: string]: unknown;
}

interface SessionMetadata {
  session_id?: string;
  created_at?: string;
  updated_at?: string;
  sessionId?: string;
  lastTouched?: string;
  [key: string]: unknown;
}

interface LeaseMetadata {
  session_id?: string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  sessionId?: string;
  acquiredAt?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

const RETENTION_POLICY = {
  CHECK_HISTORY_MAX_ENTRIES,
  BREADCRUMB_MAX_LINES: 500,
  SESSION_MAX_AGE_DAYS: 7,
  LEASE_MAX_AGE_HOURS: DEFAULT_LEASE_TTL_MS / (60 * 60 * 1000),
};

/**
 * 裁剪 check-history.json，保留最近 N 条
 */
export async function trimCheckHistory(cwd: string, maxEntries: number = RETENTION_POLICY.CHECK_HISTORY_MAX_ENTRIES): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const checkHistoryPath = join(docpathDir, 'workspace', 'check-history.json');

  try {
    const content = await readFile(checkHistoryPath, 'utf-8');
    const parsed = JSON.parse(content) as CheckHistory | CheckHistoryEntry[];
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.entries)
        ? parsed.entries
        : null;

    if (!entries) {
      return 0; // 格式不符合预期，跳过
    }

    const originalCount = entries.length;
    if (originalCount <= maxEntries) {
      return 0; // 无需裁剪
    }

    const trimmed = entries.slice(-maxEntries);
    const nextContent = Array.isArray(parsed)
      ? trimmed
      : { ...parsed, entries: trimmed };
    await writeFile(checkHistoryPath, JSON.stringify(nextContent, null, 2), 'utf-8');
    return originalCount - maxEntries;
  } catch (error) {
    // 文件不存在或格式错误，跳过
    return 0;
  }
}

/**
 * 裁剪 breadcrumb.jsonl，保留最近 N 行
 */
export async function trimBreadcrumbJsonl(cwd: string, maxLines: number = RETENTION_POLICY.BREADCRUMB_MAX_LINES): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.jsonl');

  try {
    const content = await readFile(breadcrumbPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    const originalCount = lines.length;
    if (originalCount <= maxLines) {
      return 0; // 无需裁剪
    }

    const trimmed = lines.slice(-maxLines).join('\n') + '\n';
    await writeFile(breadcrumbPath, trimmed, 'utf-8');
    return originalCount - maxLines;
  } catch (error) {
    // 文件不存在，跳过
    return 0;
  }
}

function timestampMs(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * 清理过期 sessions（7 天未使用）
 */
export async function cleanStaleSessions(cwd: string, maxAgeDays: number = RETENTION_POLICY.SESSION_MAX_AGE_DAYS): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const sessionsDir = join(docpathDir, 'workspace', 'sessions');

  try {
    const files = await readdir(sessionsDir);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(sessionsDir, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as SessionMetadata;
        const lastTouched = timestampMs(session.updated_at, session.created_at, session.lastTouched);
        if (lastTouched === null) continue;

        if (now - lastTouched > maxAgeMs) {
          await rm(filePath);
          removed++;
        }
      } catch {
        // 格式错误或无法解析，跳过
        continue;
      }
    }

    return removed;
  } catch (error) {
    // 目录不存在，跳过
    return 0;
  }
}

/**
 * 清理过期 leases（按 expires_at 或默认 TTL）
 */
export async function cleanExpiredLeases(cwd: string, maxAgeHours: number = RETENTION_POLICY.LEASE_MAX_AGE_HOURS): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const leasesDir = join(docpathDir, 'workspace', 'leases');

  try {
    const files = await readdir(leasesDir);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(leasesDir, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const lease = JSON.parse(content) as LeaseMetadata;

        // 优先使用真实 lease schema 的 expires_at；兼容旧 expiresAt，否则用文件 mtime + 默认 TTL。
        let expiresAt: number;
        const explicitExpiry = timestampMs(lease.expires_at, lease.expiresAt);
        if (explicitExpiry !== null) {
          expiresAt = explicitExpiry;
        } else {
          const fileStat = await stat(filePath);
          expiresAt = fileStat.mtime.getTime() + maxAgeMs;
        }

        if (now > expiresAt) {
          await rm(filePath);
          removed++;
        }
      } catch {
        // 格式错误或无法解析，跳过
        continue;
      }
    }

    return removed;
  } catch (error) {
    // 目录不存在，跳过
    return 0;
  }
}

/**
 * 执行完整 workspace 清理
 */
export async function cleanupWorkspace(cwd: string): Promise<{
  checkHistoryPruned: number;
  breadcrumbPruned: number;
  sessionsRemoved: number;
  leasesRemoved: number;
}> {
  const [checkHistoryPruned, breadcrumbPruned, sessionsRemoved, leasesRemoved] = await Promise.all([
    trimCheckHistory(cwd),
    trimBreadcrumbJsonl(cwd),
    cleanStaleSessions(cwd),
    cleanExpiredLeases(cwd),
  ]);

  return {
    checkHistoryPruned,
    breadcrumbPruned,
    sessionsRemoved,
    leasesRemoved,
  };
}
