/**
 * 提交说明引用了仍开放的 backlog 条目时给出告警。
 *
 * 只读、本地、有上限：`git log -n` 不访问远端。没有 git、不是仓库、或没有
 * 提交时返回空结果，不抛错，也不把环境问题升级成阻断。
 *
 * 窗口：最近 lastN 条提交一律参与；更早但仍在抓取上限内的提交，仅当其日期
 * 不早于该条目的 created_at 时参与（“自条目创建以来”）。
 */

import { readBacklogItem } from './backlog.js';
import { gitAsyncOptional } from '../utils/git-run.js';

/** 无条件纳入的最近提交条数。 */
export const DEFAULT_BACKLOG_COMMIT_LAST_N = 50;
/** 单次本地 git log 的硬上限，避免扫全历史。 */
export const MAX_BACKLOG_COMMIT_FETCH = 200;

const OPEN_BACKLOG_STATUSES = new Set(['proposed', 'accepted', 'planned', 'active']);
const BACKLOG_ID_PATTERN = /\bR-(\d+)\b/gi;
const DAY_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

export interface CommitMessageRecord {
  sha: string;
  /** ISO 8601，允许为空（无日期时只走 lastN 窗口）。 */
  committedAt: string;
  subject: string;
  body: string;
}

export interface BacklogCommitStatus {
  id: string;
  status: string;
  title?: string;
  created_at?: string;
}

export interface StaleBacklogCommitWarning {
  id: string;
  status: string;
  title: string;
  commits: Array<{ sha: string; subject: string }>;
  message: string;
  suggestion: string;
}

export interface BacklogCommitDriftReport {
  /** false：不是 git 仓库、找不到 git，或调用方显式表示日志不可读。 */
  available: boolean;
  scannedCommits: number;
  warnings: StaleBacklogCommitWarning[];
}

export function canonicalBacklogId(rawNumber: string): string | null {
  if (!/^\d+$/.test(rawNumber)) return null;
  const n = Number.parseInt(rawNumber, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return `R-${String(n).padStart(3, '0')}`;
}

export function extractBacklogIds(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(BACKLOG_ID_PATTERN)) {
    const id = canonicalBacklogId(match[1] ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    found.push(id);
  }
  return found;
}

export function parseGitLogOutput(raw: string): CommitMessageRecord[] {
  const records: CommitMessageRecord[] = [];
  for (const chunk of raw.split('\x1e')) {
    const trimmed = chunk.replace(/^\n+/, '').trim();
    if (!trimmed) continue;
    const fields = trimmed.split('\x1f');
    if (fields.length < 3) {
      records.push({ sha: '', committedAt: '', subject: trimmed, body: '' });
      continue;
    }
    records.push({
      sha: fields[0]?.trim() ?? '',
      committedAt: fields[1]?.trim() ?? '',
      subject: fields[2] ?? '',
      body: fields.slice(3).join('\x1f').replace(/^\n/, '').replace(/\n$/, ''),
    });
  }
  return records;
}

function dateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(DAY_PATTERN);
  return match ? match[1] : null;
}

function isOpenStatus(status: string): boolean {
  return OPEN_BACKLOG_STATUSES.has(status);
}

function commitInWindow(
  commit: CommitMessageRecord,
  index: number,
  item: BacklogCommitStatus,
  lastN: number,
): boolean {
  if (index < lastN) return true;
  const created = dateOnly(item.created_at);
  const day = dateOnly(commit.committedAt);
  if (!created || !day) return false;
  return day >= created;
}

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 7) : '(no-sha)';
}

/**
 * 纯函数：给定已按新到旧排列的提交与条目查找，返回告警。
 * 查找不到的 ID、以及 done/dropped 不产生告警。
 */
export function findStaleBacklogCommitWarnings(
  commits: CommitMessageRecord[],
  lookup: (id: string) => BacklogCommitStatus | null | undefined,
  lastN: number = DEFAULT_BACKLOG_COMMIT_LAST_N,
): StaleBacklogCommitWarning[] {
  const safeLastN = Number.isFinite(lastN) && lastN > 0 ? Math.floor(lastN) : 0;
  const grouped = new Map<string, { item: BacklogCommitStatus; commits: CommitMessageRecord[] }>();

  commits.forEach((commit, index) => {
    const ids = extractBacklogIds(`${commit.subject}\n${commit.body}`);
    for (const id of ids) {
      const item = lookup(id);
      if (!item || !isOpenStatus(item.status)) continue;
      if (!commitInWindow(commit, index, item, safeLastN)) continue;
      const bucket = grouped.get(item.id);
      if (bucket) bucket.commits.push(commit);
      else grouped.set(item.id, { item, commits: [commit] });
    }
  });

  const warnings: StaleBacklogCommitWarning[] = [];
  for (const { item, commits: hits } of grouped.values()) {
    const shown = hits.slice(0, 5).map((commit) => {
      const subject = commit.subject.trim() || '(empty subject)';
      return `${shortSha(commit.sha)} ${subject}`;
    });
    const extra = hits.length > shown.length ? ` 等 ${hits.length} 条` : '';
    const title = item.title?.trim() || item.id;
    warnings.push({
      id: item.id,
      status: item.status,
      title,
      commits: hits.slice(0, 5).map((commit) => ({
        sha: commit.sha,
        subject: commit.subject.trim(),
      })),
      message: `提交引用了 ${item.id}（${title}），但条目状态仍为 ${item.status}：${shown.join('；')}${extra}`,
      suggestion: `若已落地，用 docpath backlog done ${item.id} --task <任务id> 收口；不要在提交说明里把仍开放的需求写成已完成`,
    });
  }

  return warnings.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

async function readLocalCommitLog(cwd: string, fetchLimit: number): Promise<{ available: boolean; raw: string }> {
  const inside = await gitAsyncOptional(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside?.trim() !== 'true') return { available: false, raw: '' };
  if (fetchLimit <= 0) return { available: true, raw: '' };
  const raw = await gitAsyncOptional(cwd, [
    'log',
    '-n',
    String(fetchLimit),
    '--pretty=format:%H%x1f%cI%x1f%s%x1f%b%x1e',
  ]);
  // 仓库存在但尚无提交，或 log 失败：可诊断、无告警，不阻断。
  if (raw === null) return { available: true, raw: '' };
  return { available: true, raw };
}

export async function diagnoseBacklogCommitDrift(
  cwd: string,
  opts?: {
    lastN?: number;
    /** 测试注入。返回 null 表示日志不可读（与缺少 git 相同，不抛错）。 */
    readLog?: (cwd: string, fetchLimit: number) => Promise<string | null>;
  },
): Promise<BacklogCommitDriftReport> {
  const lastN = opts?.lastN ?? DEFAULT_BACKLOG_COMMIT_LAST_N;
  const boundedLastN = Number.isFinite(lastN) && lastN > 0
    ? Math.min(Math.floor(lastN), MAX_BACKLOG_COMMIT_FETCH)
    : 0;
  const fetchLimit = Math.min(
    MAX_BACKLOG_COMMIT_FETCH,
    Math.max(boundedLastN, boundedLastN === 0 ? 0 : MAX_BACKLOG_COMMIT_FETCH),
  );

  let available = false;
  let raw = '';
  try {
    if (opts?.readLog) {
      const injected = await opts.readLog(cwd, fetchLimit);
      if (injected === null) return { available: false, scannedCommits: 0, warnings: [] };
      available = true;
      raw = injected;
    } else {
      const read = await readLocalCommitLog(cwd, fetchLimit);
      available = read.available;
      raw = read.raw;
    }
  } catch {
    return { available: false, scannedCommits: 0, warnings: [] };
  }

  if (!available) return { available: false, scannedCommits: 0, warnings: [] };

  const commits = parseGitLogOutput(raw);
  const cache = new Map<string, BacklogCommitStatus | null>();
  const lookup = (id: string): BacklogCommitStatus | null => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    return null;
  };

  const ids = new Set<string>();
  for (const commit of commits) {
    for (const id of extractBacklogIds(`${commit.subject}\n${commit.body}`)) ids.add(id);
  }

  try {
    for (const id of ids) {
      const item = await readBacklogItem(cwd, id, { readArchived: true });
      cache.set(id, item
        ? { id: item.id, status: item.status, title: item.title, created_at: item.created_at }
        : null);
    }
  } catch {
    return { available: true, scannedCommits: commits.length, warnings: [] };
  }

  return {
    available: true,
    scannedCommits: commits.length,
    warnings: findStaleBacklogCommitWarnings(commits, lookup, boundedLastN),
  };
}
