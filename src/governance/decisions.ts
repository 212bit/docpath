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

export const DECISIONS_JSONL_SCHEMA_VERSION = 1;

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
  /** Maximum size in KB before forcing rotation (default: 100KB) */
  maxSizeKb?: number;
  /** Maximum number of records before forcing rotation (default: 1000) */
  maxRecords?: number;
}

export interface GcDecisionsResult {
  decisionsPath: string;
  retained: number;
  archived: number;
  archiveFiles: string[];
}

export interface DecisionJsonlRecord {
  schema_version: number;
  kind: 'decision';
  id: string;
  taskId: string;
  createdAt: string;
  category: string;
  context: string;
  decision: string;
  impact: string;
  alternatives: string[];
  relatedFiles: string[];
}

type RenderableDecisionRecord = Required<DecisionRecordInput> & { id: string; createdAt: string };

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

function renderDecision(record: RenderableDecisionRecord): string {
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

function decisionsJsonlPath(workspaceDir: string): string {
  return join(workspaceDir, 'decisions.jsonl');
}

function toJsonlRecord(record: RenderableDecisionRecord): DecisionJsonlRecord {
  return {
    schema_version: DECISIONS_JSONL_SCHEMA_VERSION,
    kind: 'decision',
    id: record.id,
    taskId: record.taskId || 'unknown',
    createdAt: record.createdAt,
    category: record.category,
    context: record.context || '未记录背景。',
    decision: record.decision,
    impact: record.impact || '影响待后续观察。',
    alternatives: record.alternatives || [],
    relatedFiles: record.relatedFiles || [],
  };
}

function fromJsonlRecord(record: DecisionJsonlRecord): RenderableDecisionRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    taskId: record.taskId,
    category: record.category,
    context: record.context,
    decision: record.decision,
    impact: record.impact,
    alternatives: record.alternatives,
    relatedFiles: record.relatedFiles,
  };
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

function extractDecisionSection(raw: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`^###\\s+${escaped}\\s*$`, 'm'));
  if (!match) return '';
  const start = (match.index ?? 0) + match[0].length;
  const rest = raw.slice(start);
  const next = rest.search(/\n###\s+/);
  return (next === -1 ? rest : rest.slice(0, next))
    .replace(/\n---\s*$/m, '')
    .trim();
}

function parseMarkdownList(section: string): string[] {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseDecisionRecordFromBlock(block: DecisionBlock): DecisionJsonlRecord | null {
  const createdAt = block.raw.match(/^- created_at:\s*(.+)$/m)?.[1]?.trim();
  const category = block.raw.match(/^- category:\s*(.+)$/m)?.[1]?.trim()
    || block.raw.match(/^##\s+ADR-\d{8}-\d{3}\s+—\s+(.+)$/m)?.[1]?.trim()
    || 'unknown';
  const taskId = block.raw.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim() || 'unknown';
  const decision = extractDecisionSection(block.raw, '决策');
  if (!createdAt || !decision) return null;

  const record = toJsonlRecord({
    id: block.id,
    createdAt,
    taskId,
    category,
    context: extractDecisionSection(block.raw, '背景') || '未记录背景。',
    decision,
    impact: extractDecisionSection(block.raw, '影响') || '影响待后续观察。',
    alternatives: parseMarkdownList(extractDecisionSection(block.raw, '替代方案')),
    relatedFiles: parseMarkdownList(extractDecisionSection(block.raw, '相关文件')),
  });
  return record;
}

function validateDecisionRecord(value: unknown, line: number): DecisionJsonlRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`decisions.jsonl 第 ${line} 行必须是 JSON object`);
  }
  const record = value as Partial<DecisionJsonlRecord>;
  if (record.schema_version !== DECISIONS_JSONL_SCHEMA_VERSION) {
    throw new Error(`decisions.jsonl 第 ${line} 行 schema_version 必须为 ${DECISIONS_JSONL_SCHEMA_VERSION}`);
  }
  if (record.kind !== 'decision') throw new Error(`decisions.jsonl 第 ${line} 行 kind 必须为 decision`);
  for (const field of ['id', 'taskId', 'createdAt', 'category', 'context', 'decision', 'impact']) {
    if (typeof record[field as keyof DecisionJsonlRecord] !== 'string') {
      throw new Error(`decisions.jsonl 第 ${line} 行 ${field} 必须是字符串`);
    }
  }
  if (!Array.isArray(record.alternatives)) throw new Error(`decisions.jsonl 第 ${line} 行 alternatives 必须是数组`);
  if (!Array.isArray(record.relatedFiles)) throw new Error(`decisions.jsonl 第 ${line} 行 relatedFiles 必须是数组`);
  return record as DecisionJsonlRecord;
}

async function readDecisionJsonl(workspaceDir: string): Promise<DecisionJsonlRecord[] | null> {
  const path = decisionsJsonlPath(workspaceDir);
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  const records: DecisionJsonlRecord[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`decisions.jsonl 第 ${i + 1} 行不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    records.push(validateDecisionRecord(parsed, i + 1));
  }
  return records;
}

async function writeDecisionJsonl(workspaceDir: string, records: DecisionJsonlRecord[]): Promise<void> {
  const content = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(decisionsJsonlPath(workspaceDir), content ? `${content}\n` : '', 'utf-8');
}

async function appendDecisionJsonl(workspaceDir: string, record: DecisionJsonlRecord): Promise<void> {
  await appendFile(decisionsJsonlPath(workspaceDir), `${JSON.stringify(record)}\n`, 'utf-8');
}

function renderDecisionRecords(records: DecisionJsonlRecord[]): string {
  return renderDecisionDocument(
    DECISIONS_HEADER,
    records.map((record) => ({
      id: record.id,
      createdAt: new Date(record.createdAt),
      month: record.createdAt.slice(0, 7),
      raw: renderDecision(fromJsonlRecord(record)),
    })),
  );
}

async function ensureDecisionJsonl(workspaceDir: string): Promise<DecisionJsonlRecord[]> {
  const existing = await readDecisionJsonl(workspaceDir);
  if (existing !== null) return existing;

  const decisionsPath = join(workspaceDir, 'decisions.md');
  if (!existsSync(decisionsPath)) return [];
  const content = await readFile(decisionsPath, 'utf-8');
  const { blocks } = splitDecisionDocument(content);
  const records = blocks
    .map((block) => parseDecisionRecordFromBlock(block))
    .filter((record): record is DecisionJsonlRecord => Boolean(record));
  await writeDecisionJsonl(workspaceDir, records);
  return records;
}

function renderDecisionDocument(header: string, blocks: DecisionBlock[]): string {
  return header.trimEnd() + '\n\n' + blocks.map((block) => block.raw.trimEnd()).join('\n\n') + (blocks.length > 0 ? '\n\n' : '');
}

function cutoffTime(now: Date, retentionDays: number): number {
  return now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
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
 * 追加一条决策记录，并在接近大小限制时发出警告
 */
export async function appendDecision(
  cwd: string,
  category: string,
  decision: string,
  reasoning?: string,
  details: Partial<Omit<DecisionRecordInput, 'category' | 'decision'>> = {},
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  const decisionsPath = join(workspaceDir, 'decisions.md');
  const state = await readCurrentState(cwd);
  await ensureDecisionJsonl(workspaceDir);

  let existing = '';
  if (!existsSync(decisionsPath)) {
    await writeFile(decisionsPath, DECISIONS_HEADER, 'utf-8');
    existing = DECISIONS_HEADER;
  } else {
    existing = await readFile(decisionsPath, 'utf-8');
  }

  // Check size and warn if approaching limits
  const sizeKb = Buffer.byteLength(existing, 'utf-8') / 1024;
  const records = await readDecisionJsonl(workspaceDir);
  const recordCount = records?.length || 0;

  if (sizeKb > 80 || recordCount > 800) {
    console.warn(`⚠️  decisions.md 即将超限 (${Math.round(sizeKb)}KB, ${recordCount} 条)，建议运行 docpath journal 触发 gc`);
  }

  const now = new Date();
  const record = {
    id: nextDecisionId(existing, now),
    createdAt: now.toISOString(),
    category,
    decision,
    context: details.context || reasoning || '由 DocPath 工作流自动记录。',
    impact: details.impact || '影响待后续 review/journal 验证。',
    alternatives: details.alternatives || [],
    relatedFiles: details.relatedFiles || [],
    taskId: details.taskId || state?.task_id || 'unknown',
  };
  const entry = renderDecision(record);

  await appendFile(decisionsPath, entry, 'utf-8');
  await appendDecisionJsonl(workspaceDir, toJsonlRecord(record));
}

/**
 * 按 created_at 将超过保留窗口的 ADR 轮转到 decisions-YYYY-MM.md。
 * 缺失或无法解析 created_at 的条目保留在主文件，避免误归档。
 *
 * Size-based rotation: If decisions.md exceeds maxSizeKb or records exceed maxRecords,
 * force rotation of oldest 50% of records regardless of age.
 */
export async function gcDecisions(cwd: string, options: GcDecisionsOptions = {}): Promise<GcDecisionsResult> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  const decisionsPath = join(workspaceDir, 'decisions.md');
  const retentionDays = options.retentionDays ?? 14;
  const maxSizeKb = options.maxSizeKb ?? 100;
  const maxRecords = options.maxRecords ?? 1000;
  const now = options.now ?? new Date();

  if (!existsSync(decisionsPath)) {
    return {
      decisionsPath,
      retained: 0,
      archived: 0,
      archiveFiles: [],
    };
  }

  const records = await ensureDecisionJsonl(workspaceDir);
  const cutoff = cutoffTime(now, retentionDays);

  // Check if size-based rotation is needed
  const decisionsContent = await readFile(decisionsPath, 'utf-8');
  const sizeKb = Buffer.byteLength(decisionsContent, 'utf-8') / 1024;
  const needsSizeRotation = sizeKb > maxSizeKb || records.length > maxRecords;

  let retainedRecords: DecisionJsonlRecord[];
  let archivableRecords: DecisionJsonlRecord[];

  if (needsSizeRotation) {
    // Force rotation of oldest 50% regardless of age
    const sortedRecords = [...records].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });
    const splitIndex = Math.ceil(sortedRecords.length / 2);
    archivableRecords = sortedRecords.slice(0, splitIndex);
    retainedRecords = sortedRecords.slice(splitIndex);
  } else {
    // Normal age-based rotation
    retainedRecords = records.filter((record) => {
      const createdAt = new Date(record.createdAt);
      return Number.isNaN(createdAt.getTime()) || createdAt.getTime() >= cutoff;
    });
    archivableRecords = records.filter((record) => {
      const createdAt = new Date(record.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt.getTime() < cutoff;
    });
  }
  const archiveFiles: string[] = [];

  const byMonth = new Map<string, DecisionBlock[]>();
  for (const record of archivableRecords) {
    const createdAt = new Date(record.createdAt);
    const month = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toISOString().slice(0, 7);
    if (!month) continue;
    const block = {
      id: record.id,
      createdAt,
      month,
      raw: renderDecision(fromJsonlRecord(record)),
    };
    byMonth.set(month, [...(byMonth.get(month) || []), block]);
  }

  for (const [month, monthBlocks] of byMonth.entries()) {
    const archivePath = join(workspaceDir, `decisions-${month}.md`);
    const changed = await appendArchiveBlocks(archivePath, month, monthBlocks);
    if (changed) archiveFiles.push(archivePath);
  }

  if (archivableRecords.length > 0) {
    await writeDecisionJsonl(workspaceDir, retainedRecords);
    await writeFile(decisionsPath, renderDecisionRecords(retainedRecords), 'utf-8');
  }

  return {
    decisionsPath,
    retained: retainedRecords.length,
    archived: archivableRecords.length,
    archiveFiles,
  };
}

/**
 * 读取最近 N 条决策
 */
export async function getRecentDecisions(cwd: string, count: number = 5): Promise<string[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  const records = await readDecisionJsonl(workspaceDir);
  if (records !== null) {
    return records.slice(-count).map((record) => renderDecision(fromJsonlRecord(record)).trim());
  }

  const decisionsPath = join(workspaceDir, 'decisions.md');
  if (!existsSync(decisionsPath)) return [];

  const content = await readFile(decisionsPath, 'utf-8');
  const blocks = content.split(/^## /m).filter((block) => /^ADR-/.test(block.trim())).slice(-count);
  return blocks.map(b => '## ' + b.trim());
}
