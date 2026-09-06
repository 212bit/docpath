/**
 * Context Injection 域（R-305 拆分自 formatters.ts, 零行为变更）：
 * spec 摘要 / 最近决策 / 当前焦点的加载与提取, 供 agent 输出注入。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AgentOutputContext } from './formatters.js';

// ── Context Injection 类型 ──

export interface DecisionEntry {
  id: string;
  taskId: string;
  category: string;
  conclusion: string;
  createdAt: string;
}

export interface SpecSummary {
  title: string;
  requirements: string[];
}

// ── Context Injection 加载函数 ──

const DECISIONS_MAX_LINES = 20;
const DECISIONS_RECENT_COUNT = 2;

/**
 * 从 decisions.jsonl 读取最近 N 条决策记录。
 * 文件按追加顺序写入，尾部是最新记录。
 */
export async function loadRecentDecisions(docpathDir: string, count: number = DECISIONS_RECENT_COUNT): Promise<DecisionEntry[]> {
  const jsonlPath = join(docpathDir, 'workspace', 'decisions.jsonl');
  if (!existsSync(jsonlPath)) return [];

  try {
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const tail = lines.slice(-Math.min(lines.length, DECISIONS_MAX_LINES));
    const decisions: DecisionEntry[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.kind === 'decision' && parsed.id) {
          decisions.push({
            id: parsed.id,
            taskId: parsed.taskId || '',
            category: parsed.category || '',
            conclusion: parsed.decision || '',
            createdAt: parsed.createdAt || '',
          });
        }
      } catch {
        // skip malformed lines
      }
    }
    return decisions.slice(-count);
  } catch {
    return [];
  }
}

/**
 * 从 spec.md 提取 title 和功能需求列表。
 * 解析第一行 H1 为 title，匹配 `- [ ] FR-\d+:.*` 为需求。
 */
export function extractSpecSummary(specContent: string): SpecSummary | null {
  if (!specContent || !specContent.trim()) return null;

  const lines = specContent.split('\n');
  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : '';

  const frPattern = /^- \[ \] FR-\d+:(.*)/;
  const requirements: string[] = [];
  for (const line of lines) {
    const match = line.match(frPattern);
    if (match) {
      requirements.push(match[1].trim());
      if (requirements.length >= 5) break;
    }
  }

  if (!title && requirements.length === 0) return null;

  return { title, requirements };
}

export function selectCurrentFocus(
  phase: string,
  gate: string,
  context: AgentOutputContext,
): { phase: string; detail: string } | null {
  if (phase === 'executing') {
    const openStep = context.planTasks.find(task => !task.done);
    if (openStep) {
      return {
        phase: 'executing',
        detail: `当前步骤: ${openStep.id} - ${openStep.title}\n进度: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成`,
      };
    }
    if (context.planTasks.length > 0) {
      return {
        phase: 'executing',
        detail: `所有计划步骤已完成 (${context.planTasks.length}/${context.planTasks.length})\n建议运行 check 门禁`,
      };
    }
  }

  if (phase === 'checking') {
    if (context.lastCheckContent) {
      const lines = context.lastCheckContent.split('\n').slice(0, 15);
      return {
        phase: 'checking',
        detail: lines.join('\n'),
      };
    }
  }

  if (phase === 'completed') {
    if (context.lessonSummary.pendingCount > 0) {
      return {
        phase: 'completed',
        detail: `待归档 lesson: ${context.lessonSummary.pendingCount} 条\nKeys: ${context.lessonSummary.pendingKeys.slice(0, 3).join(', ')}${context.lessonSummary.pendingKeys.length > 3 ? '...' : ''}`,
      };
    }
    return {
      phase: 'completed',
      detail: `任务已完成\n计划: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成\n门禁: ${gate}`,
    };
  }

  return null;
}
