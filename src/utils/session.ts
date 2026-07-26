import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { withLock } from './lock.js';
import { getGitTopLevel, listWorktrees } from './worktree.js';

export const SESSION_SCHEMA_VERSION = 1;
export const LEASE_SCHEMA_VERSION = 1;
export const DEFAULT_SESSION_ID = 'default';
export const DEFAULT_LEASE_TTL_MS = 4 * 60 * 60 * 1000;

export interface SessionRecord {
  schema_version: number;
  kind: 'session';
  session_id: string;
  pid: number;
  cwd: string;
  command: string;
  task_id?: string;
  step?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionContext {
  sessionId: string;
  source: 'option' | 'env' | 'default';
}

export interface LeaseClaim {
  sessionId: string;
  taskId: string;
  step?: string;
  command: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveSessionContext(explicit?: any): SessionContext {
  const optionValue = typeof explicit === 'string' ? explicit.trim() : undefined;
  const envValue = typeof process.env.DOCPATH_SESSION === 'string' ? process.env.DOCPATH_SESSION.trim() : undefined;
  const raw = optionValue || envValue || DEFAULT_SESSION_ID;
  const source = optionValue ? 'option' : envValue ? 'env' : 'default';
  return { sessionId: normalizeSessionId(raw), source };
}

export function normalizeSessionId(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(trimmed)) {
    throw new Error(
      `[docpath] 非法 session id: ${value || '空值'}。` +
      '允许字母、数字、点、下划线、冒号和短横线，且必须以字母或数字开头。',
    );
  }
  return trimmed;
}

function safeResourceFile(resource: string): string {
  return encodeURIComponent(resource).replace(/%/g, '_');
}

async function sessionsDir(cwd: string): Promise<string> {
  return join(await resolveDocpathDir(cwd), 'workspace', 'sessions');
}

async function sessionPath(cwd: string, sessionId: string): Promise<string> {
  return join(await sessionsDir(cwd), `${sessionId}.json`);
}

async function readSessionRecord(path: string): Promise<SessionRecord | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SessionRecord;
  } catch {
    return null;
  }
}

/** session 活性 TTL（R-309：lease 层删除后保留会话感知的新鲜度判定）。 */
function sessionTtlMs(): number {
  const declared = Number(process.env.DOCPATH_SESSION_TTL_MS);
  return Number.isFinite(declared) && declared > 0 ? declared : 10 * 60_000;
}

export async function touchSession(cwd: string, claim: LeaseClaim): Promise<SessionRecord> {
  const path = await sessionPath(cwd, claim.sessionId);
  await mkdir(dirname(path), { recursive: true });
  const existing = await readSessionRecord(path);
  const timestamp = nowIso();
  const record: SessionRecord = {
    schema_version: SESSION_SCHEMA_VERSION,
    kind: 'session',
    session_id: claim.sessionId,
    pid: process.pid,
    cwd,
    command: claim.command,
    task_id: claim.taskId,
    ...(claim.step ? { step: claim.step } : {}),
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };
  await writeFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function verifySessionCwd(cwd: string, sessionId: string): Promise<void> {
  if (sessionId === DEFAULT_SESSION_ID) return;

  let repoRoot: string;
  try {
    repoRoot = await getGitTopLevel(cwd);
  } catch {
    return;
  }

  let worktrees;
  try {
    worktrees = await listWorktrees(repoRoot);
  } catch {
    return;
  }

  const normalizedCwd = resolve(cwd);
  for (const wt of worktrees) {
    const sessionFilePath = join(wt.path, '.docpath', 'workspace', 'sessions', `${sessionId}.json`);
    if (existsSync(sessionFilePath)) {
      const normalizedWtPath = resolve(wt.path);
      const rel = relative(normalizedWtPath, normalizedCwd);
      const isInside = !rel.startsWith('..') && !isAbsolute(rel);
      if (!isInside && normalizedWtPath !== normalizedCwd) {
        throw new Error(
          `[docpath] 跨目录门禁拦截: Session '${sessionId}' 已在 worktree '${normalizedWtPath}' 中被激活。\n` +
          `当前工作目录为 '${normalizedCwd}'。请 cd 回正确的 worktree，以防干扰其他 Agent 的任务执行。`
        );
      }
      return;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface ListActiveSessionsOptions {
  excludeSelf?: boolean;
  selfSessionId?: string;
}

export async function listActiveSessions(
  cwd: string,
  options: ListActiveSessionsOptions = {}
): Promise<SessionRecord[]> {
  const dir = await sessionsDir(cwd);
  if (!existsSync(dir)) {
    return [];
  }

  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir);
  const active: SessionRecord[] = [];
  const now = Date.now();
  const ttl = sessionTtlMs();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(dir, file);
    const record = await readSessionRecord(filePath);
    if (!record) continue;

    // Check excludeSelf
    if (options.excludeSelf && options.selfSessionId && record.session_id === options.selfSessionId) {
      continue;
    }

    // Check TTL (stale check)
    const updated = Date.parse(record.updated_at || record.created_at || '');
    if (!Number.isFinite(updated) || now - updated > ttl) {
      continue;
    }

    // Check PID survival
    if (!isProcessAlive(record.pid)) {
      continue;
    }

    active.push(record);
  }

  return active;
}

