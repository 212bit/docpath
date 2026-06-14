import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { withLock } from './lock.js';

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

export interface LeaseRecord {
  schema_version: number;
  kind: 'lease';
  resource: string;
  session_id: string;
  pid: number;
  command: string;
  task_id: string;
  step?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
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

export class LeaseConflictError extends Error {
  readonly record: LeaseRecord;

  constructor(record: LeaseRecord, requested: LeaseClaim) {
    const stepPart = requested.step ? ` step=${requested.step}` : '';
    super(
      `[docpath] session lease conflict: ${record.resource} 已由 session=${record.session_id} 持有。` +
      `当前 session=${requested.sessionId}${stepPart} 不能并发推进同一任务。` +
      `如确认持有者已退出，请等待 lease stale 后重试，或使用持有者 session 继续。`,
    );
    this.name = 'LeaseConflictError';
    this.record = record;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function leaseTtlMs(): number {
  const raw = process.env.DOCPATH_LEASE_TTL_MS;
  if (!raw) return DEFAULT_LEASE_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEASE_TTL_MS;
}

export function resolveSessionContext(explicit?: string): SessionContext {
  const optionValue = explicit?.trim();
  const envValue = process.env.DOCPATH_SESSION?.trim();
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

export function taskLeaseResource(taskId: string): string {
  return `task:${taskId}`;
}

export function stepLeaseResource(taskId: string, step: string): string {
  return `task:${taskId}:step:${step}`;
}

function safeResourceFile(resource: string): string {
  return encodeURIComponent(resource).replace(/%/g, '_');
}

async function sessionsDir(cwd: string): Promise<string> {
  return join(await resolveDocpathDir(cwd), 'workspace', 'sessions');
}

async function leasesDir(cwd: string): Promise<string> {
  return join(await resolveDocpathDir(cwd), 'workspace', 'leases');
}

async function sessionPath(cwd: string, sessionId: string): Promise<string> {
  return join(await sessionsDir(cwd), `${sessionId}.json`);
}

async function leasePath(cwd: string, resource: string): Promise<string> {
  return join(await leasesDir(cwd), `${safeResourceFile(resource)}.json`);
}

async function leaseLockPath(cwd: string, resource: string): Promise<string> {
  return join(await leasesDir(cwd), `${safeResourceFile(resource)}.lock`);
}

async function readSessionRecord(path: string): Promise<SessionRecord | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SessionRecord;
  } catch {
    return null;
  }
}

async function readLeaseRecord(path: string): Promise<LeaseRecord | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as LeaseRecord;
  } catch {
    return null;
  }
}

function isLeaseStale(record: LeaseRecord, nowMs = Date.now(), ttlMs = leaseTtlMs()): boolean {
  const updated = Date.parse(record.updated_at || record.created_at || '');
  const expired = Date.parse(record.expires_at || '');
  if (Number.isFinite(expired) && expired <= nowMs) return true;
  if (!Number.isFinite(updated) || nowMs - updated > ttlMs) return true;
  return false;
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

export async function acquireLease(cwd: string, claim: LeaseClaim, resource: string): Promise<LeaseRecord> {
  const path = await leasePath(cwd, resource);
  const lockPath = await leaseLockPath(cwd, resource);
  await mkdir(await leasesDir(cwd), { recursive: true });

  return withLock(lockPath, async () => {
    const existing = await readLeaseRecord(path);
    if (existing && existing.session_id !== claim.sessionId && !isLeaseStale(existing)) {
      throw new LeaseConflictError(existing, claim);
    }

    const timestamp = nowIso();
    const createdAt = existing?.session_id === claim.sessionId ? existing.created_at : timestamp;
    const record: LeaseRecord = {
      schema_version: LEASE_SCHEMA_VERSION,
      kind: 'lease',
      resource,
      session_id: claim.sessionId,
      pid: process.pid,
      command: claim.command,
      task_id: claim.taskId,
      ...(claim.step ? { step: claim.step } : {}),
      created_at: createdAt,
      updated_at: timestamp,
      expires_at: new Date(Date.now() + leaseTtlMs()).toISOString(),
    };
    await writeFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  });
}

export async function acquireExecutionLease(cwd: string, claim: LeaseClaim): Promise<LeaseRecord[]> {
  await touchSession(cwd, claim);
  const taskLease = await acquireLease(cwd, claim, taskLeaseResource(claim.taskId));
  if (!claim.step) return [taskLease];
  const stepLease = await acquireLease(cwd, claim, stepLeaseResource(claim.taskId, claim.step));
  return [taskLease, stepLease];
}

export async function releaseLease(cwd: string, sessionId: string, resource: string): Promise<boolean> {
  const path = await leasePath(cwd, resource);
  const lockPath = await leaseLockPath(cwd, resource);
  if (!existsSync(path)) return false;

  return withLock(lockPath, async () => {
    const existing = await readLeaseRecord(path);
    if (!existing || existing.session_id !== sessionId) return false;
    await unlink(path);
    return true;
  });
}

export async function releaseExecutionLease(cwd: string, claim: LeaseClaim): Promise<void> {
  if (claim.step) {
    await releaseLease(cwd, claim.sessionId, stepLeaseResource(claim.taskId, claim.step));
  }
  await releaseLease(cwd, claim.sessionId, taskLeaseResource(claim.taskId));
}
