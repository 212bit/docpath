/**
 * Breadcrumb 协议 — GSD 上下文追踪
 *
 * 每个子任务完成后写入一条记录到 .docpath/workspace/breadcrumb.md，
 * 格式：YAML frontmatter + Markdown body。
 *
 * 断线重连时由 docpath:continue 命令读取，恢复上下文。
 *
 * **截断轮转**：超过 MAX_ENTRIES（默认 50）时自动裁剪最旧记录。
 */

import { join, dirname } from 'path';
import { readFile, appendFile, writeFile, mkdir } from 'fs/promises';
import { writeFileAtomic } from '../utils/file.js';
import { withLock } from '../utils/lock.js';

/** 面包屑最大保留条数 */
export const MAX_ENTRIES = 50;
export const BREADCRUMB_JSONL_SCHEMA_VERSION = 1;

export interface BreadcrumbEntry {
  /** 任务 ID */
  taskId: string;
  /** 子任务编号 (e.g. S1.2) */
  step: string;
  /** 状态: done | in_progress | blocked | skipped */
  status: 'done' | 'in_progress' | 'blocked' | 'skipped';
  /** 上下文信息，人类可读 */
  context: string;
  /** 时间戳 (ISO) */
  timestamp?: string;
  /** 升级类型 */
  escalation?: string;
  /** 写入该事件的 agent/session 标识 */
  sessionId?: string;
}

export interface BreadcrumbSummary {
  /** 总子任务数 */
  total: number;
  /** 已完成数 */
  done: number;
  /** 进行中数 */
  inProgress: number;
  /** 阻塞数 */
  blocked: number;
  /** 最新一条记录 */
  latest: BreadcrumbEntry | null;
  /** 所有记录 */
  entries: BreadcrumbEntry[];
}

export interface BreadcrumbJsonlRecord extends BreadcrumbEntry {
  schema_version: number;
  kind: 'breadcrumb';
  timestamp: string;
}

export type BreadcrumbReporter = (message: string) => void;

export const BREADCRUMB_HEADER = `# 面包屑 — 上下文恢复索引

> 此文件由 DocPath 自动生成。每完成一个子任务追加一条记录。
> 格式：YAML frontmatter（结构化字段）+ Markdown body（人类可读）。
> 结构化真源：breadcrumb.jsonl；本 Markdown 文件是可重建视图。
> 超过 ${MAX_ENTRIES} 条记录时自动裁剪最旧条目。
`;

const STATUS_EMOJI: Record<BreadcrumbEntry['status'], string> = {
  done: '✅',
  in_progress: '🔄',
  blocked: '🚫',
  skipped: '⏭️',
};

/**
 * 格式化一条面包屑记录 — YAML frontmatter + Markdown body
 *
 * ```markdown
 * ### ✅ S1.2 [T-001] — 2026-05-29T10:00:00
 *
 * ---
 * taskId: T-001
 * step: S1.2
 * status: done
 * timestamp: 2026-05-29T10:00:00
 * ---
 *
 * - **状态**: done
 * - **上下文**: 完成了 X 模块
 * ```
 */
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

/**
 * 截断轮转 — 保留最近 MAX_ENTRIES 条记录
 *
 * 解析 breadcrumb.md 中所有条目，只保留最后 MAX_ENTRIES 条，
 * 重新写入文件。返回被裁剪的数量。
 */
async function truncateBreadcrumbUnlocked(projectRoot: string): Promise<number> {
  const summary = await readBreadcrumb(projectRoot);

  if (summary.entries.length <= MAX_ENTRIES) {
    return 0;
  }

  const keep = summary.entries.slice(-MAX_ENTRIES);
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

/**
 * 归一化步骤名：S1: xxx → S1, S1 → S1
 */
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

async function readBreadcrumbJsonl(projectRoot: string): Promise<BreadcrumbEntry[] | null> {
  const path = breadcrumbJsonlPath(projectRoot);
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

async function writeBreadcrumbJsonl(projectRoot: string, entries: BreadcrumbEntry[]): Promise<void> {
  const path = breadcrumbJsonlPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(toJsonlRecord(entry))).join('\n');
  await writeFileAtomic(path, content ? `${content}\n` : '');
}

async function appendBreadcrumbJsonl(projectRoot: string, entry: BreadcrumbEntry): Promise<void> {
  const path = breadcrumbJsonlPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(toJsonlRecord(entry))}\n`, 'utf-8');
}

async function renderBreadcrumbMarkdown(projectRoot: string, entries: BreadcrumbEntry[]): Promise<void> {
  const body = entries.map((entry) => formatEntry(entry)).join('');
  await writeFileAtomic(breadcrumbPath(projectRoot), BREADCRUMB_HEADER + body);
}

async function ensureBreadcrumbJsonl(projectRoot: string): Promise<void> {
  if (await readBreadcrumbJsonl(projectRoot) !== null) return;
  const legacy = await readBreadcrumbMarkdown(projectRoot);
  if (legacy.entries.length === 0) return;
  await writeBreadcrumbJsonl(projectRoot, legacy.entries.slice(-MAX_ENTRIES));
}

/**
 * 写入一条面包屑记录
 *
 * 追加前检查去重：如果同一任务中已有相同步骤（归一化后）的 done 记录，则跳过。
 * 追加后自动执行截断轮转（保留最近 MAX_ENTRIES 条）。
 *
 * @param projectRoot 项目根目录 (包含 .docpath/ 的目录)
 * @param entry 面包屑条目
 */
export async function writeBreadcrumb(
  projectRoot: string,
  entry: BreadcrumbEntry,
  reporter: BreadcrumbReporter = (message) => process.stdout.write(`${message}\n`),
): Promise<void> {
  const lockPath = breadcrumbLockPath(projectRoot);
  await mkdir(dirname(lockPath), { recursive: true });
  return withLock(lockPath, async () => {
    const path = breadcrumbPath(projectRoot);
    const ts = entry.timestamp || new Date().toISOString();
    await ensureBreadcrumbJsonl(projectRoot);

    // 去重检查：只针对 done 状态
    if (entry.status === 'done') {
      const summary = await readBreadcrumb(projectRoot);
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

    const nextEntry = { ...entry, timestamp: ts };
    const line = formatEntry(nextEntry);

    try {
      // 检查文件是否存在，不存在则写入 header
      await readFile(path, 'utf-8');
    } catch {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, BREADCRUMB_HEADER, 'utf-8');
    }

    await appendFile(path, line, 'utf-8');
    await appendBreadcrumbJsonl(projectRoot, nextEntry);

    // 截断轮转：超过 MAX_ENTRIES 时裁剪最旧记录
    const trimmed = await truncateBreadcrumbUnlocked(projectRoot);
    if (trimmed > 0) {
      reporter(`🔄 面包屑轮转: 裁剪了 ${trimmed} 条旧记录（保留最近 ${MAX_ENTRIES} 条）`);
    }
  });
}

/**
 * 读取所有面包屑记录
 *
 * 解析 breadcrumb.md 中的格式化记录。
 * 支持两种格式向后兼容：
 * - 新格式：YAML frontmatter（--- 围栏）+ Markdown body
 * - 旧格式：仅 Markdown heading + bullet list
 *
 * @param projectRoot 项目根目录
 */
export async function readBreadcrumb(projectRoot: string): Promise<BreadcrumbSummary> {
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

  // 按 ### heading 分割条目块
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

/**
 * 解析单个面包屑条目块（兼容新旧格式）
 */
function parseEntryBlock(block: string): BreadcrumbEntry | null {
  // 提取 heading: ### emoji step [taskId] — timestamp
  const headingMatch = block.match(/^###\s+\S+\s+(.+?)\s+\[(.+?)\]\s+—\s+(.+)$/m);
  if (!headingMatch) return null;

  const step = headingMatch[1].trim();
  const taskId = headingMatch[2].trim();
  const timestamp = headingMatch[3].trim();

  // 尝试新格式：YAML frontmatter 区块
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

  // 旧格式回退：从 bullet list 提取
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

/**
 * 获取最新一条 breadcrumb 条目
 */
export async function getLatestEntry(projectRoot: string): Promise<BreadcrumbEntry | null> {
  const summary = await readBreadcrumb(projectRoot);
  return summary.latest;
}
