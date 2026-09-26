/**
 * smart-context.ts — 智能上下文与规则精准投喂引擎
 *
 * 核心职能：
 * 1. 路径与领域亲和度分析 (Path-to-Domain Affinity): 基于当前修改文件自动识别相关规范与文档
 * 2. 需求语义关联 (Semantic Relevance): 提取 Spec/Plan 关键词，按需检索最相关的规则与 ADR
 * 3. 动态预算适配 (Budget-Adaptive Pruning): 在 Token 预算内按权重精准组装最小上下文包
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir, readFileSafe } from './file.js';
import { readCurrentState } from './workspace.js';
import { readActiveTaskFile } from './task-files.js';
import { resolveRulePaths, readRuleFile, compactRuleContent, type ResolvedRuleFile } from './rules.js';
import {
  readProjectDocumentIndex,
  resolveDocpathDocumentPath,
  estimateTokens,
  type ProjectDocumentIndexEntry,
} from './document-index.js';
import { getTopicRelevantDecisions } from './decisions.js';
import { getModifiedFiles } from './semantic-verify.js';
import { readStructuredSpecDocument, parseSpecMarkdownDocument, type StructuredSpecDocument } from './structured-docs.js';
import { currentTaskDir, canonicalTaskDir } from './task-files.js';

export interface SmartContextItem {
  id: string;
  type: 'rule' | 'doc' | 'decision' | 'spec' | 'plan';
  title: string;
  path: string;
  score: number;
  matchReasons: string[];
  tokenEstimate: number;
  content: string;
}

export interface SmartContextReport {
  taskId: string | null;
  taskTitle: string;
  totalEstimatedTokens: number;
  maxTokensBudget: number;
  items: SmartContextItem[];
  markdownBundle: string;
  modifiedFilesCount: number;
}

const DOMAIN_PATH_KEYWORDS: Record<string, string[]> = {
  security: ['auth', 'security', 'crypto', 'cert', 'token', 'jwt', 'permission', 'secret', 'rbac', 'oauth'],
  'api-contract': ['api', 'proto', 'route', 'controller', 'endpoint', 'graphql', 'rest', 'grpc', 'schema'],
  testing: ['test', 'spec', 'mock', 'fixture', 'e2e', '__tests__'],
  ui: ['ui', 'components', 'view', 'css', 'style', 'page', 'web', 'frontend', '.tsx', '.vue', '.svelte'],
  worktree: ['worktree', 'git', 'branch', 'agent', 'collab'],
  database: ['db', 'migration', 'model', 'sql', 'entity', 'repository', 'sqlite', 'postgres'],
  architecture: ['core', 'engine', 'utils', 'service', 'domain'],
};

/**
 * 提取关键词
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
 * 针对规则文件计算与当前任务/修改代码的亲和度得分
 */
function scoreRuleRelevance(
  rule: ResolvedRuleFile,
  ruleContent: string,
  modifiedFiles: string[],
  specKeywords: string[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const ruleName = rule.name.toLowerCase();

  // 1. 标准 baseline 权重
  if (ruleName === 'style') {
    score += 10;
    reasons.push('基础代码规范');
  }

  // 2. 基于修改文件路径特征匹配
  const domainKeys = DOMAIN_PATH_KEYWORDS[ruleName] || [ruleName];
  for (const file of modifiedFiles) {
    const lowerFile = file.toLowerCase();
    for (const key of domainKeys) {
      if (lowerFile.includes(key)) {
        score += 30;
        reasons.push(`修改文件命中领域关键词 "${key}": ${file}`);
        break;
      }
    }
  }

  // 3. 基于 Spec 需求关键词匹配
  const lowerContent = ruleContent.toLowerCase();
  for (const kw of specKeywords) {
    if (ruleName.includes(kw) || lowerContent.includes(kw)) {
      score += 15;
      reasons.push(`需求命中规则关键词 "${kw}"`);
    }
  }

  return { score, reasons };
}

/**
 * 构建智能裁剪的上下文包
 */
export async function buildSmartContext(cwd: string, maxTokens = 2500): Promise<SmartContextReport> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || null;
  const taskTitle = state?.task_title || (taskId ? `Task ${taskId}` : '当前任务');

  const modifiedFiles = getModifiedFiles(cwd);

  // 读取 Spec 获取关键词
  let spec: StructuredSpecDocument | null = null;
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
  }

  const specText = [
    spec?.title || '',
    ...(spec?.functional_requirements || []).map((f) => f.text),
    ...(spec?.acceptance_criteria || []).map((a) => a.text),
  ].join(' ');
  const specKeywords = extractKeywords(specText);

  const candidates: SmartContextItem[] = [];

  // ─── 1. 规则智能检索与打分 ───
  const rulePaths = resolveRulePaths(docpathDir);
  for (const rule of rulePaths.allRules) {
    if (!rule.exists) continue;
    const { content } = await readRuleFile(docpathDir, rule.name);
    if (!content.trim()) continue;

    const { score, reasons } = scoreRuleRelevance(rule, content, modifiedFiles, specKeywords);
    if (score > 0) {
      const compacted = compactRuleContent(content);
      candidates.push({
        id: `rule:${rule.name}`,
        type: 'rule',
        title: `规则: ${rule.name}`,
        path: rule.displayPath,
        score,
        matchReasons: reasons,
        tokenEstimate: estimateTokens(compacted),
        content: compacted,
      });
    }
  }

  // ─── 2. 活文档与 ADR 决策智能检索 ───
  const docsIndex = await readProjectDocumentIndex(docpathDir, taskId || undefined);
  if (docsIndex?.entries) {
    for (const doc of docsIndex.entries) {
      if (doc.path.endsWith('.md') && doc.path !== 'docs.md' && !doc.archive) {
        let docScore = 0;
        const docReasons: string[] = [];
        const lowerDocPath = doc.path.toLowerCase();
        const lowerSummary = (doc.summary || '').toLowerCase();

        // 路径关联
        for (const file of modifiedFiles) {
          const fileDir = file.split('/')[0];
          if (fileDir && lowerDocPath.includes(fileDir)) {
            docScore += 25;
            docReasons.push(`文档路径关联当前修改模块 "${fileDir}"`);
            break;
          }
        }

        // 关键词关联
        for (const kw of specKeywords) {
          if (lowerDocPath.includes(kw) || lowerSummary.includes(kw)) {
            docScore += 15;
            docReasons.push(`文档摘要命中需求关键词 "${kw}"`);
          }
        }

        if (docScore > 0) {
          const fullPath = resolveDocpathDocumentPath(docpathDir, doc.path);
          if (fullPath && existsSync(fullPath)) {
            const rawContent = (await readFileSafe(fullPath)) || '';
            if (rawContent.trim()) {
              candidates.push({
                id: `doc:${doc.path}`,
                type: 'doc',
                title: doc.title || doc.path,
                path: doc.path,
                score: docScore,
                matchReasons: docReasons,
                tokenEstimate: doc.token_estimate || estimateTokens(rawContent),
                content: rawContent.slice(0, 1200), // 取前 1200 字符切片
              });
            }
          }
        }
      }
    }
  }

  // ─── 3. 关联 ADR 决策 ───
  if (specKeywords.length > 0) {
    const topTopic = specKeywords[0];
    const adrDecisions = await getTopicRelevantDecisions(cwd, topTopic, 2);
    for (let i = 0; i < adrDecisions.length; i++) {
      const decisionContent = adrDecisions[i];
      candidates.push({
        id: `decision:${topTopic}-${i}`,
        type: 'decision',
        title: `相关 ADR 决策 (${topTopic})`,
        path: `.docpath/workspace/decisions.md`,
        score: 20,
        matchReasons: [`命中主题关键词 "${topTopic}"`],
        tokenEstimate: estimateTokens(decisionContent),
        content: decisionContent,
      });
    }
  }

  // ─── 4. 按相关度得分降序排序并预算贪心截断 ───
  candidates.sort((a, b) => b.score - a.score);

  let currentTokens = 0;
  const selectedItems: SmartContextItem[] = [];

  for (const item of candidates) {
    if (currentTokens + item.tokenEstimate <= maxTokens || selectedItems.length === 0) {
      selectedItems.push(item);
      currentTokens += item.tokenEstimate;
    }
  }

  // ─── 5. 渲染 Markdown 复合包 ───
  const sections: string[] = [
    `# 智能任务上下文包 (Smart Context Bundle)`,
    `> task: ${taskId || 'none'} | title: ${taskTitle} | estimated_tokens: ~${currentTokens}/${maxTokens}`,
    '',
  ];

  for (const item of selectedItems) {
    sections.push(`## [${item.type.toUpperCase()}] ${item.title}`);
    sections.push(`- path: ${item.path}`);
    sections.push(`- relevance_score: ${item.score}`);
    sections.push(`- matched_by: ${item.matchReasons.join('; ')}`);
    sections.push(`- tokens: ~${item.tokenEstimate}`);
    sections.push('');
    sections.push(item.content);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  const markdownBundle = sections.join('\n');

  return {
    taskId,
    taskTitle,
    totalEstimatedTokens: currentTokens,
    maxTokensBudget: maxTokens,
    items: selectedItems,
    markdownBundle,
    modifiedFilesCount: modifiedFiles.length,
  };
}
