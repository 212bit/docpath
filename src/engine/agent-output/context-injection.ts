/**
 * Context Injection 域（R-305 拆分自 formatters.ts, 零行为变更）：
 * spec 摘要 / 最近决策 / 当前焦点的加载与提取, 供 agent 输出注入。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AgentFocusContext, AgentOutputContext } from '../../types/agent-output.js';

// ── Context Injection 类型 ──

export interface DecisionEntry {
  id: string;
  taskId: string;
  category: string;
  conclusion: string;
  createdAt: string;
  relatedFiles?: string[];
  context?: string;
  score?: number;
}

export interface SpecSummary {
  title: string;
  requirements: string[];
}

export interface LoadDecisionsOptions {
  count?: number;
  queryKeywords?: string[];
  files?: string[];
  strictRelevance?: boolean;
  compact?: boolean;
}

/**
 * 将 ADR 决策记录浓缩为 Agent 高度可执行的行动红线（Active Guardrails）。
 * 过滤掉 task_id、created_at 时间戳等元数据噪音，提炼出清晰的行动指令。
 */
export function formatActiveGuardrails(decisions: DecisionEntry[]): string[] {
  if (!decisions || decisions.length === 0) return [];
  return decisions.map((d) => {
    let raw = (d.conclusion || '').trim();
    if (!raw) return `${d.id}: (无详细结论)`;

    // 清理常见前缀
    raw = raw.replace(/^-\s*决策理由:\s*/, '').trim();

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
 * 彻底过滤掉内部门禁风险升级、单次参数记录和无意义模板占位符。
 */
export function isSubstantiveDecision(d: { category?: string; decision?: string; context?: string }): boolean {
  if (!d.decision || typeof d.decision !== 'string') return false;
  const raw = d.decision.trim();
  if (raw.length < 6) return false;
  if (/^(?:方案\s*[A-Z]|跳过\s*(?:check|review|tests?))$/i.test(raw)) return false;
  if (/^(?:待补充|无|暂无|none|n\/a|tbd)$/i.test(raw)) return false;
  if (d.category && TRANSIENT_CATEGORIES.has(d.category)) return false;
  if (d.category && (d.category.startsWith('risk.') || d.category.startsWith('policy.'))) return false;
  // 过滤无实质约束的通用模板占位符
  if (raw.includes('满足 backlog 声明的全部验收条件') && raw.includes('无额外依赖风险')) return false;
  if (raw.startsWith('- 决策理由: 满足 backlog 声明的全部验收条件')) return false;
  return true;
}

// ── 语义域映射 ──
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  git: ['git', 'commit', 'branch', 'stash', 'staging', 'worktree'],
  check: ['check', 'gate', 'review', 'quality', 'exempt', 'linter', 'pom.xml'],
  test: ['pytest', 'cargo test', 'jest', 'vitest', 'unit-test', 'monorepo'],
  backlog: ['backlog', 'requirement', 'promote', 'rfp'],
  task: ['task', 'switch', 'reset', 'abort', 'drift'],
  rules: ['rule', 'architecture', 'style', 'guardrail'],
};

function scoreDecisionRelevance(
  decision: DecisionEntry,
  keywords: string[],
  files: string[],
): number {
  let score = 0;
  const decisionText = `${decision.id} ${decision.taskId} ${decision.category} ${decision.conclusion} ${decision.context || ''}`.toLowerCase();
  const decisionFiles = (decision.relatedFiles || []).map((f) => f.toLowerCase());

  // 1. 关键词直接匹配
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k || k.length < 2) continue;
    if (decisionText.includes(k)) {
      score += 2.0;
    }
  }

  // 2. 文件与模块关联度匹配
  if (files.length > 0) {
    for (const f of files) {
      const lowerFile = f.toLowerCase();
      // 精确文件命中
      if (decisionFiles.some((df) => df.includes(lowerFile) || lowerFile.includes(df))) {
        score += 5.0;
      }
      // 模块/路径词根命中（如 git-staging, check, worktree, pom.xml）
      const basename = lowerFile.split('/').pop()?.toLowerCase() || '';
      const baseStem = basename.replace(/\.[a-z0-9]+$/i, '');
      if (basename.length >= 4 && decisionText.includes(basename)) {
        score += 4.0;
      } else if (baseStem.length >= 4 && decisionText.includes(baseStem)) {
        score += 2.5;
      }
    }
  }

  // 3. 语义域精准匹配
  for (const [domain, domainWords] of Object.entries(DOMAIN_KEYWORDS)) {
    const queryMatchesDomain = domainWords.some((w) =>
      keywords.some((kw) => kw.toLowerCase() === w || kw.toLowerCase().includes(w))
    );
    if (queryMatchesDomain) {
      const decisionMatchesDomain = domainWords.some((w) => decisionText.includes(w));
      if (decisionMatchesDomain) {
        score += 1.5;
      }
    }
  }

  return score;
}

// ── Context Injection 加载函数 ──

const DECISIONS_MAX_LINES = 50;
const DECISIONS_RECENT_COUNT = 2;

/**
 * 从 decisions.jsonl 读取与当前上下文相关或最近的 N 条决策记录。
 * 支持多维相关性打分（关键词、文件关联、领域同义词）与动态剪裁。
 */
export async function loadRecentDecisions(
  docpathDir: string,
  countOrOptions: number | LoadDecisionsOptions = DECISIONS_RECENT_COUNT,
  queryKeywords?: string[],
  files?: string[],
): Promise<DecisionEntry[]> {
  const options: LoadDecisionsOptions = typeof countOrOptions === 'number'
    ? { count: countOrOptions, queryKeywords, files }
    : { ...countOrOptions };

  const count = options.count ?? DECISIONS_RECENT_COUNT;
  const keywords = options.queryKeywords || [];
  const targetFiles = options.files || [];
  const strictRelevance = options.strictRelevance ?? false;

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
            relatedFiles: Array.isArray(parsed.relatedFiles) ? parsed.relatedFiles : [],
            context: parsed.context || '',
          });
        }
      } catch {
        // skip malformed lines
      }
    }

    const hasQuery = (keywords.length > 0) || (targetFiles.length > 0);

    if (!hasQuery) {
      return allDecisions.slice(-count);
    }

    // 计算各决策的相关性打分
    const scored = allDecisions.map((d, index) => {
      const score = scoreDecisionRelevance(d, keywords, targetFiles);
      return { decision: { ...d, score }, score, index };
    });

    const matched = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.index - a.index)
      .map((s) => s.decision);

    if (strictRelevance) {
      // 严格相关模式：只返回得分大于 0 的相关决策，绝不强行补充不相干的旧 ADR 噪音
      return matched.slice(0, count);
    }

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
  context: AgentFocusContext,
): { phase: string; detail: string } | null {
  const planTasks = context.planTasks || [];
  if (phase === 'executing') {
    const openStep = planTasks.find(task => !task.done);
    if (openStep) {
      return {
        phase: 'executing',
        detail: `当前步骤: ${openStep.id} - ${openStep.title}\n进度: ${planTasks.filter(t => t.done).length}/${planTasks.length} 完成`,
      };
    }
    if (planTasks.length > 0) {
      return {
        phase: 'executing',
        detail: `所有计划步骤已完成 (${planTasks.length}/${planTasks.length})\n建议运行 check 门禁`,
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
    if (context.lessonSummary && context.lessonSummary.pendingCount > 0) {
      const pendingKeys = context.lessonSummary.pendingKeys || [];
      return {
        phase: 'completed',
        detail: `待归档 lesson: ${context.lessonSummary.pendingCount} 条\nKeys: ${pendingKeys.slice(0, 3).join(', ')}${pendingKeys.length > 3 ? '...' : ''}`,
      };
    }
    return {
      phase: 'completed',
      detail: `任务已完成\n计划: ${planTasks.filter(t => t.done).length}/${planTasks.length} 完成\n门禁: ${gate}`,
    };
  }

  return null;
}
