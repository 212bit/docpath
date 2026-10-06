/**
 * docpath:context — 生成 Claude Code 可消费的上下文包
 *
 * 压缩 current.md + breadcrumb + spec + plan 为单个 prompt-ready blob。
 * 断线重连后一键恢复完整上下文，Claude Code 痛点杀手。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentState } from '../utils/workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readActiveTaskFile } from '../utils/task-files.js';
import { compactRuleContent, readRuleFile } from '../utils/rules.js';
import { readLastCheckMarkdown } from '../utils/workspace-evidence.js';
import { getTopicRelevantDecisions } from '../governance/decisions.js';
import { buildSmartContext } from '../utils/smart-context.js';
import { buildAdaptiveContext, type AdaptiveContextReport } from '../engine/adaptive-context.js';
import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  assertDocumentIndexContainsTaskId,
  documentIndexStats,
  estimateTokens,
  isIndexOnlyDocument,
  matchesDocumentSelection,
  readProjectDocumentIndex,
  resolveDocpathDocumentPath,
  shouldReadDocumentBody,
  sortDocumentEntries,
  validateTaskId,
  type DocumentSelectionOptions,
  type ProjectDocumentIndexEntry,
} from '../utils/document-index.js';

export interface ContextOptions {
  cwd: string;
  /** 输出格式：prompt（默认）| raw */
  format?: 'prompt' | 'raw';
  /** 最大 token 估算数（默认 8000） */
  maxTokens?: number;
  /** 是否使用智能关联与精准规则投喂 */
  smart?: boolean;
  /** 是否使用自适应分层预算压缩 (Adaptive Multi-Tier Compression) */
  adaptive?: boolean;
  /** 是否包含 spec */
  withSpec?: boolean;
  /** 是否包含 plan */
  withPlan?: boolean;
  /** 输出到文件 */
  output?: string;
  /** Agent 可读 YAML 输出 */
  agent?: boolean;
  /** 按文档 path/title/summary/scope/type/topic_tags 过滤 */
  topic?: string;
  /** 按任务 ID 展开相关文档 */
  taskId?: string;
  /** 显式允许归档正文参与预算竞争 */
  includeArchive?: boolean;
}

/**
 * 压缩 markdown：去除多余空行、注释、重复内容
 */
function compressMarkdown(text: string, maxChars: number): string {
  let result = text
    .replace(/<!--[\s\S]*?-->/g, '')           // 去 HTML 注释
    .replace(/\n{3,}/g, '\n\n')                // 压缩空行
    .replace(/^\s*[-=]{3,}\s*$/gm, '---')      // 简化分隔线
    .trim();

  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '\n\n... [截断，使用 --max-tokens 调整]';
  }
  return result;
}

async function readDocsIndexSafe(
  docpathDir: string,
  currentTaskId?: string,
): Promise<ProjectDocumentIndexEntry[]> {
  try {
    return (await readProjectDocumentIndex(docpathDir, currentTaskId))?.entries || [];
  } catch {
    return [];
  }
}

function renderDocsIndexSummary(entries: ProjectDocumentIndexEntry[], selection: DocumentSelectionOptions): string | null {
  if (entries.length === 0) return null;
  const stats = documentIndexStats(entries, selection);
  const explicitSelection = !!selection.topic?.trim() || !!selection.taskId?.trim() || !!selection.includeArchive;
  const selected = sortDocumentEntries(entries.filter((entry) => matchesDocumentSelection(entry, selection)))
    .slice(0, explicitSelection ? 14 : 5);
  const lines: string[] = [
    '## 文档索引摘要 (index-first)',
    `- total_docs: ${stats.total}`,
    `- default_read_docs: ${stats.defaultRead}`,
    `- archive_docs: ${stats.archive}`,
    `- selected_docs: ${stats.selected}`,
    `- estimated_tokens_default_read: ~${stats.defaultReadTokens}`,
    `- estimated_tokens_selected: ~${stats.selectedTokens}`,
    `- selected_index_only_docs: ${stats.selectedIndexOnly}`,
    `- archive_policy: 默认不读取归档正文；使用 --topic、--task-id 或 --include-archive 后才展开片段`,
    '',
    '### 优先索引条目',
  ];

  for (const entry of selected) {
    const flags = [
      entry.default_read ? 'default' : '',
      entry.archive ? 'archive' : '',
      entry.generated_view === true ? 'generated' : '',
      isIndexOnlyDocument(entry) ? 'index_only' : '',
      entry.task_id ? `task:${entry.task_id}` : '',
    ].filter(Boolean).join(', ') || 'indexed';
    lines.push([
      `- path: ${entry.path}`,
      `  flags: ${flags}`,
      `  tokens: ~${entry.token_estimate}`,
      `  summary: ${entry.summary || ''}`,
    ].join('\n'));
  }

  if (selected.length === 0) lines.push('- 无匹配索引条目');
  return lines.join('\n');
}

async function renderIndexedDocs(
  docpathDir: string,
  maxChars: number,
  selection: DocumentSelectionOptions,
): Promise<string[]> {
  const entries = await readDocsIndexSafe(docpathDir, selection.currentTaskId);
  assertDocumentIndexContainsTaskId(docpathDir, entries, selection.taskId);
  if (entries.length === 0) return [];

  const sections: string[] = [];
  const summary = renderDocsIndexSummary(entries, selection);
  if (summary) sections.push(summary);

  const sorted = sortDocumentEntries(entries)
    .filter((entry) => entry.path.endsWith('.md') && entry.path !== 'docs.md')
    .filter((entry) => shouldReadDocumentBody(entry, selection));

  if (sorted.length === 0) return sections;

  let remaining = Math.max(1000, Math.floor(maxChars * 0.2));
  const snippetSections: string[] = [];
  for (const entry of sorted) {
    if (remaining <= 0) break;
    const fullPath = resolveDocpathDocumentPath(docpathDir, entry.path);
    if (!fullPath) throw new Error(`docs-index path escapes .docpath: ${entry.path}`);
    if (!existsSync(fullPath)) continue;
    const content = await readFile(fullPath, 'utf-8');
    if (!content.trim()) continue;
    const slice = compressMarkdown(content, Math.min(remaining, 1600));
    snippetSections.push([
      `### ${entry.title || entry.path}`,
      `- path: ${entry.path}`,
      `- type: ${entry.type || entry.kind || 'unknown'}`,
      `- scope: ${entry.scope || 'project'}`,
      `- archive: ${entry.archive}`,
      `- tokens: ~${entry.token_estimate}`,
      `- summary: ${entry.summary || ''}`,
      '',
      slice,
    ].join('\n'));
    remaining -= slice.length;
  }

  if (snippetSections.length > 0) {
    sections.push(['## 按需展开文档片段', ...snippetSections].join('\n\n'));
  }

  return sections;
}

export async function contextCommand(options: ContextOptions): Promise<void> {
  const { cwd, format = 'prompt', maxTokens = DEFAULT_CONTEXT_TOKEN_BUDGET, smart = false } = options;
  validateTaskId(options.taskId);
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  // ── 自适应分层预算压缩路由 (--adaptive) ──
  if (options.adaptive) {
    const report = await buildAdaptiveContext({
      cwd,
      maxTokens,
      smart: options.smart,
      topic: options.topic,
      taskId: options.taskId,
      withSpec: options.withSpec,
      withPlan: options.withPlan,
      includeArchive: options.includeArchive,
    });

    if (options.agent) {
      const { stringify } = await import('yaml');
      console.log(
        stringify({
          agent_view: 'adaptive_context',
          task_id: report.task_id,
          task_title: report.task_title,
          phase: report.phase,
          tokens: report.total_tokens,
          max_tokens_budget: report.max_tokens_budget,
          compression_ratio: report.compression_ratio,
          tiers: report.tiers.map((t) => ({
            tier: t.tier,
            name: t.name,
            priority: t.priority,
            summary: t.summary,
            tokens: t.actualTokens,
          })),
          context_payload: report.markdown,
        }),
      );
      return;
    }

    if (format === 'raw') {
      console.log(report.markdown);
    } else {
      console.log(`\n🗜️  DocPath 自适应分层上下文包 (--adaptive)\n`);
      console.log(`📊  预算适配: ~${report.total_tokens} / ${maxTokens} tokens | 压缩率: ${(report.compression_ratio * 100).toFixed(0)}%`);
      console.log(`📋  分层装配:`);
      for (const tier of report.tiers) {
        console.log(`  - Tier ${tier.tier} [${tier.name}]: ~${tier.actualTokens} tokens (${tier.summary})`);
      }
      console.log(`\n${'─'.repeat(50)}\n`);
      console.log(report.markdown);
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`💡  已根据预算上限自动完成需求保全、步骤聚焦与规则剪裁\n`);
    }

    if (options.output) {
      const { writeFile } = await import('fs/promises');
      await writeFile(options.output, report.markdown, 'utf-8');
      console.log(`✅  已保存到 ${options.output}`);
    }
    return;
  }

  // ── 智能精准上下文路由 (--smart) ──
  if (smart) {
    const report = await buildSmartContext(cwd, maxTokens);
    if (options.agent) {
      const { stringify } = await import('yaml');
      console.log(
        stringify({
          agent_view: 'smart_context',
          task_id: report.taskId,
          task_title: report.taskTitle,
          estimated_tokens: report.totalEstimatedTokens,
          max_tokens_budget: report.maxTokensBudget,
          matched_items: report.items.map((i) => ({
            id: i.id,
            type: i.type,
            title: i.title,
            path: i.path,
            score: i.score,
            matched_by: i.matchReasons,
            tokens: i.tokenEstimate,
          })),
          context_payload: report.markdownBundle,
        }),
      );
      return;
    }

    if (format === 'raw') {
      console.log(report.markdownBundle);
    } else {
      console.log(`\n🧠  DocPath 智能精准上下文包 (--smart)\n`);
      console.log(`📊  估算 token: ~${report.totalEstimatedTokens} / ${maxTokens} | 命中规则/文档: ${report.items.length} 个`);
      console.log(`${'─'.repeat(50)}\n`);
      console.log(report.markdownBundle);
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`💡  已根据当前活跃任务与修改文件完成领域规范精准路由\n`);
    }

    if (options.output) {
      const { writeFile } = await import('fs/promises');
      await writeFile(options.output, report.markdownBundle, 'utf-8');
      console.log(`✅  已保存到 ${options.output}`);
    }
    return;
  }

  const maxChars = Math.floor(maxTokens * 3); // 粗略 1 token ≈ 3 chars
  const sections: string[] = [];
  let currentTaskId: string | undefined;

  // ── 1. 当前状态 ──
  const state = await readCurrentState(cwd);
  currentTaskId = state?.task_id;
  if (state) {
    sections.push(`## 当前状态\n\`\`\`yaml\nlevel: ${state.level}\nstate: ${state.state}\ntask_id: ${state.task_id}\ntask_title: ${state.task_title}\nphase: ${state.phase}\nstarted_at: ${state.started_at}\nupdated_at: ${state.updated_at}\n\`\`\``);
  }

  // ── 2. 面包屑 ──
  const bc = await readBreadcrumb(cwd);
  if (bc.entries.length > 0) {
    const recent = bc.entries.slice(-10); // 最近 10 条
    const bcLines = recent.map(e =>
      `- [${e.status}] ${e.step} — ${e.context}`
    );
    sections.push(`## 进度追踪 (breadcrumb)\n${bcLines.join('\n')}\n\n**完成**: ${bc.done}/${bc.total}  **进行中**: ${bc.inProgress}  **阻塞**: ${bc.blocked}`);
  }

  // ── 3. Spec ──
  if (options.withSpec !== false) {
    const spec = await readActiveTaskFile(docpathDir, currentTaskId, 'spec.md');
    if (spec.trim()) {
      sections.push(`## 需求规约 (spec.md)\n${compressMarkdown(spec, Math.floor(maxChars * 0.3))}`);
    }
  }

  // ── 4. Plan ──
  if (options.withPlan !== false) {
    const plan = await readActiveTaskFile(docpathDir, currentTaskId, 'plan.md');
    if (plan.trim()) {
      sections.push(`## 执行计划 (plan.md)\n${compressMarkdown(plan, Math.floor(maxChars * 0.3))}`);
    }
  }

  // ── 5. Check 证据 ──
  const checkContent = await readLastCheckMarkdown(docpathDir);
  if (checkContent.trim()) {
    sections.push(`## 质量检查证据 (last-check.md)\n${compressMarkdown(checkContent, Math.floor(maxChars * 0.1))}`);
  }

  // ── 6. 全局规则 ──
  const { content: style, file: styleFile } = await readRuleFile(docpathDir, 'style');
  const compactStyle = compactRuleContent(style);
  if (compactStyle.trim()) {
    sections.push(`## 全局规则: 编码规范 (${styleFile.displayPath})\n${compressMarkdown(compactStyle, Math.floor(maxChars * 0.16))}`);
  }

  // ── 7. 结构化文档索引：默认只输出摘要，正文按 topic/task/archive 显式展开 ──
  const indexedDocs = await renderIndexedDocs(docpathDir, maxChars, {
    topic: options.topic,
    taskId: options.taskId,
    includeArchive: options.includeArchive,
    currentTaskId,
  });
  sections.push(...indexedDocs);

  // ── 8. 主题相关 ADR ──
  if (options.topic) {
    const topicDecisions = await getTopicRelevantDecisions(cwd, options.topic, 3);
    if (topicDecisions.length > 0) {
      sections.push(
        `## 主题相关决策 (topic: ${options.topic})\n` +
        topicDecisions.map((d) => compressMarkdown(d, 200)).join('\n---\n')
      );
    }
  }

  // ── 组装输出 ──
  const fullContext = sections.join('\n\n---\n\n');

  // --agent: 输出机器可读 YAML
  if (options.agent) {
    const { generateAgentOutput } = await import('../engine/agent-output.js');
    process.stdout.write(await generateAgentOutput(cwd));
    return;
  }

  const tokenEst = estimateTokens(fullContext);

  if (format === 'raw') {
    console.log(fullContext);
  } else {
    console.log(`\n📦  DocPath 上下文包\n`);
    console.log(`📊  估算 token: ~${tokenEst} / ${maxTokens}`);
    console.log(`${'─'.repeat(50)}\n`);
    console.log(fullContext);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`💡  复制以上内容粘贴给 Agent 即可恢复完整上下文\n`);
  }

  if (options.output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(options.output, fullContext, 'utf-8');
    console.log(`✅  已保存到 ${options.output}`);
  }
}
