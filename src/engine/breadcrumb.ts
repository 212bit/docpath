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

import { join } from 'path';
import { readFile, appendFile, writeFile } from 'fs/promises';

/** 面包屑最大保留条数 */
export const MAX_ENTRIES = 50;

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

const BREADCRUMB_HEADER = `# 面包屑 — 上下文恢复索引

> 此文件由 DocPath 自动生成。每完成一个子任务追加一条记录。
> 格式：YAML frontmatter（结构化字段）+ Markdown body（人类可读）。
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
function yamlEscape(value: string): string {
  // 需要引号的场景：
  // 1. 空值  2. 含特殊字符  3. 整个值是 YAML 关键字/布尔/数字  4. 首字符是 YAML 特殊前缀
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

function formatEntry(entry: BreadcrumbEntry): string {
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
    '---',
    '',
    `- **状态**: ${entry.status}`,
    `- **上下文**: ${entry.context}`,
    '',
  ].join('\n');
}

/**
 * 截断轮转 — 保留最近 MAX_ENTRIES 条记录
 *
 * 解析 breadcrumb.md 中所有条目，只保留最后 MAX_ENTRIES 条，
 * 重新写入文件。返回被裁剪的数量。
 */
export async function truncateBreadcrumb(projectRoot: string): Promise<number> {
  const breadcrumbPath = join(projectRoot, '.docpath', 'workspace', 'breadcrumb.md');
  const summary = await readBreadcrumb(projectRoot);

  if (summary.entries.length <= MAX_ENTRIES) {
    return 0;
  }

  const keep = summary.entries.slice(-MAX_ENTRIES);
  const trimmedCount = summary.entries.length - keep.length;

  const body = keep.map((e) => formatEntry(e)).join('');
  const newContent = BREADCRUMB_HEADER + body;
  await writeFile(breadcrumbPath, newContent, 'utf-8');

  return trimmedCount;
}

/**
 * 写入一条面包屑记录
 *
 * 追加后自动执行截断轮转（保留最近 MAX_ENTRIES 条）。
 *
 * @param projectRoot 项目根目录 (包含 .docpath/ 的目录)
 * @param entry 面包屑条目
 */
export async function writeBreadcrumb(
  projectRoot: string,
  entry: BreadcrumbEntry,
): Promise<void> {
  const breadcrumbPath = join(projectRoot, '.docpath', 'workspace', 'breadcrumb.md');
  const ts = entry.timestamp || new Date().toISOString();
  const line = formatEntry({ ...entry, timestamp: ts });

  try {
    // 检查文件是否存在，不存在则写入 header
    await readFile(breadcrumbPath, 'utf-8');
  } catch {
    await writeFile(breadcrumbPath, BREADCRUMB_HEADER, 'utf-8');
  }

  await appendFile(breadcrumbPath, line, 'utf-8');

  // 截断轮转：超过 MAX_ENTRIES 时裁剪最旧记录
  const trimmed = await truncateBreadcrumb(projectRoot);
  if (trimmed > 0) {
    console.log(`🔄 面包屑轮转: 裁剪了 ${trimmed} 条旧记录（保留最近 ${MAX_ENTRIES} 条）`);
  }
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
  const breadcrumbPath = join(projectRoot, '.docpath', 'workspace', 'breadcrumb.md');
  let content = '';

  try {
    content = await readFile(breadcrumbPath, 'utf-8');
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
    const status = yamlBlock.match(/^status:\s*(.+)$/m)?.[1]?.trim() as BreadcrumbEntry['status'] | undefined;
    const context = block.match(/^- \*\*上下文\*\*:\s*(.+)$/m)?.[1]?.trim() || '';
    return {
      taskId: yamlBlock.match(/^taskId:\s*(.+)$/m)?.[1]?.trim() || taskId,
      step: yamlBlock.match(/^step:\s*(.+)$/m)?.[1]?.trim() || step,
      status: status || 'done',
      context,
      timestamp: yamlBlock.match(/^timestamp:\s*(.+)$/m)?.[1]?.trim() || timestamp,
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
  };
}

/**
 * 获取最新一条 breadcrumb 条目
 */
export async function getLatestEntry(projectRoot: string): Promise<BreadcrumbEntry | null> {
  const summary = await readBreadcrumb(projectRoot);
  return summary.latest;
}
