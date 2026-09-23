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

/**
 * 将 ADR 决策记录浓缩为 Agent 高度可执行的行动红线（Active Guardrails）。
 * 过滤掉 task_id、created_at 时间戳等元数据噪音，提炼出清晰的行动指令。
 */
export function formatActiveGuardrails(decisions: DecisionEntry[]): string[] {
  if (!decisions || decisions.length === 0) return [];
  return decisions.map((d) => {
    const raw = (d.conclusion || '').trim();
    if (!raw) return `${d.id}: (无详细结论)`;

    // 如果已经包含指示标签
    if (/^[【\[].+[】\]]/.test(raw)) {
      return raw.includes(d.id) ? raw : `${raw} (${d.id})`;
    }

    // 智能提取意图（必须/强制优先于目标从句中的避免）
    if (/(?:必须|强制|务必)/.test(raw)) {
      return `【必须】${raw} (${d.id})`;
    }
    if (/(?:严禁|禁止|不得|严防)/.test(raw) || /^避免/.test(raw)) {
      return `【严禁】${raw} (${d.id})`;
    }
    if (d.category && d.category !== 'general') {
      const catLabel = d.category.replace(/^risk\./, '风险:').replace(/^arch\./, '架构:');
      return `【${catLabel}】${raw} (${d.id})`;
    }
    return `【规范】${raw} (${d.id})`;
  });
}

const TRANSIENT_CATEGORIES = new Set([
  'risk.escalation',
  'policy.skip',
  'policy.env_exempt',
  'audit',
  'transient',
]);

/**
 * 判断一条决策是否属于具备长效指引价值的「实质性架构/设计决策」。
 * 彻底过滤掉内部门禁风险升级（如 check 风险复评升级 R1→R2）和单次参数记录（如 跳过 review、方案 B）。
 */
export function isSubstantiveDecision(d: { category?: string; decision?: string }): boolean {
  if (!d.decision || typeof d.decision !== 'string') return false;
  const raw = d.decision.trim();
  if (raw.length < 6) return false;
  if (/^(?:方案\s*[A-Z]|跳过\s*(?:check|review|tests?))$/i.test(raw)) return false;
  if (d.category && TRANSIENT_CATEGORIES.has(d.category)) return false;
  if (d.category && (d.category.startsWith('risk.') || d.category.startsWith('policy.'))) return false;
  return true;
}

// ── Context Injection 加载函数 ──

const DECISIONS_MAX_LINES = 50;
const DECISIONS_RECENT_COUNT = 2;

/**
 * 从 decisions.jsonl 读取与当前上下文相关或最近的 N 条决策记录。
 * 文件按追加顺序写入，尾部是最新记录。若提供 queryKeywords 则按相关性优先排序。
 */
export async function loadRecentDecisions(
  docpathDir: string,
  count: number = DECISIONS_RECENT_COUNT,
  queryKeywords?: string[],
): Promise<DecisionEntry[]> {
  const jsonlPath = join(docpathDir, 'workspace', 'decisions.jsonl');
  if (!existsSync(jsonlPath)) return [];

  try {
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const tail = lines.slice(-Math.min(lines.length, DECISIONS_MAX_LINES));
    const allDecisions: DecisionEntry[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.kind === 'decision' && parsed.id && isSubstantiveDecision(parsed)) {
          allDecisions.push({
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

    if (!queryKeywords || queryKeywords.length === 0) {
      return allDecisions.slice(-count);
    }

    const lowerKeywords = queryKeywords
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length > 1);

    if (lowerKeywords.length === 0) {
      return allDecisions.slice(-count);
    }

    // 计算相关性得分
    const scored = allDecisions.map((d, index) => {
      const targetText = `${d.id} ${d.taskId} ${d.category} ${d.conclusion}`.toLowerCase();
      let matchCount = 0;
      for (const kw of lowerKeywords) {
        if (targetText.includes(kw)) {
          matchCount++;
        }
      }
      return { decision: d, score: matchCount, index };
    });

    const matched = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.index - a.index)
      .map((s) => s.decision);

    const result: DecisionEntry[] = [...matched.slice(0, count)];
    if (result.length < count) {
      const addedIds = new Set(result.map((r) => r.id));
      for (let i = allDecisions.length - 1; i >= 0 && result.length < count; i--) {
        if (!addedIds.has(allDecisions[i].id)) {
          result.push(allDecisions[i]);
          addedIds.add(allDecisions[i].id);
        }
      }
    }

    return result;
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
