/**
 * Workspace 老化策略 — 自动清理运行时状态
 *
 * 按 R-178 规范实现：
 * - check-history.json 保留最近 30 条
 * - breadcrumb.jsonl 保留最近 500 行
 * - sessions/ 7 天后清理
 * - leases/ 1 小时后清理过期锁
 */

import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from './file.js';

interface CheckHistoryEntry {
  timestamp: string;
  result: string;
  [key: string]: unknown;
}

interface CheckHistory {
  entries: CheckHistoryEntry[];
  [key: string]: unknown;
}

interface SessionMetadata {
  sessionId: string;
  lastTouched: string;
  [key: string]: unknown;
}

interface LeaseMetadata {
  sessionId: string;
  acquiredAt: string;
  expiresAt?: string;
  [key: string]: unknown;
}

const RETENTION_POLICY = {
  CHECK_HISTORY_MAX_ENTRIES: 30,
  BREADCRUMB_MAX_LINES: 500,
  SESSION_MAX_AGE_DAYS: 7,
  LEASE_MAX_AGE_HOURS: 1,
};

/**
 * 裁剪 check-history.json，保留最近 N 条
 */
export async function trimCheckHistory(cwd: string, maxEntries: number = RETENTION_POLICY.CHECK_HISTORY_MAX_ENTRIES): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const checkHistoryPath = join(docpathDir, 'workspace', 'check-history.json');

  try {
    const content = await readFile(checkHistoryPath, 'utf-8');
    const history = JSON.parse(content) as CheckHistory;

    if (!Array.isArray(history.entries)) {
      return 0; // 格式不符合预期，跳过
    }

    const originalCount = history.entries.length;
    if (originalCount <= maxEntries) {
      return 0; // 无需裁剪
    }

    history.entries = history.entries.slice(-maxEntries);
    await writeFile(checkHistoryPath, JSON.stringify(history, null, 2), 'utf-8');
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
        const lastTouched = new Date(session.lastTouched).getTime();

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
 * 清理过期 leases（1 小时未释放）
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

        // 优先使用 expiresAt，否则用文件 mtime
        let expiresAt: number;
        if (lease.expiresAt) {
          expiresAt = new Date(lease.expiresAt).getTime();
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
