/**
 * Breadcrumb 协议 — GSD 上下文追踪 (Layer 1 Utils)
 */

import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { readFile, appendFile, mkdir } from 'fs/promises';
import { writeFileAtomic } from './file.js';
import { withLock } from './lock.js';
import type {
  BreadcrumbEntry,
  BreadcrumbSummary,
  BreadcrumbJsonlRecord,
  BreadcrumbReporter,
} from '../types/breadcrumb.js';

export type {
  BreadcrumbEntry,
  BreadcrumbSummary,
  BreadcrumbJsonlRecord,
  BreadcrumbReporter,
};

/** 面包屑最大保留条数 */
export const MAX_ENTRIES = 200;
/** 面包屑文件最大 KB 数（超过则触发更激进的裁剪） */
export const MAX_SIZE_KB = 50;
export const BREADCRUMB_JSONL_SCHEMA_VERSION = 1;

export const BREADCRUMB_HEADER = `# 面包屑 — 上下文恢复索引

> 此文件由 DocPath 自动生成。每完成一个子任务追加一条记录。
> 格式：YAML frontmatter（结构化字段）+ Markdown body（人类可读）。
> 结构化真源：breadcrumb.jsonl；本 Markdown 文件是可重建视图。
> 超过 ${MAX_ENTRIES} 条记录或 ${MAX_SIZE_KB}KB 时自动裁剪最旧条目。
`;

const STATUS_EMOJI: Record<BreadcrumbEntry['status'], string> = {
  done: '✅',
  in_progress: '🔄',
  blocked: '🚫',
  skipped: '⏭️',
};

function yamlEscape(value: string | undefined | null): string {
  if (value == null) value = "";
  const needsQuote =
    !value ||
    /[:\[\]{}&*!|>'",\n]/.test(value) ||
    /^(~|true|false|null|yes|no|on|off)$/i.test(value.trim()) ||
    /^[\d.]/.test(value) ||
    /^\s|\s$/.test(value);
  if (needsQuote) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return value;
}

function yamlUnquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return v;
}

export function formatEntry(entry: BreadcrumbEntry): string {
  const ts = entry.timestamp || new Date().toISOString();
  const emoji = STATUS_EMOJI[entry.status] || '⏭️';
  return [
    '',
    `### ${emoji} ${entry.step} [${entry.taskId || '—'}] — ${ts}`,
    '',
    '---',
    `taskId: ${yamlEscape(entry.taskId)}`,
    `step: ${yamlEscape(entry.step)}`,
    `status: ${entry.status}`,
    `timestamp: ${ts}`,
    ...(entry.sessionId ? [`sessionId: ${yamlEscape(entry.sessionId)}`] : []),
    ...(entry.escalation ? [`escalation: ${yamlEscape(entry.escalation)}`] : []),
    '---',
    '',
    `- **状态**: ${entry.status}`,
    `- **上下文**: ${entry.context}`,
    ...(entry.sessionId ? [`- **Session**: ${entry.sessionId}`] : []),
    '',
  ].join('\n');
}

async function truncateBreadcrumbUnlocked(projectRoot: string): Promise<number> {
  const jsonlEntries = await readBreadcrumbJsonl(projectRoot);
  const summary = jsonlEntries !== null ? summarizeBreadcrumb(jsonlEntries) : await readBreadcrumbMarkdown(projectRoot);

  const mdPath = join(projectRoot, '.docpath', 'workspace', 'breadcrumb.md');
  let needsAggressiveTruncate = false;
  if (existsSync(mdPath)) {
    const content = await readFile(mdPath, 'utf-8');
    const sizeKb = Buffer.byteLength(content, 'utf-8') / 1024;
    if (sizeKb > MAX_SIZE_KB) {
      needsAggressiveTruncate = true;
    }
  }

  const targetCount = needsAggressiveTruncate ? Math.floor(MAX_ENTRIES * 0.6) : MAX_ENTRIES;

  if (summary.entries.length <= targetCount) {
    return 0;
  }

  const keep = summary.entries.slice(-targetCount);
  const trimmedCount = summary.entries.length - keep.length;

  await writeBreadcrumbJsonl(projectRoot, keep);
  await renderBreadcrumbMarkdown(projectRoot, keep);

  return trimmedCount;
}

export async function truncateBreadcrumb(projectRoot: string): Promise<number> {
  const lockPath = breadcrumbLockPath(projectRoot);
  await mkdir(dirname(lockPath), { recursive: true });
  return withLock(lockPath, () => truncateBreadcrumbUnlocked(projectRoot));
}

function normalizeStepName(step: string): string {
  const match = step.match(/^(S\d+(?:\.\d+)?)/);
  return match ? match[1] : step;
}

function breadcrumbPath(projectRoot: string): string {
  return join(projectRoot, '.docpath', 'workspace', 'breadcrumb.md');
}

function breadcrumbJsonlPath(projectRoot: string): string {
  return join(projectRoot, '.docpath', 'workspace', 'breadcrumb.jsonl');
}

function taskBreadcrumbJsonlPath(projectRoot: string, taskId: string): string | null {
  const safeTaskId = taskId.replace(/[^A-Za-z0-9._-]/g, '_');
  const archivedTaskDir = join(projectRoot, '.docpath', 'tasks', 'done', safeTaskId);
  if (existsSync(archivedTaskDir)) return join(archivedTaskDir, 'breadcrumb.jsonl');
  return join(projectRoot, '.docpath', 'tasks', safeTaskId, 'breadcrumb.jsonl');
}

function breadcrumbLockPath(projectRoot: string): string {
  return join(projectRoot, '.docpath', 'workspace', 'breadcrumb.lock');
}

function toJsonlRecord(entry: BreadcrumbEntry): BreadcrumbJsonlRecord {
  return {
    schema_version: BREADCRUMB_JSONL_SCHEMA_VERSION,
    kind: 'breadcrumb',
    taskId: entry.taskId,
    step: entry.step,
    status: entry.status,
    context: entry.context,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    ...(entry.escalation ? { escalation: entry.escalation } : {}),
  };
}

function validateBreadcrumbRecord(value: unknown, line: number): BreadcrumbJsonlRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`breadcrumb.jsonl 第 ${line} 行必须是 JSON object`);
  }
  const record = value as Partial<BreadcrumbJsonlRecord>;
  const statuses = ['done', 'in_progress', 'blocked', 'skipped'];
  if (record.schema_version !== BREADCRUMB_JSONL_SCHEMA_VERSION) {
    throw new Error(`breadcrumb.jsonl 第 ${line} 行 schema_version 必须为 ${BREADCRUMB_JSONL_SCHEMA_VERSION}`);
  }
  if (record.kind !== 'breadcrumb') throw new Error(`breadcrumb.jsonl 第 ${line} 行 kind 必须为 breadcrumb`);
  if (typeof record.taskId !== 'string') throw new Error(`breadcrumb.jsonl 第 ${line} 行 taskId 必须是字符串`);
  if (typeof record.step !== 'string') throw new Error(`breadcrumb.jsonl 第 ${line} 行 step 必须是字符串`);
  if (typeof record.status !== 'string' || !statuses.includes(record.status)) {
    throw new Error(`breadcrumb.jsonl 第 ${line} 行 status 非法`);
  }
  if (typeof record.context !== 'string') throw new Error(`breadcrumb.jsonl 第 ${line} 行 context 必须是字符串`);
  if (typeof record.timestamp !== 'string') throw new Error(`breadcrumb.jsonl 第 ${line} 行 timestamp 必须是字符串`);
  return record as BreadcrumbJsonlRecord;
}

function summarizeBreadcrumb(entries: BreadcrumbEntry[]): BreadcrumbSummary {
  const done = entries.filter((e) => e.status === 'done').length;
  const inProgress = entries.filter((e) => e.status === 'in_progress').length;
  const blocked = entries.filter((e) => e.status === 'blocked').length;
  return {
    total: entries.length,
    done,
    inProgress,
    blocked,
    latest: entries.length > 0 ? entries[entries.length - 1] : null,
    entries,
  };
}

async function readBreadcrumbJsonlFile(path: string): Promise<BreadcrumbEntry[] | null> {
  let content = '';
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    return null;
  }

  const entries: BreadcrumbEntry[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`breadcrumb.jsonl 第 ${i + 1} 行不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = validateBreadcrumbRecord(parsed, i + 1);
    entries.push({
      taskId: record.taskId,
      step: record.step,
      status: record.status,
      context: record.context,
      timestamp: record.timestamp,
      ...(record.sessionId ? { sessionId: record.sessionId } : {}),
      ...(record.escalation ? { escalation: record.escalation } : {}),
    });
  }
  return entries;
}

async function readBreadcrumbJsonl(projectRoot: string): Promise<BreadcrumbEntry[] | null> {
  return readBreadcrumbJsonlFile(breadcrumbJsonlPath(projectRoot));
}

async function readTaskBreadcrumbJsonl(projectRoot: string, taskId: string): Promise<BreadcrumbEntry[] | null> {
  const path = taskBreadcrumbJsonlPath(projectRoot, taskId);
  if (!path) return null;
  return readBreadcrumbJsonlFile(path);
}

async function writeBreadcrumbJsonlFile(path: string, entries: BreadcrumbEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(toJsonlRecord(entry))).join('\n');
  await writeFileAtomic(path, content ? `${content}\n` : '');
}

async function writeBreadcrumbJsonl(projectRoot: string, entries: BreadcrumbEntry[]): Promise<void> {
  await writeBreadcrumbJsonlFile(breadcrumbJsonlPath(projectRoot), entries);
}

async function appendBreadcrumbJsonlFile(path: string, entry: BreadcrumbEntry): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(toJsonlRecord(entry))}\n`, 'utf-8');
}

async function appendBreadcrumbJsonl(projectRoot: string, entry: BreadcrumbEntry): Promise<void> {
  await appendBreadcrumbJsonlFile(breadcrumbJsonlPath(projectRoot), entry);
}

async function renderBreadcrumbMarkdown(projectRoot: string, entries: BreadcrumbEntry[]): Promise<void> {
  const windowEntries = entries.slice(-MAX_ENTRIES);
  const omitted = entries.length - windowEntries.length;
  const prefix = omitted > 0
    ? `\n> 💡 历史更早的 ${omitted} 条执行轨迹已在各任务目录与 breadcrumb.jsonl 中持久化保存，此处仅展示最近 ${windowEntries.length} 条视图。\n\n`
    : '';
  const body = windowEntries.map((entry) => formatEntry(entry)).join('');
  await writeFileAtomic(breadcrumbPath(projectRoot), BREADCRUMB_HEADER + prefix + body);
}

async function ensureBreadcrumbJsonl(projectRoot: string): Promise<void> {
  if (await readBreadcrumbJsonl(projectRoot) !== null) return;
  const legacy = await readBreadcrumbMarkdown(projectRoot);
  if (legacy.entries.length === 0) return;
  await writeBreadcrumbJsonl(projectRoot, legacy.entries.slice(-MAX_ENTRIES));
}

async function readActiveTaskId(projectRoot: string): Promise<string | null> {
  try {
    const raw = await readFile(join(projectRoot, '.docpath', 'workspace', 'state.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { task_id?: unknown };
    return typeof parsed.task_id === 'string' && parsed.task_id ? parsed.task_id : null;
  } catch {
    return null;
  }
}

async function aggregateAllTaskBreadcrumbs(projectRoot: string): Promise<BreadcrumbSummary> {
  const tasksDir = join(projectRoot, '.docpath', 'tasks');
  let taskDirs: string[] = [];

  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(tasksDir, { withFileTypes: true });
    taskDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'done' && entry.name !== 'current')
      .map((entry) => entry.name);
  } catch {
    return { total: 0, done: 0, inProgress: 0, blocked: 0, latest: null, entries: [] };
  }

  const allEntries: BreadcrumbEntry[] = [];
  for (const taskId of taskDirs) {
    const entries = await readTaskBreadcrumbJsonl(projectRoot, taskId);
    if (entries) allEntries.push(...entries);
  }

  allEntries.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  return summarizeBreadcrumb(allEntries);
}

async function seedTaskBreadcrumbJsonl(projectRoot: string, taskId: string): Promise<BreadcrumbEntry[] | null> {
  const path = taskBreadcrumbJsonlPath(projectRoot, taskId);
  if (!path) return null;

  const existing = await readBreadcrumbJsonlFile(path);
  if (existing !== null) return existing;

  const globalEntries = await readBreadcrumbJsonl(projectRoot);
  const taskEntries = (globalEntries || []).filter((entry) => entry.taskId === taskId);
  if (taskEntries.length > 0) await writeBreadcrumbJsonlFile(path, taskEntries);
  return taskEntries;
}

async function appendTaskBreadcrumbJsonl(projectRoot: string, entry: BreadcrumbEntry): Promise<void> {
  const path = taskBreadcrumbJsonlPath(projectRoot, entry.taskId);
  if (!path) return;

  const existing = await seedTaskBreadcrumbJsonl(projectRoot, entry.taskId);
  if (existing && existing.length > 0) {
    await writeBreadcrumbJsonlFile(path, [...existing, entry]);
    return;
  }
  await appendBreadcrumbJsonlFile(path, entry);
}

export async function writeBreadcrumb(
  projectRoot: string,
  entry: BreadcrumbEntry,
  reporter: BreadcrumbReporter = (message) => process.stdout.write(`${message}\n`),
): Promise<void> {
  const lockPath = breadcrumbLockPath(projectRoot);
  await mkdir(dirname(lockPath), { recursive: true });
  return withLock(lockPath, async () => {
    await ensureBreadcrumbJsonl(projectRoot);

    const ts = entry.timestamp || new Date().toISOString();

    const isPlanStep = /^S\d+(?:\.\d+)?/.test(entry.step);
    if (entry.status === 'done' && isPlanStep) {
      const taskEntries = entry.taskId ? await seedTaskBreadcrumbJsonl(projectRoot, entry.taskId) : null;
      if (taskEntries) {
        const summary = summarizeBreadcrumb(taskEntries);
        const normalizedStep = normalizeStepName(entry.step);
        const latestForStep = [...summary.entries].reverse().find(
          (e) => e.taskId === entry.taskId &&
                 normalizeStepName(e.step) === normalizedStep
        );

        if (latestForStep?.status === 'done') {
          reporter(`⚠️  步骤 ${entry.step} 已完成（记录时间: ${latestForStep.timestamp}），跳过重复记录`);
          return;
        }
      }
    }

    const nextEntry = { ...entry, timestamp: ts };

    await appendTaskBreadcrumbJsonl(projectRoot, nextEntry);
    await appendBreadcrumbJsonl(projectRoot, nextEntry);

    const summary = await readBreadcrumb(projectRoot);
    await renderBreadcrumbMarkdown(projectRoot, summary.entries);
  });
}

export async function readBreadcrumb(projectRoot: string): Promise<BreadcrumbSummary> {
  const activeTaskId = await readActiveTaskId(projectRoot);
  if (activeTaskId) {
    const taskEntries = await readTaskBreadcrumbJsonl(projectRoot, activeTaskId);
    if (taskEntries !== null) return summarizeBreadcrumb(taskEntries);
  }

  const aggregated = await aggregateAllTaskBreadcrumbs(projectRoot);
  if (aggregated.entries.length > 0) return aggregated;

  const jsonlEntries = await readBreadcrumbJsonl(projectRoot);
  if (jsonlEntries !== null) return summarizeBreadcrumb(jsonlEntries);
  return readBreadcrumbMarkdown(projectRoot);
}

async function readBreadcrumbMarkdown(projectRoot: string): Promise<BreadcrumbSummary> {
  const path = breadcrumbPath(projectRoot);
  let content = '';

  try {
    content = await readFile(path, 'utf-8');
  } catch {
    return { total: 0, done: 0, inProgress: 0, blocked: 0, latest: null, entries: [] };
  }

  const entries: BreadcrumbEntry[] = [];
  const blocks = content.split(/(?=^### )/m).filter((b) => b.trim().startsWith('###'));

  for (const block of blocks) {
    const entry = parseEntryBlock(block);
    if (entry) entries.push(entry);
  }

  return summarizeBreadcrumb(entries);
}

export async function readRecentBreadcrumbEntries(projectRoot: string, count: number): Promise<BreadcrumbEntry[]> {
  const summary = await readBreadcrumb(projectRoot);
  return summary.entries.slice(-count);
}

function parseEntryBlock(block: string): BreadcrumbEntry | null {
  const headingMatch = block.match(/^###\s+\S+\s+(.+?)\s+\[(.+?)\]\s+—\s+(.+)$/m);
  if (!headingMatch) return null;

  const step = headingMatch[1].trim();
  const taskId = headingMatch[2].trim();
  const timestamp = headingMatch[3].trim();

  const yamlMatch = block.match(/^---\s*\n([\s\S]*?)^---\s*$/m);
  if (yamlMatch) {
    const yamlBlock = yamlMatch[1];
    const status = yamlUnquote(yamlBlock.match(/^status:\s*(.+)$/m)?.[1] || '') as BreadcrumbEntry['status'] | undefined;
    const context = block.match(/^- \*\*上下文\*\*:\s*(.+)$/m)?.[1]?.trim() || '';
    return {
      taskId: yamlUnquote(yamlBlock.match(/^taskId:\s*(.+)$/m)?.[1] || '') || taskId,
      step: yamlUnquote(yamlBlock.match(/^step:\s*(.+)$/m)?.[1] || '') || step,
      status: status || 'done',
      context,
      timestamp: yamlUnquote(yamlBlock.match(/^timestamp:\s*(.+)$/m)?.[1] || '') || timestamp,
      ...(yamlBlock.match(/^sessionId:\s*(.+)$/m)?.[1] ? { sessionId: yamlUnquote(yamlBlock.match(/^sessionId:\s*(.+)$/m)?.[1]!) } : {}),
      ...(yamlBlock.match(/^escalation:\s*(.+)$/m)?.[1] ? { escalation: yamlUnquote(yamlBlock.match(/^escalation:\s*(.+)$/m)?.[1]!) } : {}),
    };
  }

  const statusLine = block.match(/^- \*\*状态\*\*:\s*(.+)$/m)?.[1]?.trim();
  const contextLine = block.match(/^- \*\*上下文\*\*:\s*(.+)$/m)?.[1]?.trim() || '';

  return {
    taskId,
    step,
    status: (statusLine as BreadcrumbEntry['status']) || 'done',
    context: contextLine,
    timestamp,
    ...(block.match(/^[-*] \*\*Session\*\*:\s*(.+)$/m)?.[1] ? { sessionId: block.match(/^[-*] \*\*Session\*\*:\s*(.+)$/m)![1].trim() } : {}),
    ...(block.match(/^[-*] \*\*升级\*\*:\s*(.+)$/m)?.[1] ? { escalation: block.match(/^[-*] \*\*升级\*\*:\s*(.+)$/m)![1].trim() } : {}),
  };
}

export async function getLatestEntry(projectRoot: string): Promise<BreadcrumbEntry | null> {
  const summary = await readBreadcrumb(projectRoot);
  return summary.latest;
}
