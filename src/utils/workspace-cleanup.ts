/**
 * Workspace aging policy.
 *
 * Cleanup is deliberately split into two phases:
 * - plan: read-only dry-run summary for `docpath gc`
 * - execute: explicit mutation for `docpath gc --force` and `compact --cleanup`
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { BREADCRUMB_HEADER, formatEntry, type BreadcrumbEntry } from '../engine/breadcrumb.js';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { DEFAULT_LEASE_TTL_MS } from './session.js';
import { readCurrentState } from './workspace.js';

export const CHECK_HISTORY_MAX_ENTRIES = 30;
export const CHECK_HISTORY_RETENTION_DAYS = 14;
export const BREADCRUMB_MAX_LINES = 500;
export const SESSION_MAX_AGE_DAYS = 7;

type CleanupArea = 'check-history' | 'breadcrumb' | 'sessions' | 'leases';
type CleanupAction = 'rewrite' | 'delete';

type CheckHistoryEntry = Record<string, unknown>;

interface CheckHistory {
  entries: CheckHistoryEntry[];
  [key: string]: unknown;
}

interface SessionMetadata {
  session_id?: string;
  sessionId?: string;
  pid?: number;
  created_at?: string;
  updated_at?: string;
  lastTouched?: string;
  [key: string]: unknown;
}

interface LeaseMetadata {
  session_id?: string;
  sessionId?: string;
  pid?: number;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

interface PlannedRewrite {
  path: string;
  content: string;
}

interface PlannedDelete {
  path: string;
}

export interface WorkspaceCleanupCandidate {
  area: CleanupArea;
  action: CleanupAction;
  path: string;
  reason: string;
  count: number;
  bytes: number;
}

export interface WorkspaceCleanupSkipped {
  area: CleanupArea;
  path: string;
  reason: string;
  severity: 'warning' | 'error';
}

export interface WorkspaceCleanupResult {
  mode: 'dry-run' | 'force';
  candidates: WorkspaceCleanupCandidate[];
  skipped: WorkspaceCleanupSkipped[];
  estimatedBytes: number;
  changedFiles: string[];
  checkHistoryPruned: number;
  breadcrumbPruned: number;
  sessionsRemoved: number;
  leasesRemoved: number;
}

interface WorkspaceCleanupPlan extends WorkspaceCleanupResult {
  rewrites: PlannedRewrite[];
  deletes: PlannedDelete[];
}

interface WorkspaceCleanupOptions {
  execute?: boolean;
  now?: Date;
}

const RETENTION_POLICY = {
  CHECK_HISTORY_MAX_ENTRIES,
  CHECK_HISTORY_RETENTION_DAYS,
  BREADCRUMB_MAX_LINES,
  SESSION_MAX_AGE_DAYS,
  LEASE_MAX_AGE_HOURS: DEFAULT_LEASE_TTL_MS / (60 * 60 * 1000),
};

function timestampMs(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function positiveDiff(before: number, after: number): number {
  return Math.max(0, before - after);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf-8');
}

function jsonStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isProcessAlive(pid: number | undefined): boolean {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    return code === 'EPERM';
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function rel(cwd: string, path: string): string {
  return relative(cwd, path) || path;
}

function addSkipped(
  plan: WorkspaceCleanupPlan,
  area: CleanupArea,
  path: string,
  reason: string,
  severity: WorkspaceCleanupSkipped['severity'] = 'warning',
): void {
  plan.skipped.push({ area, path, reason, severity });
}

function addCandidate(plan: WorkspaceCleanupPlan, candidate: WorkspaceCleanupCandidate): void {
  plan.candidates.push(candidate);
  plan.estimatedBytes += candidate.bytes;
  if (candidate.area === 'check-history') plan.checkHistoryPruned += candidate.count;
  if (candidate.area === 'breadcrumb') plan.breadcrumbPruned += candidate.count;
  if (candidate.area === 'sessions') plan.sessionsRemoved += candidate.count;
  if (candidate.area === 'leases') plan.leasesRemoved += candidate.count;
}

function parseJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

function extractCheckHistoryEntries(parsed: CheckHistory | CheckHistoryEntry[]): {
  entries: CheckHistoryEntry[];
  wrap(entries: CheckHistoryEntry[]): CheckHistory | CheckHistoryEntry[];
} | null {
  if (Array.isArray(parsed)) {
    return {
      entries: parsed,
      wrap: (entries) => entries,
    };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
    return {
      entries: parsed.entries,
      wrap: (entries) => ({ ...parsed, entries }),
    };
  }
  return null;
}

async function planCheckHistory(
  docpathDir: string,
  plan: WorkspaceCleanupPlan,
  nowMs: number,
): Promise<void> {
  const path = join(docpathDir, 'workspace', 'check-history.json');
  if (!existsSync(path)) return;

  let content = '';
  try {
    content = await readFile(path, 'utf-8');
  } catch (error) {
    addSkipped(plan, 'check-history', path, `无法读取: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return;
  }

  let parsed: CheckHistory | CheckHistoryEntry[];
  try {
    parsed = parseJson<CheckHistory | CheckHistoryEntry[]>(content);
  } catch (error) {
    addSkipped(plan, 'check-history', path, `JSON 解析失败，跳过清理: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return;
  }

  const history = extractCheckHistoryEntries(parsed);
  if (!history) {
    addSkipped(plan, 'check-history', path, '未知 check-history schema，跳过清理', 'warning');
    return;
  }

  const cutoff = nowMs - RETENTION_POLICY.CHECK_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const latestStart = Math.max(0, history.entries.length - RETENTION_POLICY.CHECK_HISTORY_MAX_ENTRIES);
  const kept = history.entries.filter((entry, index) => {
    const entryTime = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    return index >= latestStart || (Number.isFinite(entryTime) && entryTime >= cutoff);
  });

  const pruned = history.entries.length - kept.length;
  if (pruned <= 0) return;

  const nextContent = jsonStringify(history.wrap(kept));
  plan.rewrites.push({ path, content: nextContent });
  addCandidate(plan, {
    area: 'check-history',
    action: 'rewrite',
    path,
    reason: `保留最近 ${RETENTION_POLICY.CHECK_HISTORY_MAX_ENTRIES} 条及 ${RETENTION_POLICY.CHECK_HISTORY_RETENTION_DAYS} 天内记录`,
    count: pruned,
    bytes: positiveDiff(byteLength(content), byteLength(nextContent)),
  });
}

function parseBreadcrumbJsonl(content: string): BreadcrumbEntry[] {
  const entries: BreadcrumbEntry[] = [];
  const lines = content.split('\n').filter((line) => line.trim());
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch (error) {
      throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行必须是 JSON object`);
    }
    const record = parsed as Record<string, unknown>;
    if (record.kind !== 'breadcrumb') throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 kind 必须为 breadcrumb`);
    if (typeof record.taskId !== 'string') throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 taskId 必须是字符串`);
    if (typeof record.step !== 'string') throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 step 必须是字符串`);
    if (!['done', 'in_progress', 'blocked', 'skipped'].includes(String(record.status))) {
      throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 status 非法`);
    }
    if (typeof record.context !== 'string') throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 context 必须是字符串`);
    if (typeof record.timestamp !== 'string') throw new Error(`breadcrumb.jsonl 第 ${lineNumber} 行 timestamp 必须是字符串`);
    entries.push({
      taskId: record.taskId,
      step: record.step,
      status: record.status as BreadcrumbEntry['status'],
      context: record.context,
      timestamp: record.timestamp,
      ...(typeof record.sessionId === 'string' ? { sessionId: record.sessionId } : {}),
      ...(typeof record.escalation === 'string' ? { escalation: record.escalation } : {}),
    });
  }
  return entries;
}

async function planBreadcrumb(
  docpathDir: string,
  plan: WorkspaceCleanupPlan,
  currentTaskId?: string,
): Promise<void> {
  const jsonlPath = join(docpathDir, 'workspace', 'breadcrumb.jsonl');
  if (!existsSync(jsonlPath)) return;

  let content = '';
  try {
    content = await readFile(jsonlPath, 'utf-8');
  } catch (error) {
    addSkipped(plan, 'breadcrumb', jsonlPath, `无法读取: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return;
  }

  let entries: BreadcrumbEntry[];
  try {
    entries = parseBreadcrumbJsonl(content);
  } catch (error) {
    addSkipped(plan, 'breadcrumb', jsonlPath, `${error instanceof Error ? error.message : String(error)}，跳过清理`, 'error');
    return;
  }

  if (entries.length <= RETENTION_POLICY.BREADCRUMB_MAX_LINES) return;

  const latestStart = Math.max(0, entries.length - RETENTION_POLICY.BREADCRUMB_MAX_LINES);
  const keepIndexes = new Set<number>();
  entries.forEach((entry, index) => {
    if (index >= latestStart) keepIndexes.add(index);
    if (
      currentTaskId &&
      entry.taskId === currentTaskId &&
      ['done', 'blocked', 'skipped'].includes(entry.status)
    ) {
      keepIndexes.add(index);
    }
  });

  const keptEntries = entries.filter((_, index) => keepIndexes.has(index));
  const pruned = entries.length - keptEntries.length;
  if (pruned <= 0) return;

  const nextJsonl = `${keptEntries.map((entry) => JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    taskId: entry.taskId,
    step: entry.step,
    status: entry.status,
    context: entry.context,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    ...(entry.escalation ? { escalation: entry.escalation } : {}),
  })).join('\n')}\n`;
  const mdPath = join(docpathDir, 'workspace', 'breadcrumb.md');
  const nextMarkdown = BREADCRUMB_HEADER + keptEntries.map((entry) => formatEntry(entry)).join('');
  const markdownBefore = existsSync(mdPath) ? await readFile(mdPath, 'utf-8').catch(() => '') : '';
  const bytes = positiveDiff(byteLength(content), byteLength(nextJsonl)) +
    positiveDiff(byteLength(markdownBefore), byteLength(nextMarkdown));

  plan.rewrites.push({ path: jsonlPath, content: nextJsonl });
  plan.rewrites.push({ path: mdPath, content: nextMarkdown });
  addCandidate(plan, {
    area: 'breadcrumb',
    action: 'rewrite',
    path: jsonlPath,
    reason: `保留最近 ${RETENTION_POLICY.BREADCRUMB_MAX_LINES} 条，并保留当前任务 terminal events`,
    count: pruned,
    bytes,
  });
}

async function readJsonFile<T>(
  plan: WorkspaceCleanupPlan,
  area: CleanupArea,
  path: string,
): Promise<T | null> {
  try {
    return parseJson<T>(await readFile(path, 'utf-8'));
  } catch (error) {
    addSkipped(plan, area, path, `JSON 解析失败，跳过清理: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return null;
  }
}

async function readJsonFileSilent<T>(path: string): Promise<T | null> {
  try {
    return parseJson<T>(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

function sessionIdOf(record: SessionMetadata | LeaseMetadata): string | undefined {
  return record.session_id || record.sessionId;
}

function sessionTimestamp(record: SessionMetadata): number | null {
  return timestampMs(record.updated_at, record.lastTouched, record.created_at);
}

function leaseExpiryMs(record: LeaseMetadata, fallbackMtimeMs: number): number {
  const explicit = timestampMs(record.expires_at, record.expiresAt);
  if (explicit !== null) return explicit;
  return fallbackMtimeMs + RETENTION_POLICY.LEASE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

async function collectActiveSessionIds(
  docpathDir: string,
  nowMs: number,
  plan: WorkspaceCleanupPlan,
): Promise<Set<string>> {
  const active = new Set<string>();
  const sessionsDir = join(docpathDir, 'workspace', 'sessions');
  if (existsSync(sessionsDir)) {
    for (const file of await readdir(sessionsDir).catch(() => [])) {
      if (!file.endsWith('.json')) continue;
      const path = join(sessionsDir, file);
      const record = await readJsonFileSilent<SessionMetadata>(path);
      if (!record) continue;
      const id = sessionIdOf(record);
      const touched = sessionTimestamp(record);
      if (id && touched !== null && nowMs - touched <= RETENTION_POLICY.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
        active.add(id);
      }
    }
  }

  const leasesDir = join(docpathDir, 'workspace', 'leases');
  if (existsSync(leasesDir)) {
    for (const file of await readdir(leasesDir).catch(() => [])) {
      if (!file.endsWith('.json')) continue;
      const path = join(leasesDir, file);
      const record = await readJsonFileSilent<LeaseMetadata>(path);
      if (!record) continue;
      const id = sessionIdOf(record);
      const fileStat = await stat(path).catch(() => null);
      const expiresAt = leaseExpiryMs(record, fileStat?.mtimeMs || nowMs);
      if (id && expiresAt > nowMs) active.add(id);
    }
  }
  return active;
}

async function planSessions(
  docpathDir: string,
  plan: WorkspaceCleanupPlan,
  nowMs: number,
  activeSessionIds: Set<string>,
): Promise<void> {
  const sessionsDir = join(docpathDir, 'workspace', 'sessions');
  if (!existsSync(sessionsDir)) return;

  const maxAgeMs = RETENTION_POLICY.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const file of await readdir(sessionsDir).catch(() => [])) {
    if (!file.endsWith('.json')) continue;
    const path = join(sessionsDir, file);
    const record = await readJsonFile<SessionMetadata>(plan, 'sessions', path);
    if (!record) continue;

    const id = sessionIdOf(record);
    const touched = sessionTimestamp(record);
    if (id && activeSessionIds.has(id)) continue;
    if (touched === null) {
      addSkipped(plan, 'sessions', path, '缺少可解析 updated_at/created_at，跳过清理', 'warning');
      continue;
    }
    if (nowMs - touched <= maxAgeMs) continue;

    plan.deletes.push({ path });
    addCandidate(plan, {
      area: 'sessions',
      action: 'delete',
      path,
      reason: `session 超过 ${RETENTION_POLICY.SESSION_MAX_AGE_DAYS} 天未更新且无 active lease`,
      count: 1,
      bytes: await fileSize(path),
    });
  }
}

async function planLeases(
  docpathDir: string,
  plan: WorkspaceCleanupPlan,
  nowMs: number,
  activeSessionIds: Set<string>,
): Promise<void> {
  const leasesDir = join(docpathDir, 'workspace', 'leases');
  if (!existsSync(leasesDir)) return;

  for (const file of await readdir(leasesDir).catch(() => [])) {
    if (!file.endsWith('.json')) continue;
    const path = join(leasesDir, file);
    const record = await readJsonFile<LeaseMetadata>(plan, 'leases', path);
    if (!record) continue;

    const fileStat = await stat(path).catch(() => null);
    const expiresAt = leaseExpiryMs(record, fileStat?.mtimeMs || nowMs);
    const id = sessionIdOf(record);
    const expired = expiresAt <= nowMs;
    const ownerPidMissing = typeof record.pid === 'number' && !isProcessAlive(record.pid);
    const protectedByActiveSession = !!id && activeSessionIds.has(id) && !expired;

    if (!expired && !ownerPidMissing) continue;
    if (protectedByActiveSession) continue;

    plan.deletes.push({ path });
    addCandidate(plan, {
      area: 'leases',
      action: 'delete',
      path,
      reason: expired ? 'lease expires_at 已过期' : 'lease owner pid 不存在且无 active session',
      count: 1,
      bytes: await fileSize(path),
    });
  }
}

function emptyPlan(mode: WorkspaceCleanupResult['mode']): WorkspaceCleanupPlan {
  return {
    mode,
    candidates: [],
    skipped: [],
    estimatedBytes: 0,
    changedFiles: [],
    checkHistoryPruned: 0,
    breadcrumbPruned: 0,
    sessionsRemoved: 0,
    leasesRemoved: 0,
    rewrites: [],
    deletes: [],
  };
}

export async function planWorkspaceCleanup(cwd: string, options: WorkspaceCleanupOptions = {}): Promise<WorkspaceCleanupResult> {
  const docpathDir = await resolveDocpathDir(cwd);
  const nowMs = (options.now || new Date()).getTime();
  const plan = emptyPlan('dry-run');
  const state = await readCurrentState(cwd);

  await planCheckHistory(docpathDir, plan, nowMs);
  await planBreadcrumb(docpathDir, plan, state?.task_id);
  const activeSessionIds = await collectActiveSessionIds(docpathDir, nowMs, plan);
  await planSessions(docpathDir, plan, nowMs, activeSessionIds);
  await planLeases(docpathDir, plan, nowMs, activeSessionIds);

  return stripPlan(plan);
}

export async function cleanupWorkspace(cwd: string, options: WorkspaceCleanupOptions = {}): Promise<WorkspaceCleanupResult> {
  const execute = options.execute !== false;
  const docpathDir = await resolveDocpathDir(cwd);
  const nowMs = (options.now || new Date()).getTime();
  const plan = emptyPlan(execute ? 'force' : 'dry-run');
  const state = await readCurrentState(cwd);

  await planCheckHistory(docpathDir, plan, nowMs);
  await planBreadcrumb(docpathDir, plan, state?.task_id);
  const activeSessionIds = await collectActiveSessionIds(docpathDir, nowMs, plan);
  await planSessions(docpathDir, plan, nowMs, activeSessionIds);
  await planLeases(docpathDir, plan, nowMs, activeSessionIds);

  if (!execute) return stripPlan(plan);

  for (const rewrite of plan.rewrites) {
    await mkdir(dirname(rewrite.path), { recursive: true });
    await writeFileAtomic(rewrite.path, rewrite.content);
    plan.changedFiles.push(rewrite.path);
  }
  for (const deletion of plan.deletes) {
    await rm(deletion.path, { force: true });
    plan.changedFiles.push(deletion.path);
  }

  return stripPlan(plan);
}

function stripPlan(plan: WorkspaceCleanupPlan): WorkspaceCleanupResult {
  return {
    mode: plan.mode,
    candidates: plan.candidates,
    skipped: plan.skipped,
    estimatedBytes: plan.estimatedBytes,
    changedFiles: plan.changedFiles,
    checkHistoryPruned: plan.checkHistoryPruned,
    breadcrumbPruned: plan.breadcrumbPruned,
    sessionsRemoved: plan.sessionsRemoved,
    leasesRemoved: plan.leasesRemoved,
  };
}

export function renderWorkspaceCleanupSummary(cwd: string, result: WorkspaceCleanupResult): string[] {
  const lines: string[] = [];
  lines.push('Workspace cleanup');
  lines.push(`  mode: ${result.mode}`);
  lines.push(`  candidates: ${result.candidates.length}`);
  lines.push(`  estimated_reclaim: ${result.estimatedBytes} bytes`);

  if (result.candidates.length === 0) {
    lines.push('  ok: no workspace cleanup candidates');
  } else {
    for (const candidate of result.candidates) {
      const subject = candidate.area === 'check-history' || candidate.area === 'breadcrumb'
        ? `${candidate.count} entries`
        : `${candidate.count} files`;
      lines.push(`  - ${candidate.area}: ${candidate.action} ${subject}`);
      lines.push(`    path: ${rel(cwd, candidate.path)}`);
      lines.push(`    reason: ${candidate.reason}`);
      lines.push(`    bytes: ${candidate.bytes}`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push('  skipped:');
    for (const skipped of result.skipped) {
      lines.push(`  - ${skipped.area}: ${skipped.severity}`);
      lines.push(`    path: ${rel(cwd, skipped.path)}`);
      lines.push(`    reason: ${skipped.reason}`);
    }
  }

  if (result.mode === 'dry-run') {
    lines.push('  [dry-run] no workspace files were modified; run docpath gc --force to execute cleanup');
  } else {
    lines.push(`  changed_files: ${result.changedFiles.length}`);
    for (const path of result.changedFiles) {
      lines.push(`  - ${rel(cwd, path)}`);
    }
  }
  return lines;
}
