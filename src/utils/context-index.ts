import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveDocpathDir } from './file.js';
import { readCurrentState, readOptionalFile } from './workspace.js';
import { resolveActiveTaskDocPath } from './task-files.js';
import { parsePlanSteps } from './doc-parser.js';
import { readDeliverableIndexSummary } from './deliverables.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';

export interface HybridContextIndexEntry {
  id: string;
  label: string;
  path: string;
  summary: string;
}

export interface HybridContextIndex {
  version: 1;
  task_id: string;
  task_title: string;
  generated_at: string;
  trunk: HybridContextIndexEntry[];
  leaves: HybridContextIndexEntry[];
}

export interface HybridContextIndexSummary {
  available: boolean;
  path: string;
  trunk_count: number;
  leaf_count: number;
  generated_at: string | null;
}

const CONTEXT_INDEX_RELATIVE_PATH = '.docpath/tasks/current/context-index.json';

function compactLine(value: string, fallback: string): string {
  const line = value
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  return (line || fallback).slice(0, 180);
}

function compactMultiLine(value: string, fallback: string, maxChars: number = 500): string {
  // 提取前 N 行非空文本,拼接成一段,限制总长度
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith('#')) return false; // 过滤标题
      if (line.startsWith('---')) return false; // 过滤分隔符
      if (line.startsWith('>')) return false; // 过滤 frontmatter/引用块
      if (line.match(/^[-*]\s*\[/)) return false; // 过滤 checklist
      return true;
    });

  if (lines.length === 0) return fallback;

  let result = '';
  for (const line of lines) {
    if (result.length + line.length > maxChars) break;
    result += (result ? ' ' : '') + line;
  }

  return result || fallback;
}

function sectionSummary(content: string, headingPattern: RegExp, fallback: string): string {
  const match = headingPattern.exec(content);
  if (!match) {
    // 找不到章节,返回 fallback (不要从头提取整个 spec!)
    return fallback;
  }
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const endMatch = rest.match(/\n##\s+/);
  const body = endMatch ? rest.slice(0, endMatch.index) : rest;
  const extracted = compactMultiLine(body, '', 400);
  return extracted || fallback;
}

function extractGoal(specContent: string, taskTitle: string): string {
  // 尝试多种模式: "## 目标" / "## 1. 背景与动机" / "## 背景"
  const patterns = [
    /^##\s*目标\s*$/m,
    /^##\s*\d+\.\s*背景与动机\s*$/m,
    /^##\s*背景\s*$/m,
  ];
  for (const pattern of patterns) {
    const summary = sectionSummary(specContent, pattern, '');
    if (summary && summary.length > 20) return summary;
  }
  return taskTitle || '未提取目标';
}

function extractScope(specContent: string): string {
  // 尝试多种模式: "## 范围" / "## 3. 范围界定"
  const patterns = [
    /^##\s*范围\s*$/m,
    /^##\s*\d+\.\s*范围界定\s*$/m,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(specContent);
    if (!match) continue;

    const start = match.index + match[0].length;
    const rest = specContent.slice(start);
    const endMatch = rest.match(/\n##\s+/);
    const sectionBody = endMatch ? rest.slice(0, endMatch.index) : rest;

    // 先尝试从 section body 里找 "### 包含" 子章节
    const includeMatch = /^###\s*包含\s*$/m.exec(sectionBody);
    if (includeMatch) {
      const subStart = includeMatch.index + includeMatch[0].length;
      const subRest = sectionBody.slice(subStart);
      const subEndMatch = subRest.match(/\n###\s+/);
      const includeBody = subEndMatch ? subRest.slice(0, subEndMatch.index) : subRest;
      const extracted = compactMultiLine(includeBody, '', 400);
      if (extracted && extracted.length > 20) return `包含: ${extracted}`;
    }

    // 如果没有子章节,直接提取 section body
    const extracted = compactMultiLine(sectionBody, '', 400);
    if (extracted && extracted.length > 20) return extracted;
  }

  return '未提取范围';
}

function extractAcceptance(specContent: string): string {
  // 尝试多种模式: "## 验收" / "## 5. 验收标准"
  const patterns = [
    /^##\s*验收\s*$/m,
    /^##\s*\d+\.\s*验收标准\s*$/m,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(specContent);
    if (!match) continue;

    const start = match.index + match[0].length;
    const rest = specContent.slice(start);
    const endMatch = rest.match(/\n##\s+/);
    const body = endMatch ? rest.slice(0, endMatch.index) : rest;

    // 对于验收标准,提取 checklist 项(忽略过滤规则)
    const lines = body
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        if (line.startsWith('##')) return false;
        return true; // 保留所有内容,包括 checklist
      });

    if (lines.length === 0) continue;

    let result = '';
    let count = 0;
    for (const line of lines) {
      if (result.length + line.length > 400) break;
      if (count >= 5) break; // 最多5条验收标准
      result += (result ? ' ' : '') + line;
      count++;
    }

    if (result && result.length > 20) return result;
  }

  return '未提取验收标准';
}

function summarizePlan(planContent: string): string {
  const steps = parsePlanSteps(planContent);
  if (steps.length === 0) return '未找到可解析执行计划';
  const done = steps.filter((step) => step.done).length;
  const open = steps.find((step) => !step.done);
  return open
    ? `${done}/${steps.length} 完成；下一步 ${open.id}: ${open.name}`
    : `${done}/${steps.length} 完成；计划步骤已全部完成`;
}

function summarizeEvidence(content: string, fallback: string): string {
  if (!content.trim()) return fallback;
  const result = content.match(/^\*\*(?:结果|状态)\*\*:\s*(.+)$/m)?.[1]?.trim();
  const time = content.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim();
  return [result, time].filter(Boolean).join(' · ') || compactLine(content, fallback);
}

export async function getHybridContextIndexPath(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  return join(docpathDir, 'tasks', 'current', 'context-index.json');
}

export async function buildHybridContextIndex(cwd: string): Promise<HybridContextIndex> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || 'unknown';
  const specPath = resolveActiveTaskDocPath(docpathDir, taskId, 'spec.md');
  const planPath = resolveActiveTaskDocPath(docpathDir, taskId, 'plan.md');
  const specContent = await readOptionalFile(specPath);
  const planContent = await readOptionalFile(planPath);
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const reviewContent = await readOptionalFile(join(docpathDir, 'workspace', 'review.md'));
  const deliverables = await readDeliverableIndexSummary(cwd);
  const breadcrumb = await readBreadcrumb(cwd);
  const latest = breadcrumb.latest;

  return {
    version: 1,
    task_id: taskId,
    task_title: state?.task_title || '',
    generated_at: new Date().toISOString(),
    trunk: [
      {
        id: 'goal',
        label: '目标',
        path: '.docpath/tasks/current/spec.md',
        summary: extractGoal(specContent, state?.task_title || ''),
      },
      {
        id: 'scope',
        label: '范围',
        path: '.docpath/tasks/current/spec.md',
        summary: extractScope(specContent),
      },
      {
        id: 'acceptance',
        label: '验收',
        path: '.docpath/tasks/current/spec.md',
        summary: extractAcceptance(specContent),
      },
      {
        id: 'decision-brief',
        label: 'Decision Brief',
        path: '.docpath/tasks/current/spec.md',
        summary: sectionSummary(specContent, /^###\s*Decision Brief\s*$/m, '未记录 Decision Brief'),
      },
    ],
    leaves: [
      {
        id: 'plan',
        label: '执行计划',
        path: '.docpath/tasks/current/plan.md',
        summary: summarizePlan(planContent),
      },
      {
        id: 'last-check',
        label: '最近检查',
        path: '.docpath/workspace/last-check.md',
        summary: summarizeEvidence(lastCheckContent, '未找到 last-check 证据'),
      },
      {
        id: 'review',
        label: '最近审查',
        path: '.docpath/workspace/review.md',
        summary: summarizeEvidence(reviewContent, '未找到 review 证据'),
      },
      {
        id: 'breadcrumb',
        label: '最近事件',
        path: '.docpath/workspace/breadcrumb.md',
        summary: latest ? `${latest.step}: ${latest.context || latest.status}` : '未找到 breadcrumb 事件',
      },
      {
        id: 'deliverables',
        label: '交付物索引',
        path: deliverables?.path || '.docpath/tasks/current/deliverables.json',
        summary: deliverables ? `${deliverables.count} 个 deliverables 已登记` : '未登记 deliverables',
      },
    ],
  };
}

export async function writeHybridContextIndex(cwd: string): Promise<HybridContextIndex> {
  const index = await buildHybridContextIndex(cwd);
  const outputPath = await getHybridContextIndexPath(cwd);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
  return index;
}

export async function readHybridContextIndexSummary(cwd: string): Promise<HybridContextIndexSummary | null> {
  const outputPath = await getHybridContextIndexPath(cwd);
  if (!existsSync(outputPath)) return null;
  const raw = await readFile(outputPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<HybridContextIndex>;
  if (parsed.version !== 1 || !Array.isArray(parsed.trunk) || !Array.isArray(parsed.leaves)) {
    throw new Error(`Invalid Hybrid Context Index: ${CONTEXT_INDEX_RELATIVE_PATH}`);
  }
  return {
    available: true,
    path: CONTEXT_INDEX_RELATIVE_PATH,
    trunk_count: parsed.trunk.length,
    leaf_count: parsed.leaves.length,
    generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
  };
}

export async function readHybridContextIndexTrunk(cwd: string): Promise<HybridContextIndexEntry[] | null> {
  const outputPath = await getHybridContextIndexPath(cwd);
  if (!existsSync(outputPath)) return null;
  const raw = await readFile(outputPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<HybridContextIndex>;
  if (parsed.version !== 1 || !Array.isArray(parsed.trunk)) return null;
  return parsed.trunk;
}
