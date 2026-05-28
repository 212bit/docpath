/**
 * Breadcrumb 协议 — GSD 上下文追踪
 *
 * 每个子任务完成后写入一条记录到 .docpath/workspace/breadcrumb.md，
 * 格式：YAML frontmatter + Markdown body。
 *
 * 断线重连时由 docpath:continue 命令读取，恢复上下文。
 */

import { join } from 'path';
import { readFile, appendFile, writeFile } from 'fs/promises';

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

/**
 * 格式化一条面包屑记录为 Markdown 行
 */
function formatEntry(entry: BreadcrumbEntry): string {
  const ts = entry.timestamp || new Date().toISOString();
  const statusEmoji =
    entry.status === 'done' ? '✅' :
    entry.status === 'in_progress' ? '🔄' :
    entry.status === 'blocked' ? '🚫' :
    '⏭️';
  return `\n### ${statusEmoji} ${entry.step} [${entry.taskId}] — ${ts}\n\n- **状态**: ${entry.status}\n- **上下文**: ${entry.context}\n`;
}

/**
 * 写入一条面包屑记录
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
    await writeFile(breadcrumbPath, `# 面包屑 — 上下文恢复索引\n\n> 此文件由 DocPath 自动生成。每完成一个子任务追加一条记录。\n`, 'utf-8');
  }

  await appendFile(breadcrumbPath, line, 'utf-8');
}

/**
 * 读取所有面包屑记录
 *
 * 解析 breadcrumb.md 中的 Markdown 格式记录。
 * 支持两种格式：YAML frontmatter 和 Markdown heading。
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

  // 匹配 Markdown 格式的条目：### ✅ S1.2 [T-xxx] — 2026-05-28T10:00
  const headingRegex = /^### [✅🔄⏭️🚫]+ (.+?) \[(.+?)\] — (.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    const step = match[1].trim();
    const taskId = match[2].trim();
    const timestamp = match[3].trim();

    // 提取该条目下的状态和上下文
    const blockStart = match.index + match[0].length;
    const blockEnd = content.indexOf('\n### ', blockStart);
    const block = content.slice(blockStart, blockEnd === -1 ? content.length : blockEnd);

    const statusMatch = block.match(/- \*\*状态\*\*: (\w+)/);
    const contextMatch = block.match(/- \*\*上下文\*\*: (.+)/);

    const status = (statusMatch?.[1] || 'done') as BreadcrumbEntry['status'];
    const ctx = contextMatch?.[1] || '';

    entries.push({ taskId, step, status, context: ctx, timestamp });
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
 * 获取最新一条 breadcrumb 条目
 */
export async function getLatestEntry(projectRoot: string): Promise<BreadcrumbEntry | null> {
  const summary = await readBreadcrumb(projectRoot);
  return summary.latest;
}
