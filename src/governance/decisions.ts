/**
 * decisionsLog — 自动化决策日志 (借鉴 Trellis)
 *
 * 每次关键操作自动追加决策记录到 decisions.md
 */

import { existsSync } from 'fs';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';

export interface DecisionRecordInput {
  category: string;
  decision: string;
  context?: string;
  impact?: string;
  alternatives?: string[];
  relatedFiles?: string[];
  taskId?: string;
}

export interface GcDecisionsOptions {
  retentionDays?: number;
  now?: Date;
}

export interface GcDecisionsResult {
  decisionsPath: string;
  retained: number;
  archived: number;
  archiveFiles: string[];
}

const DECISIONS_HEADER = [
  '# 决策日志 — DocPath ADR',
  '',
  '> 每条 decision 使用轻量 ADR 模板记录，便于长期检索、审查和上下文披露。',
  '',
  '---',
  '',
].join('\n');

function archiveHeader(month: string): string {
  return [
    `# 决策日志归档 — ${month}`,
    '',
    '> 历史 ADR 由 `docpath gc-decisions` 从 workspace/decisions.md 按月轮转生成。',
    '',
    '---',
    '',
  ].join('\n');
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function nextDecisionId(content: string, now: Date): string {
  const prefix = `ADR-${dateStamp(now)}-`;
  const matches = Array.from(content.matchAll(new RegExp(`^##\\s+${prefix}(\\d{3})\\b`, 'gm')));
  const max = matches.reduce((acc, match) => Math.max(acc, parseInt(match[1], 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function normalizeList(items: string[] | undefined, fallback: string): string[] {
  const normalized = (items || []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [fallback];
}

function renderDecision(record: Required<DecisionRecordInput> & { id: string; createdAt: string }): string {
  return [
    `## ${record.id} — ${record.category}`,
    '',
    `- task_id: ${record.taskId || 'unknown'}`,
    `- created_at: ${record.createdAt}`,
    `- category: ${record.category}`,
    '',
    '### 背景',
    '',
    record.context || '未记录背景。',
    '',
    '### 决策',
    '',
    record.decision,
    '',
    '### 影响',
    '',
    record.impact || '影响待后续观察。',
    '',
    '### 替代方案',
    '',
    ...normalizeList(record.alternatives, '未记录替代方案。').map((item) => `- ${item}`),
    '',
    '### 相关文件',
    '',
    ...normalizeList(record.relatedFiles, '未记录相关文件。').map((item) => `- ${item}`),
    '',
    '---',
    '',
  ].join('\n');
}

interface DecisionBlock {
  id: string;
  createdAt?: Date;
  month?: string;
  raw: string;
}

function splitDecisionDocument(content: string): { header: string; blocks: DecisionBlock[] } {
  const parts = content.split(/(?=^##\s+ADR-)/m);
  const header = parts[0]?.trim()
    ? `${parts[0].trimEnd()}\n\n`
    : DECISIONS_HEADER;
  const blocks = parts.slice(1)
    .map((part) => parseDecisionBlock(part))
    .filter((block): block is DecisionBlock => Boolean(block));
  return { header, blocks };
}

function parseDecisionBlock(rawBlock: string): DecisionBlock | null {
  const raw = rawBlock.trimEnd() + '\n\n';
  const id = raw.match(/^##\s+(ADR-\d{8}-\d{3})\b/m)?.[1];
  if (!id) return null;

  const createdAtRaw = raw.match(/^- created_at:\s*(.+)$/m)?.[1]?.trim();
  const createdAt = createdAtRaw ? new Date(createdAtRaw) : undefined;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;
  return {
    id,
    createdAt: validCreatedAt,
    month: validCreatedAt ? validCreatedAt.toISOString().slice(0, 7) : undefined,
    raw,
  };
}

function renderDecisionDocument(header: string, blocks: DecisionBlock[]): string {
  return header.trimEnd() + '\n\n' + blocks.map((block) => block.raw.trimEnd()).join('\n\n') + (blocks.length > 0 ? '\n\n' : '');
}

function cutoffTime(now: Date, retentionDays: number): number {
  return now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
}

function isArchivable(block: DecisionBlock, cutoff: number): boolean {
  return Boolean(block.createdAt && block.month && block.createdAt.getTime() < cutoff);
}

async function appendArchiveBlocks(archivePath: string, month: string, blocks: DecisionBlock[]): Promise<boolean> {
  const existing = existsSync(archivePath) ? await readFile(archivePath, 'utf-8') : archiveHeader(month);
  const existingIds = new Set(splitDecisionDocument(existing).blocks.map((block) => block.id));
  const newBlocks = blocks.filter((block) => !existingIds.has(block.id));
  if (newBlocks.length === 0) return false;

  const separator = existing.trimEnd().length > 0 ? '\n\n' : '';
  await writeFile(
    archivePath,
    existing.trimEnd() + separator + newBlocks.map((block) => block.raw.trimEnd()).join('\n\n') + '\n\n',
    'utf-8',
  );
  return true;
}

/**
 * 追加一条决策记录
 */
export async function appendDecision(
  cwd: string,
  category: string,
  decision: string,
  reasoning?: string,
  details: Partial<Omit<DecisionRecordInput, 'category' | 'decision'>> = {},
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const decisionsPath = join(docpathDir, 'workspace', 'decisions.md');
  const state = await readCurrentState(cwd);

  let existing = '';
  if (!existsSync(decisionsPath)) {
    await writeFile(decisionsPath, DECISIONS_HEADER, 'utf-8');
    existing = DECISIONS_HEADER;
  } else {
    existing = await readFile(decisionsPath, 'utf-8');
  }

  const now = new Date();
  const entry = renderDecision({
    id: nextDecisionId(existing, now),
    createdAt: now.toISOString(),
    category,
    decision,
    context: details.context || reasoning || '由 DocPath 工作流自动记录。',
    impact: details.impact || '影响待后续 review/journal 验证。',
    alternatives: details.alternatives || [],
    relatedFiles: details.relatedFiles || [],
    taskId: details.taskId || state?.task_id || 'unknown',
  });

  await appendFile(decisionsPath, entry, 'utf-8');
}

/**
 * 按 created_at 将超过保留窗口的 ADR 轮转到 decisions-YYYY-MM.md。
 * 缺失或无法解析 created_at 的条目保留在主文件，避免误归档。
 */
export async function gcDecisions(cwd: string, options: GcDecisionsOptions = {}): Promise<GcDecisionsResult> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  const decisionsPath = join(workspaceDir, 'decisions.md');
  const retentionDays = options.retentionDays ?? 30;
  const now = options.now ?? new Date();

  if (!existsSync(decisionsPath)) {
    return {
      decisionsPath,
      retained: 0,
      archived: 0,
      archiveFiles: [],
    };
  }

  const content = await readFile(decisionsPath, 'utf-8');
  const { header, blocks } = splitDecisionDocument(content);
  const cutoff = cutoffTime(now, retentionDays);
  const retained = blocks.filter((block) => !isArchivable(block, cutoff));
  const archivable = blocks.filter((block) => isArchivable(block, cutoff));
  const archiveFiles: string[] = [];

  const byMonth = new Map<string, DecisionBlock[]>();
  for (const block of archivable) {
    if (!block.month) continue;
    byMonth.set(block.month, [...(byMonth.get(block.month) || []), block]);
  }

  for (const [month, monthBlocks] of byMonth.entries()) {
    const archivePath = join(workspaceDir, `decisions-${month}.md`);
    const changed = await appendArchiveBlocks(archivePath, month, monthBlocks);
    if (changed) archiveFiles.push(archivePath);
  }

  if (archivable.length > 0) {
    await writeFile(decisionsPath, renderDecisionDocument(header, retained), 'utf-8');
  }

  return {
    decisionsPath,
    retained: retained.length,
    archived: archivable.length,
    archiveFiles,
  };
}

/**
 * 读取最近 N 条决策
 */
export async function getRecentDecisions(cwd: string, count: number = 5): Promise<string[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const decisionsPath = join(docpathDir, 'workspace', 'decisions.md');
  if (!existsSync(decisionsPath)) return [];

  const content = await readFile(decisionsPath, 'utf-8');
  const blocks = content.split(/^## /m).filter((block) => /^ADR-/.test(block.trim())).slice(-count);
  return blocks.map(b => '## ' + b.trim());
}
