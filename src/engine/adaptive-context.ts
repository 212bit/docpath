import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir, readFileSafe } from '../utils/file.js';
import { readCurrentState, type CurrentState } from '../utils/workspace.js';
import { readRecentBreadcrumbEntries } from '../engine/breadcrumb.js';
import {
  readStructuredSpecDocument,
  readStructuredTaskDocument,
  parseSpecMarkdownDocument,
  type StructuredSpecDocument,
  type StructuredPlanDocument,
} from '../utils/structured-docs.js';
import { currentTaskDir, canonicalTaskDir, readActiveTaskFile } from '../utils/task-files.js';
import { resolveRulePaths, readRuleFile, compactRuleContent } from '../utils/rules.js';
import { estimateTokens } from '../utils/document-index.js';
import { getTopicRelevantDecisions } from '../governance/decisions.js';
import { getModifiedFiles } from '../utils/semantic-verify.js';

export interface ContextTier {
  tier: number;
  name: string;
  priority: number;
  required: boolean;
  summary: string;
  content: string;
  rawTokens: number;
  actualTokens: number;
}

export interface AdaptiveContextOptions {
  cwd: string;
  maxTokens?: number;
  smart?: boolean;
  topic?: string;
  taskId?: string;
  withSpec?: boolean;
  withPlan?: boolean;
  includeArchive?: boolean;
}

export interface AdaptiveContextReport {
  task_id: string | null;
  task_title: string;
  phase: string;
  max_tokens_budget: number;
  total_tokens: number;
  raw_tokens_estimate: number;
  compression_ratio: number;
  tiers: ContextTier[];
  markdown: string;
}

/**
 * 提取关键词集合
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return Array.from(new Set(words));
}

/**
 * 构建 Tier 1: 核心契约 (Spec & Decision Brief)
 */
function buildTier1Spec(
  spec: StructuredSpecDocument | null,
  state: CurrentState | null,
  budget: number,
): { content: string; rawTokens: number; actualTokens: number } {
  if (!spec && !state?.task_id) {
    const fallback = '# 工作流状态: 闲置 (Idle)\n- 当前无活跃任务。可使用 `docpath start <id/title>` 拉起新任务。\n';
    const tokens = estimateTokens(fallback);
    return { content: fallback, rawTokens: tokens, actualTokens: tokens };
  }

  const title = spec?.title || state?.task_title || state?.task_id || '当前任务';
  const taskId = spec?.task_id || state?.task_id || 'unknown';
  const phase = state?.phase || 'executing';
  const currentStep = state?.current_step || '未指定';

  const lines: string[] = [
    `# 任务核心契约: ${title}`,
    `- task_id: ${taskId}`,
    `- phase: ${phase}`,
    `- current_step: ${currentStep}`,
  ];

  if (spec?.backlog_id) {
    lines.push(`- backlog_id: ${spec.backlog_id}`);
  }

  // 功能需求
  if (spec?.functional_requirements && spec.functional_requirements.length > 0) {
    lines.push('\n### 功能需求 (FR)');
    for (const fr of spec.functional_requirements) {
      lines.push(`- [${fr.done ? 'x' : ' '}] **${fr.id}**: ${fr.text}`);
    }
  }

  // 验收标准
  if (spec?.acceptance_criteria && spec.acceptance_criteria.length > 0) {
    lines.push('\n### 验收标准 (AC)');
    for (const ac of spec.acceptance_criteria) {
      lines.push(`- [${ac.done ? 'x' : ' '}] **${ac.id}**: ${ac.text}`);
    }
  }

  // Decision Brief
  if (spec?.decision_brief) {
    lines.push('\n### 架构决策简报 (Decision Brief)');
    if (typeof spec.decision_brief === 'string') {
      lines.push(spec.decision_brief.trim());
    } else {
      lines.push(`- 问题: ${spec.decision_brief.problem}`);
      lines.push(`- 方案: ${spec.decision_brief.chosen}`);
      lines.push(`- 理由: ${spec.decision_brief.rationale}`);
    }
  }

  const rawContent = lines.join('\n') + '\n';
  const rawTokens = estimateTokens(rawContent);

  return {
    content: rawContent,
    rawTokens,
    actualTokens: rawTokens,
  };
}

/**
 * 构建 Tier 2: 步骤焦点计划 (Active Step Plan & Folded History)
 */
function buildTier2Plan(
  planDoc: StructuredPlanDocument | null,
  state: CurrentState | null,
  budgetRatio: number,
): { content: string; rawTokens: number; actualTokens: number } {
  if (!planDoc || !planDoc.steps || planDoc.steps.length === 0) {
    return { content: '', rawTokens: 0, actualTokens: 0 };
  }

  const currentStepId = state?.current_step?.match(/^(S\d+)\b/)?.[1] ||
    planDoc.steps.find((s) => s.status === 'pending' || s.status === 'blocked')?.id ||
    '';

  const lines: string[] = ['\n# 执行计划焦点 (Step Execution Focus)'];

  let doneCount = 0;
  const doneSummary: string[] = [];

  for (const step of planDoc.steps) {
    const isDone = step.status === 'done';
    const isCurrent = step.id === currentStepId;

    if (isDone) {
      doneCount++;
      doneSummary.push(`- ✅ ${step.id}: ${step.name}`);
      continue;
    }

    if (isCurrent) {
      lines.push(`\n## ⚡ 当前焦点步骤: ${step.id} — ${step.name} [${step.status.toUpperCase()}]`);
      lines.push(`- 描述: ${step.description}`);
      lines.push(`- 验收: ${step.acceptance}`);
      if (step.dependencies) {
        lines.push(`- 依赖: ${step.dependencies}`);
      }
    } else {
      // 后续 pending 步骤紧凑输出
      lines.push(`- ⬜ ${step.id}: ${step.name} (${step.description.slice(0, 60)}...)`);
    }
  }

  // 折叠已完成历史
  if (doneSummary.length > 0) {
    if (budgetRatio < 0.4 || doneSummary.length > 4) {
      lines.unshift(`- 📦 已完成历史步骤: ${doneCount} 步全部通过 (${doneSummary.map((s) => s.split(':')[0].replace(/^- /, '')).join(', ')})`);
    } else {
      lines.unshift('### 已完成步骤\n' + doneSummary.join('\n'));
    }
  }

  const content = lines.join('\n') + '\n';
  const rawTokens = estimateTokens(content);

  return {
    content,
    rawTokens,
    actualTokens: rawTokens,
  };
}

/**
 * 构建 Tier 3: 面包屑最新时序 (Recent Breadcrumbs)
 */
async function buildTier3Breadcrumbs(
  cwd: string,
  taskId: string,
  maxEntries: number,
): Promise<{ content: string; rawTokens: number; actualTokens: number }> {
  const entries = await readRecentBreadcrumbEntries(cwd, 20);
  const taskEntries = entries.filter((e) => !e.taskId || e.taskId === taskId);

  if (taskEntries.length === 0) {
    return { content: '', rawTokens: 0, actualTokens: 0 };
  }

  const selected = taskEntries.slice(-maxEntries);
  const lines: string[] = ['\n# 最近执行时序 (Recent Breadcrumbs)'];

  if (taskEntries.length > selected.length) {
    lines.push(`> 早期 ${taskEntries.length - selected.length} 条操作记录已自动折叠`);
  }

  for (const e of selected) {
    const icon = e.status === 'done' ? '✅' : e.status === 'blocked' ? '❌' : '🔄';
    lines.push(`- ${icon} [${e.step}] ${e.status}: ${e.context || ''}`);
  }

  const content = lines.join('\n') + '\n';
  const rawTokens = estimateTokens(content);

  return {
    content,
    rawTokens,
    actualTokens: rawTokens,
  };
}

/**
 * 构建 Tier 4: 精准规则匹配与剪裁 (Targeted Rules)
 */
async function buildTier4Rules(
  docpathDir: string,
  specKeywords: string[],
  modifiedFiles: string[],
  availableTokens: number,
): Promise<{ content: string; rawTokens: number; actualTokens: number }> {
  if (availableTokens <= 100) {
    return { content: '', rawTokens: 0, actualTokens: 0 };
  }

  const rulePaths = resolveRulePaths(docpathDir);
  const ruleSnippets: Array<{ name: string; text: string; tokens: number }> = [];

  for (const rule of rulePaths.allRules) {
    if (!rule.exists) continue;
    const { content } = await readRuleFile(docpathDir, rule.name);
    if (!content.trim()) continue;

    const compacted = compactRuleContent(content);
    const lines = compacted.split('\n');
    const matchedBlocks: string[] = [];

    let currentBlock: string[] = [];
    let isMatching = false;

    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        if (isMatching && currentBlock.length > 0) {
          matchedBlocks.push(currentBlock.join('\n'));
        }
        currentBlock = [line];
        const lowerLine = line.toLowerCase();
        isMatching = specKeywords.some((kw) => lowerLine.includes(kw)) ||
          rule.name === 'style' ||
          modifiedFiles.some((f) => lowerLine.includes(f.split('/')[0]));
      } else {
        currentBlock.push(line);
      }
    }

    if (isMatching && currentBlock.length > 0) {
      matchedBlocks.push(currentBlock.join('\n'));
    }

    const ruleText = matchedBlocks.length > 0 ? matchedBlocks.join('\n\n') : '';
    if (ruleText.trim()) {
      ruleSnippets.push({
        name: rule.name,
        text: ruleText,
        tokens: estimateTokens(ruleText),
      });
    }
  }

  let usedTokens = 0;
  const outputLines: string[] = ['\n# 精准规约与硬约束 (Targeted Rules)'];

  for (const r of ruleSnippets) {
    if (usedTokens + r.tokens <= availableTokens) {
      outputLines.push(`\n### 规则: ${r.name}\n${r.text}`);
      usedTokens += r.tokens;
    } else {
      // 超出时仅保留标题与核心期望
      const firstLines = r.text.split('\n').slice(0, 5).join('\n');
      outputLines.push(`\n### 规则: ${r.name} (精简)\n${firstLines}\n...`);
      usedTokens += estimateTokens(firstLines);
      break;
    }
  }

  const content = outputLines.length > 1 ? outputLines.join('\n') + '\n' : '';
  const actualTokens = estimateTokens(content);

  return {
    content,
    rawTokens: ruleSnippets.reduce((acc, r) => acc + r.tokens, 0),
    actualTokens,
  };
}

/**
 * 自适应 Token 预算智能分层压缩核心引擎
 */
export async function buildAdaptiveContext(options: AdaptiveContextOptions): Promise<AdaptiveContextReport> {
  const {
    cwd,
    maxTokens = 4000,
    withSpec = true,
    withPlan = true,
  } = options;

  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || options.taskId || null;
  const taskTitle = state?.task_title || (taskId ? `Task ${taskId}` : '当前工作区');
  const phase = state?.phase || 'idle';

  const modifiedFiles = getModifiedFiles(cwd);

  // 1. 读取 Spec 与 Plan 结构化文档
  let spec: StructuredSpecDocument | null = null;
  let planDoc: StructuredPlanDocument | null = null;

  if (taskId) {
    spec =
      (await readStructuredSpecDocument(canonicalTaskDir(docpathDir, taskId))) ||
      (await readStructuredSpecDocument(currentTaskDir(docpathDir)));

    if (!spec) {
      const specMd = (await readActiveTaskFile(docpathDir, taskId, 'spec.md')) || '';
      if (specMd.trim()) {
        spec = parseSpecMarkdownDocument(specMd, { taskId });
      }
    }

    planDoc = (await readStructuredTaskDocument(canonicalTaskDir(docpathDir, taskId), 'plan.md') as StructuredPlanDocument) ||
      (await readStructuredTaskDocument(currentTaskDir(docpathDir), 'plan.md') as StructuredPlanDocument);
  }

  const specText = [
    spec?.title || '',
    ...(spec?.functional_requirements || []).map((f) => f.text),
    ...(spec?.acceptance_criteria || []).map((a) => a.text),
  ].join(' ');
  const specKeywords = extractKeywords(specText);

  const tiers: ContextTier[] = [];

  // Tier 1: 核心契约 (权重 100%, 必须保留)
  const tier1 = withSpec ? buildTier1Spec(spec, state, maxTokens) : { content: '', rawTokens: 0, actualTokens: 0 };
  if (tier1.content) {
    tiers.push({
      tier: 1,
      name: 'core_contract',
      priority: 100,
      required: true,
      summary: '任务核心需求、验收标准与架构决策',
      content: tier1.content,
      rawTokens: tier1.rawTokens,
      actualTokens: tier1.actualTokens,
    });
  }

  let remainingTokens = Math.max(0, maxTokens - tier1.actualTokens);

  // Tier 2: 步骤焦点与已完成折叠 (权重 95%)
  const tier2 = withPlan ? buildTier2Plan(planDoc, state, remainingTokens / maxTokens) : { content: '', rawTokens: 0, actualTokens: 0 };
  if (tier2.content) {
    tiers.push({
      tier: 2,
      name: 'active_step_plan',
      priority: 95,
      required: true,
      summary: '当前活跃步骤执行细节与已完成折叠清单',
      content: tier2.content,
      rawTokens: tier2.rawTokens,
      actualTokens: tier2.actualTokens,
    });
    remainingTokens = Math.max(0, remainingTokens - tier2.actualTokens);
  }

  // Tier 3: 面包屑最新时序 (权重 80%)
  const maxBreadcrumbs = maxTokens < 2000 ? 3 : maxTokens < 5000 ? 5 : 10;
  const tier3 = taskId ? await buildTier3Breadcrumbs(cwd, taskId, maxBreadcrumbs) : { content: '', rawTokens: 0, actualTokens: 0 };
  if (tier3.content) {
    tiers.push({
      tier: 3,
      name: 'recent_breadcrumbs',
      priority: 80,
      required: false,
      summary: `最近 ${maxBreadcrumbs} 条执行面包屑时序`,
      content: tier3.content,
      rawTokens: tier3.rawTokens,
      actualTokens: tier3.actualTokens,
    });
    remainingTokens = Math.max(0, remainingTokens - tier3.actualTokens);
  }

  // Tier 4: 精准规则剪裁 (权重 70%)
  const tier4 = await buildTier4Rules(docpathDir, specKeywords, modifiedFiles, remainingTokens);
  if (tier4.content) {
    tiers.push({
      tier: 4,
      name: 'targeted_rules',
      priority: 70,
      required: false,
      summary: '命中当前任务特征与领域的硬规则约束',
      content: tier4.content,
      rawTokens: tier4.rawTokens,
      actualTokens: tier4.actualTokens,
    });
    remainingTokens = Math.max(0, remainingTokens - tier4.actualTokens);
  }

  // Tier 5: 关联 ADR 决策 (权重 60%)
  if (remainingTokens > 200 && specKeywords.length > 0) {
    const topTopic = specKeywords[0];
    const adrDecisions = await getTopicRelevantDecisions(cwd, topTopic, 1);
    if (adrDecisions.length > 0) {
      const adrContent = `\n# 关联架构决策 (Relevant ADR)\n${adrDecisions[0]}\n`;
      const adrTokens = estimateTokens(adrContent);
      if (adrTokens <= remainingTokens) {
        tiers.push({
          tier: 5,
          name: 'relevant_adrs',
          priority: 60,
          required: false,
          summary: `命中主题 "${topTopic}" 的 ADR 决策条目`,
          content: adrContent,
          rawTokens: adrTokens,
          actualTokens: adrTokens,
        });
      }
    }
  }

  const rawTokensTotal = tiers.reduce((acc, t) => acc + t.rawTokens, 0);
  const actualTokensTotal = tiers.reduce((acc, t) => acc + t.actualTokens, 0);
  const compressionRatio = rawTokensTotal > 0 ? (actualTokensTotal / rawTokensTotal) : 1.0;

  const markdownHeader = [
    `# DocPath 自适应任务上下文 (Adaptive Context Package)`,
    `> task: ${taskId || 'none'} | phase: ${phase} | tokens: ~${actualTokensTotal}/${maxTokens} (压缩率: ${(compressionRatio * 100).toFixed(0)}%)`,
    '',
  ].join('\n');

  const markdown = `${markdownHeader}\n${tiers.map((t) => t.content.trim()).join('\n\n')}\n`;

  return {
    task_id: taskId,
    task_title: taskTitle,
    phase,
    max_tokens_budget: maxTokens,
    total_tokens: actualTokensTotal,
    raw_tokens_estimate: rawTokensTotal,
    compression_ratio: Number(compressionRatio.toFixed(2)),
    tiers,
    markdown,
  };
}
