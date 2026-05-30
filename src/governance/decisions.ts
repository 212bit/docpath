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

const DECISIONS_HEADER = [
  '# 决策日志 — DocPath ADR',
  '',
  '> 每条 decision 使用轻量 ADR 模板记录，便于长期检索、审查和上下文披露。',
  '',
  '---',
  '',
].join('\n');

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
