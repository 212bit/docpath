/**
 * doc-trace.ts — 代码与活文档、架构决策、Backlog及规则的双向全景透视引擎 (Doc & Code Bi-directional Trace)
 *
 * 给定任意代码文件路径、符号名或架构关键字，毫秒级跨索引透视：
 * 1. 关联的活文档 (Living Docs) 与匹配依据
 * 2. 演进历程中沉淀的架构决策 (ADRs / Decision Briefs)
 * 3. 关联的 Backlog 需求血缘 (R-###) 与任务历史 (T-###)
 * 4. 适用的工程规范与系统规则 (Rules)
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readDecisionJsonl } from '../utils/decisions.js';
import { readProjectDocumentIndex, type ProjectDocumentIndexEntry } from '../utils/document-index.js';
import { listAllBacklogItems, type BacklogItem } from './backlog.js';
import { resolveRulePaths } from '../utils/rules.js';

export interface DocTraceMatch {
  path: string;
  title: string;
  type: string;
  scope?: string;
  score: number;
  match_reason: string;
}

export interface DocTraceDecision {
  id: string;
  category: string;
  conclusion: string;
  taskId?: string;
  createdAt: string;
}

export interface DocTraceBacklog {
  id: string;
  title: string;
  status: string;
  priority: string;
  kind?: string;
  task?: string | null;
}

export interface DocTraceRule {
  path: string;
  name: string;
  ruleCount: number;
  displayPath: string;
}

export interface DocTraceResult {
  target: string;
  target_type: 'file' | 'symbol' | 'topic';
  living_docs: DocTraceMatch[];
  decisions: DocTraceDecision[];
  backlog_lineage: DocTraceBacklog[];
  rules: DocTraceRule[];
  summary: {
    docs_count: number;
    decisions_count: number;
    backlog_count: number;
    rules_count: number;
  };
  agent_hint: string;
}

/**
 * 智能透视目标与活文档、决策、需求及规则的双向关联
 */
export async function traceDocAndCode(
  cwd: string,
  target: string,
): Promise<DocTraceResult> {
  const docpathDir = await resolveDocpathDir(cwd);
  const normalizedTarget = target.trim();

  // 1. 判断 target 类型 (file / symbol / topic)
  let targetType: 'file' | 'symbol' | 'topic' = 'topic';
  let targetBaseName = normalizedTarget;
  let targetStem = normalizedTarget;

  if (
    normalizedTarget.includes('/') ||
    normalizedTarget.includes('\\') ||
    normalizedTarget.endsWith('.ts') ||
    normalizedTarget.endsWith('.js') ||
    normalizedTarget.endsWith('.mjs') ||
    normalizedTarget.endsWith('.json') ||
    normalizedTarget.endsWith('.md')
  ) {
    targetType = 'file';
    targetBaseName = basename(normalizedTarget);
    targetStem = targetBaseName.replace(/\.[^.]+$/, '');
  } else if (/^[a-z][a-zA-Z0-9]+$/i.test(normalizedTarget) && /[A-Z]/.test(normalizedTarget)) {
    // camelCase or PascalCase -> symbol
    targetType = 'symbol';
    targetStem = normalizedTarget;
  } else {
    targetType = 'topic';
    targetStem = normalizedTarget;
  }

  // 2. 匹配活文档 (Living Docs)
  const livingDocs: DocTraceMatch[] = [];
  const searchKeywords = Array.from(
    new Set(
      [
        normalizedTarget,
        targetBaseName,
        targetStem,
        targetStem.replace(/[-_]/g, ' '),
        ...targetStem.split(/[-_]/),
      ]
        .map((k) => k.toLowerCase().trim())
        .filter((k) => k.length >= 2),
    ),
  );

  try {
    const docIndex = await readProjectDocumentIndex(docpathDir);
    if (docIndex && Array.isArray(docIndex.entries)) {
      for (const entry of docIndex.entries) {
        if (entry.archive) continue;

        let score = 0;
        const reasons: string[] = [];

        // (a) 检查文档内容是否直接提及目标文件或符号
        const fullDocPath = join(cwd, entry.path);
        let content = '';
        if (existsSync(fullDocPath)) {
          content = (await readFileSafe(fullDocPath)) || '';
        }

        if (content) {
          if (content.includes(normalizedTarget)) {
            score += 1.0;
            reasons.push(`正文直接引用目标 "${normalizedTarget}"`);
          } else if (targetBaseName && content.includes(targetBaseName)) {
            score += 0.8;
            reasons.push(`正文提及文件名 "${targetBaseName}"`);
          } else if (targetType === 'symbol' && content.includes(targetStem)) {
            score += 0.9;
            reasons.push(`正文直接声明/引用符号 \`${targetStem}\``);
          }
        }

        // (b) 检查文档路径、标题与摘要
        const entryPathLower = entry.path.toLowerCase();
        const entryTitleLower = (entry.title || '').toLowerCase();
        const entrySummaryLower = (entry.summary || '').toLowerCase();

        for (const kw of searchKeywords) {
          if (entryPathLower.includes(kw)) {
            score += 0.6;
            reasons.push(`文档路径匹配 "${kw}"`);
            break;
          }
        }

        for (const kw of searchKeywords) {
          if (entryTitleLower.includes(kw)) {
            score += 0.5;
            reasons.push(`文档标题匹配 "${kw}"`);
            break;
          }
        }

        // (c) 检查 topic_tags
        if (Array.isArray(entry.topic_tags)) {
          const matchedTags = entry.topic_tags.filter((tag) =>
            searchKeywords.some((kw) => tag.toLowerCase().includes(kw) || kw.includes(tag.toLowerCase())),
          );
          if (matchedTags.length > 0) {
            score += 0.4;
            reasons.push(`标签关联: [${matchedTags.join(', ')}]`);
          }
        }

        if (score > 0) {
          livingDocs.push({
            path: entry.path,
            title: entry.title || entry.path,
            type: entry.type || 'reference',
            scope: entry.scope,
            score: Math.min(1.0, Math.round(score * 100) / 100),
            match_reason: Array.from(new Set(reasons)).join('; '),
          });
        }
      }
    }
  } catch {
    // 容错
  }

  // 排序：高分优先
  livingDocs.sort((a, b) => b.score - a.score);

  // 3. 匹配架构决策 (ADRs)
  const decisions: DocTraceDecision[] = [];
  try {
    const workspaceDir = join(docpathDir, 'workspace');
    const records = await readDecisionJsonl(workspaceDir);
    if (records && records.length > 0) {
      for (const r of records) {
        let matched = false;
        if (r.relatedFiles && Array.isArray(r.relatedFiles)) {
          if (
            r.relatedFiles.some(
              (f) =>
                f.includes(normalizedTarget) ||
                (targetBaseName && f.includes(targetBaseName)) ||
                normalizedTarget.includes(f),
            )
          ) {
            matched = true;
          }
        }

        if (!matched) {
          const textToSearch = `${r.id} ${r.category} ${r.decision} ${r.context || ''} ${r.impact || ''}`.toLowerCase();
          if (searchKeywords.some((kw) => textToSearch.includes(kw))) {
            matched = true;
          }
        }

        if (matched) {
          decisions.push({
            id: r.id,
            category: r.category,
            conclusion: r.decision,
            taskId: r.taskId,
            createdAt: r.createdAt,
          });
        }
      }
    }
  } catch {
    // 容错
  }

  // 4. 匹配 Backlog 需求血缘
  const backlogLineage: DocTraceBacklog[] = [];
  try {
    const allBacklogs = await listAllBacklogItems(cwd);
    for (const b of allBacklogs) {
      const textToSearch = `${b.id} ${b.title} ${b.body} ${b.links.task || ''} ${b.links.milestone || ''}`.toLowerCase();
      if (
        textToSearch.includes(normalizedTarget.toLowerCase()) ||
        (targetBaseName && textToSearch.includes(targetBaseName.toLowerCase())) ||
        searchKeywords.some((kw) => textToSearch.includes(kw))
      ) {
        backlogLineage.push({
          id: b.id,
          title: b.title,
          status: b.status,
          priority: b.priority,
          kind: b.kind,
          task: b.links.task,
        });
      }
    }
  } catch {
    // 容错
  }

  // 5. 匹配工程规则 (Rules)
  const rules: DocTraceRule[] = [];
  try {
    const rulePaths = resolveRulePaths(docpathDir);
    for (const r of rulePaths.allRules) {
      if (r.exists) {
        const content = (await readFileSafe(r.path)) || '';
        const contentLower = content.toLowerCase();
        if (
          contentLower.includes(normalizedTarget.toLowerCase()) ||
          (targetBaseName && contentLower.includes(targetBaseName.toLowerCase())) ||
          searchKeywords.some((kw) => contentLower.includes(kw))
        ) {
          const ruleCount = (content.match(/^##\s+/gm) || []).length;
          rules.push({
            path: r.path,
            name: r.name,
            ruleCount,
            displayPath: r.displayPath,
          });
        }
      }
    }
  } catch {
    // 容错
  }

  const primaryDoc = livingDocs[0]?.path;
  const agentHint = primaryDoc
    ? `建议参考主文档 \`${primaryDoc}\`，或运行 \`docpath context --topic ${targetStem} --max-tokens 2000\` 注入紧凑上下文包`
    : `暂无强相关文档，建议运行 \`docpath doc search ${targetStem}\` 全局检索`;

  return {
    target: normalizedTarget,
    target_type: targetType,
    living_docs: livingDocs,
    decisions,
    backlog_lineage: backlogLineage,
    rules,
    summary: {
      docs_count: livingDocs.length,
      decisions_count: decisions.length,
      backlog_count: backlogLineage.length,
      rules_count: rules.length,
    },
    agent_hint: agentHint,
  };
}

/**
 * 将 trace 结果渲染为终端友好展示文本
 */
export function renderDocTraceReport(result: DocTraceResult): string {
  const lines: string[] = [
    `🔍  DocPath 代码-文档双向架构透视 (Doc Trace): "${result.target}" [${result.target_type.toUpperCase()}]`,
    `${'─'.repeat(70)}`,
  ];

  // 1. Living Docs
  lines.push(`\n📖  关联活文档 (Living Docs - ${result.living_docs.length} 篇):`);
  if (result.living_docs.length === 0) {
    lines.push('   (暂无强关联活文档)');
  } else {
    for (const d of result.living_docs) {
      const scoreBadge = d.score >= 0.8 ? '🟢' : d.score >= 0.5 ? '🟡' : '⚪';
      lines.push(`   ${scoreBadge} \`${d.path}\` — ${d.title} [${d.type}]`);
      lines.push(`      依据: ${d.match_reason}`);
    }
  }

  // 2. Decisions (ADRs)
  lines.push(`\n🏛️  关联架构决策 (ADRs - ${result.decisions.length} 项):`);
  if (result.decisions.length === 0) {
    lines.push('   (暂无关联 ADR 决策记录)');
  } else {
    for (const dec of result.decisions) {
      const taskSuffix = dec.taskId ? ` (任务: \`${dec.taskId}\`)` : '';
      lines.push(`   📌 [${dec.id}] [${dec.category}] (${dec.createdAt}): ${dec.conclusion}${taskSuffix}`);
    }
  }

  // 3. Backlog Lineage
  lines.push(`\n📋  需求血缘与历史任务 (Backlog & Tasks - ${result.backlog_lineage.length} 项):`);
  if (result.backlog_lineage.length === 0) {
    lines.push('   (暂无关联 Backlog 条目)');
  } else {
    for (const b of result.backlog_lineage.slice(0, 5)) {
      const taskSuffix = b.task ? ` -> Task: \`${b.task}\`` : '';
      lines.push(`   👉 [${b.id}] [${b.status}] [${b.priority}]: ${b.title}${taskSuffix}`);
    }
    if (result.backlog_lineage.length > 5) {
      lines.push(`   ... 还有 ${result.backlog_lineage.length - 5} 项历史需求`);
    }
  }

  // 4. Engineering Rules
  lines.push(`\n📏  工程规范与规则约束 (Rules - ${result.rules.length} 处):`);
  if (result.rules.length === 0) {
    lines.push('   (未命中专属规则库条目)');
  } else {
    for (const r of result.rules) {
      lines.push(`   📐 \`${r.displayPath}\` (${r.ruleCount} 条规范)`);
    }
  }

  lines.push(`\n💡  Agent 提示: ${result.agent_hint}\n`);
  return lines.join('\n');
}
