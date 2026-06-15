import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readFileSafe, rmFile, writeFileAtomic } from './file.js';
import { resolveDocpathDir } from './file.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import type { CurrentState } from './workspace.js';

export interface PendingDoneRecord {
  task_id: string;
  entered_at: string;
  phase: string;
  warned?: boolean;
}

function isPendingDoneStale(enteredAt: string, now: Date = new Date()): boolean {
  const enteredMs = Date.parse(enteredAt);
  if (Number.isNaN(enteredMs)) return false;
  return now.getTime() - enteredMs >= 24 * 60 * 60 * 1000;
}

function pendingDonePath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'pending-done.md');
}

function pendingDoneJsonPath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'pending-done.json');
}

function renderRecord(record: PendingDoneRecord): string {
  const frontmatter = stringifyYaml({
    task_id: record.task_id,
    entered_at: record.entered_at,
    phase: record.phase,
    warned: record.warned === true ? true : false,
  }).trim();

  return `---\n${frontmatter}\n---\n`;
}

function parseRecord(content: string): PendingDoneRecord | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?$/);
  if (!match) return null;
  const parsed = (parseYaml(match[1]) || {}) as Record<string, unknown>;
  const taskId = typeof parsed.task_id === 'string' ? parsed.task_id.trim() : '';
  const enteredAt = typeof parsed.entered_at === 'string' ? parsed.entered_at.trim() : '';
  const phase = typeof parsed.phase === 'string' ? parsed.phase.trim() : '';

  if (!taskId || !enteredAt || !phase) return null;

  return {
    task_id: taskId,
    entered_at: enteredAt,
    phase,
    warned: parsed.warned === true,
  };
}

function parseJsonRecord(content: string | null): PendingDoneRecord | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const taskId = typeof parsed.task_id === 'string' ? parsed.task_id.trim() : '';
    const enteredAt = typeof parsed.entered_at === 'string' ? parsed.entered_at.trim() : '';
    const phase = typeof parsed.phase === 'string' ? parsed.phase.trim() : '';
    if (!taskId || !enteredAt || !phase) return null;
    return {
      task_id: taskId,
      entered_at: enteredAt,
      phase,
      warned: parsed.warned === true,
    };
  } catch {
    return null;
  }
}

export async function readPendingDone(cwd: string): Promise<PendingDoneRecord | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const jsonRecord = parseJsonRecord(await readFileSafe(pendingDoneJsonPath(docpathDir)));
  if (jsonRecord) return jsonRecord;
  const content = await readFileSafe(pendingDonePath(docpathDir));
  if (!content) return null;
  return parseRecord(content);
}

export async function writePendingDone(cwd: string, record: PendingDoneRecord): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  await writeFileAtomic(pendingDoneJsonPath(docpathDir), JSON.stringify(record, null, 2));
  await writeFileAtomic(pendingDonePath(docpathDir), renderRecord(record));
}

export async function clearPendingDone(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  await rmFile(pendingDoneJsonPath(docpathDir));
  await rmFile(pendingDonePath(docpathDir));
}

export async function markPendingDoneWarned(cwd: string, warned: boolean): Promise<void> {
  const record = await readPendingDone(cwd);
  if (!record) return;
  await writePendingDone(cwd, { ...record, warned });
}

async function hasStalePendingDoneWarning(cwd: string, taskId: string): Promise<boolean> {
  const warning = `[WARN] Task ${taskId} active >24h without done`;
  const summary = await readBreadcrumb(cwd);
  return summary.entries.some((entry) =>
    entry.taskId === taskId &&
    entry.step === 'pending-done' &&
    entry.context.includes(warning)
  );
}

export async function handleStalePendingDoneWarning(
  cwd: string,
  current: Pick<CurrentState, 'phase' | 'task_id'> | null | undefined,
  pendingDone?: PendingDoneRecord | null,
): Promise<PendingDoneRecord | null> {
  const record = pendingDone ?? await readPendingDone(cwd);
  if (!record || !current) return record;
  if (current.phase !== 'executing') return record;
  if (record.task_id !== current.task_id) return record;
  if (record.warned === true) return record;
  if (!isPendingDoneStale(record.entered_at)) return record;

  if (!await hasStalePendingDoneWarning(cwd, record.task_id)) {
    await writeBreadcrumb(cwd, {
      taskId: current.task_id || record.task_id,
      step: 'pending-done',
      status: 'skipped',
      context: `[WARN] Task ${record.task_id} active >24h without done`,
    });
  }
  await markPendingDoneWarned(cwd, true);
  return { ...record, warned: true };
}
