/**
 * docpath:reveal — 渐进式上下文披露
 *
 * 按 level 0-3 逐步披露项目上下文，让 AI agent 只消费需要的信息。
 *
 * Level 0 — Micro:   项目名 + 当前任务 + 下一步（~100 tokens）
 * Level 1 — Brief:   + 阶段概览 + 阻塞项 + spec 摘要（~500 tokens）
 * Level 2 — Standard: + 架构 + 决策 + 依赖 + style 规则 + 索引摘要（~2000 tokens）
 * Level 3 — Indexed: + 扩展索引 + harness 摘要 + topic/task/archive 按需片段（~8000 tokens）
 *
 * 设计理念：
 *   AI 不需要一次性读完所有文档。渐进式披露让 agent 按需获取上下文，
 *   从"最小可行上下文"开始，遇到阻塞时再升级 level。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd } from '../utils/workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';
import { getRecentDecisions } from '../governance/decisions.js';
import { compactRuleContent, readRuleFile } from '../utils/rules.js';
import {
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

interface RevealOptions {
  cwd: string;
  /** 披露级别 0-3（默认 1） */
  level?: number;
  /** 按文档 path/title/summary/scope/type 过滤 */
  topic?: string;
  /** 按任务 ID 定位文档 */
  taskId?: string;
  /** 显式允许归档正文参与预算竞争 */
  includeArchive?: boolean;
  /** 输出格式：text（默认）| raw */
  format?: 'text' | 'raw';
  /** 输出到文件 */
  output?: string;
}

// ── 辅助函数 ──

function header(emoji: string, title: string): string {
  return `${emoji}  ${title}\n${'─'.repeat(title.length * 2 + 4)}`;
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

/** 从 markdown 中提取前 N 行（跳过标题行后的摘要） */
function firstNLines(text: string, n: number): string {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.slice(0, n).join('\n');
}

/** 从 spec.md 提取摘要（去掉元数据块，取前 10 行正文） */
function specSummary(text: string): string {
  // 跳过开头的 metadata yaml block
  const afterMeta = text.replace(/^---[\s\S]*?---\s*\n?/, '');
  // 跳过第一个 # 标题
  const afterTitle = afterMeta.replace(/^#\s+.+\n?/, '');
  return firstNLines(afterTitle.trim(), 10);
}

/** 从 plan.md 提取进度摘要 */
function planSummary(text: string): string {
  const lines = text.split('\n');
  const taskLines = lines.filter(l => /^- \[[ x]\]/.test(l));
  if (taskLines.length === 0) return '';

  const done = taskLines.filter(l => l.includes('[x]')).length;
  const total = taskLines.length;
  const nextTask = taskLines.find(l => l.includes('[ ]'));

  let summary = `进度: ${done}/${total} 完成`;
  if (nextTask) {
    summary += `\n下一步: ${nextTask.replace(/^- \[[ ]\]\s*/, '')}`;
  }
  return summary;
}

function decisionSummary(block: string): string {
  const heading = block.match(/^##\s+(.+)$/m)?.[1]?.trim() || 'decision';
  const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
  const category = block.match(/^- category:\s*(.+)$/m)?.[1]?.trim();
  const decisionMatch = block.match(/^### 决策\s*\n([\s\S]*?)(?=\n###|\n---|$)/m);
  const decision = decisionMatch ? firstNLines(decisionMatch[1], 3) : '';
  return [
    `- ${heading}`,
    taskId ? `  task_id: ${taskId}` : '',
    category ? `  category: ${category}` : '',
    decision ? `  decision: ${decision.replace(/\n/g, ' / ')}` : '',
  ].filter(Boolean).join('\n');
}

async function readDocsIndex(docpathDir: string, currentTaskId?: string): Promise<ProjectDocumentIndexEntry[]> {
  try {
    return (await readProjectDocumentIndex(docpathDir, currentTaskId))?.entries || [];
  } catch {
    return [];
  }
}

function renderDocsIndex(entries: ProjectDocumentIndexEntry[], maxEntries: number, selection: DocumentSelectionOptions): string {
  const stats = documentIndexStats(entries, selection);
  const selected = sortDocumentEntries(entries.filter((entry) => matchesDocumentSelection(entry, selection)));
  const lines: string[] = [
    `- total_docs: ${stats.total}`,
    `- default_read_docs: ${stats.defaultRead}`,
    `- archive_docs: ${stats.archive}`,
    `- selected_docs: ${stats.selected}`,
    `- estimated_tokens_selected: ~${stats.selectedTokens}`,
    `- selected_index_only_docs: ${stats.selectedIndexOnly}`,
    `- estimated_tokens_index_only: ~${stats.selectedIndexOnlyTokens}`,
    `- archive_policy: 默认只展示索引；归档正文需 --topic、--task-id 或 --include-archive`,
    '',
  ];

  lines.push(...selected.slice(0, maxEntries).map((entry) => [
    `- path: ${entry.path}`,
    `  type: ${entry.type || entry.kind || 'unknown'}`,
    `  scope: ${entry.scope || 'project'}`,
    `  default_read: ${entry.default_read}`,
    `  archive: ${entry.archive}`,
    `  generated_view: ${entry.generated_view === true}`,
    `  index_only: ${isIndexOnlyDocument(entry)}`,
    `  budget_excluded: ${isIndexOnlyDocument(entry)}`,
    `  tokens: ~${entry.token_estimate}`,
    `  task_id: ${entry.task_id || ''}`,
    `  title: ${entry.title || ''}`,
    `  summary: ${entry.summary || ''}`,
    `  updated_at: ${entry.updated_at || ''}`,
  ].join('\n')));

  if (selected.length === 0) lines.push('- 无匹配索引条目');
  return lines.join('\n');
}

async function renderDocumentSnippets(
  docpathDir: string,
  entries: ProjectDocumentIndexEntry[],
  selection: DocumentSelectionOptions,
): Promise<string> {
  const selected = sortDocumentEntries(entries)
    .filter((entry) => entry.path.endsWith('.md') && entry.path !== 'docs.md')
    .filter((entry) => shouldReadDocumentBody(entry, selection));
  const snippets: string[] = [];
  let remaining = 9000;

  if (selection.taskId && !entries.some((entry) => entry.task_id === selection.taskId)) {
    throw new Error(`未在 docs-index 中找到 task_id: ${selection.taskId}`);
  }

  for (const entry of selected) {
    if (remaining <= 0) break;
    const fullPath = resolveDocpathDocumentPath(docpathDir, entry.path);
    if (!fullPath) throw new Error(`docs-index path escapes .docpath: ${entry.path}`);
    if (!existsSync(fullPath)) continue;
    const content = await safeRead(fullPath);
    if (!content.trim()) continue;
    const slice = firstNLines(content, Math.min(60, Math.max(8, Math.floor(remaining / 180))));
    remaining -= slice.length;
    snippets.push([
      `### ${entry.title || entry.path}`,
      `- path: ${entry.path}`,
      `- archive: ${entry.archive}`,
      `- tokens: ~${entry.token_estimate}`,
      '',
      slice,
    ].join('\n'));
  }

  return snippets.join('\n\n');
}

function selectionLabel(options: DocumentSelectionOptions): string {
  return [
    options.topic ? `topic=${options.topic}` : '',
    options.taskId ? `task_id=${options.taskId}` : '',
    options.includeArchive ? 'include_archive=true' : '',
  ].filter(Boolean).join(', ') || 'default_read';
}

// ── 核心命令 ──

export async function revealCommand(options: RevealOptions): Promise<void> {
  const { cwd, level = 1, topic, taskId, includeArchive, format = 'text', output } = options;
  validateTaskId(taskId);
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (level < 0 || level > 3) {
    console.error('❌  level 范围: 0-3');
    process.exit(1);
  }

  const sections: string[] = [];
  const budgets: Record<number, number> = {
    0: 100,
    1: 500,
    2: 2000,
    3: 8000,
  };
  const budget = budgets[level] ?? budgets[1];

  // ══════════════════════════════════════════
  // Level 0 — Micro: 项目 + 任务 + 下一步
  // ══════════════════════════════════════════
  const current = await readCurrentMd(cwd);
  const selection: DocumentSelectionOptions = {
    topic,
    taskId,
    includeArchive,
    currentTaskId: current?.task_id,
  };
  if (current) {
    const projectName = cwd.split('/').pop() || 'unknown';
    sections.push(
      header('📍', '当前状态') + '\n' +
      `项目: ${projectName}\n` +
      `状态: ${current.state} | 阶段: ${current.phase || 'null'}${current.current_step ? ` | 子任务: ${current.current_step}` : ''}\n` +
      `任务: ${current.task_id} — ${current.task_title}\n` +
      `级别: Level ${current.level}`
    );

    // Level 0: 只显示最后一条 breadcrumb
    if (level === 0) {
      const bc = await readBreadcrumb(cwd);
      if (bc.entries.length > 0) {
        const last = bc.entries[bc.entries.length - 1];
        sections.push(`\n上一步: [${last.status}] ${last.step} — ${last.context}`);
      }
    }
  }

  // ══════════════════════════════════════════
  // Level 1 — Brief: + 阶段 + 阻塞 + 摘要
  // ══════════════════════════════════════════
  if (level >= 1) {
    // Breadcrumb 最近 5 条
    const bc = await readBreadcrumb(cwd);
    if (bc.entries.length > 0) {
      const recent = bc.entries.slice(-5);
      const bcLines = recent.map(e => {
        const emoji = e.status === 'done' ? '✅' : e.status === 'in_progress' ? '🔄' : '🚫';
        return `  ${emoji} ${e.step}: ${e.context}`;
      });
      sections.push(
        header('📋', '最近进度') + '\n' +
        bcLines.join('\n') + '\n' +
        `  完成: ${bc.done}/${bc.total} | 进行中: ${bc.inProgress} | 阻塞: ${bc.blocked}`
      );
    }

    // Spec 摘要
    const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
    if (existsSync(specPath)) {
      const spec = await safeRead(specPath);
      if (spec) {
        sections.push(
          header('📐', '需求摘要 (spec)') + '\n' +
          specSummary(spec)
        );
      }
    }

    // Plan 进度
    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
    if (existsSync(planPath)) {
      const plan = await safeRead(planPath);
      if (plan) {
        sections.push(
          header('🗺️', '执行计划 (plan)') + '\n' +
          planSummary(plan)
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // Level 2 — Standard: + 架构 + style + 文档索引
  // ══════════════════════════════════════════
  if (level >= 2) {
    // Style 规则
    const { content: style, file: styleFile } = await readRuleFile(docpathDir, 'style');
    const compactStyle = compactRuleContent(style);
    if (compactStyle.trim()) {
      sections.push(
        header('📏', `全局规则: 编码规范 (${styleFile.displayPath})`) + '\n' +
        compactStyle.trim()
      );
    }

    // Architecture（如果存在）
    const { content: arch, file: archFile } = await readRuleFile(docpathDir, 'architecture');
    const compactArch = compactRuleContent(arch);
    if (compactArch.trim()) {
      sections.push(
        header('🏗️', `全局规则: 架构 (${archFile.displayPath})`) + '\n' +
        firstNLines(compactArch, 30)
      );
    }

    // 结构化文档索引
    const docsIndex = await readDocsIndex(docpathDir, current?.task_id);
    if (docsIndex.length > 0) {
      sections.push(
        header('📚', `文档索引 (docs-index: ${selectionLabel(selection)})`) + '\n' +
        renderDocsIndex(docsIndex, level >= 3 ? 30 : 12, selection)
      );
    } else {
      const docsPath = join(docpathDir, 'docs.md');
      if (existsSync(docsPath)) {
        const docs = await safeRead(docsPath);
        if (docs.trim()) {
          sections.push(
            header('📚', '文档索引 (docs.md 摘要)') + '\n' +
            firstNLines(docs, 40)
          );
        }
      }
    }

    const decisions = await getRecentDecisions(cwd, 5);
    if (decisions.length > 0) {
      sections.push(
        header('🧭', '相关决策摘要 (decisions)') + '\n' +
        decisions.map(decisionSummary).join('\n')
      );
    }
  }

  // ══════════════════════════════════════════
  // Level 3 — Indexed: + harness 摘要 + 显式选择的文档片段
  // ══════════════════════════════════════════
  if (level >= 3) {
    // Harness 规则
    const harnessPath = join(docpathDir, 'workspace', 'harness.md');
    if (existsSync(harnessPath)) {
      const harness = await safeRead(harnessPath);
      if (harness.trim()) {
        sections.push(
          header('🛡️', '工作流护栏摘要 (harness)') + '\n' +
          firstNLines(harness, 80)
        );
      }
    }

    const docsIndex = await readDocsIndex(docpathDir, current?.task_id);
    const snippets = await renderDocumentSnippets(docpathDir, docsIndex, selection);
    if (snippets.trim()) {
      sections.push(
        header('📖', `按需展开文档片段 (${selectionLabel(selection)})`) + '\n' +
        snippets
      );
    }
  }

  // ── 组装输出 ──
  const fullContext = sections.join('\n\n');
  const tokenEst = estimateTokens(fullContext);

  if (format === 'raw') {
    console.log(fullContext);
  } else {
    const levelNames = ['Micro', 'Brief', 'Standard', 'Indexed'];
    console.log(`\n🔍  DocPath Reveal — Level ${level} (${levelNames[level]})\n`);
    console.log(`📊  估算 token: ~${tokenEst} / ${budget}`);
    console.log(`${'─'.repeat(50)}\n`);
    console.log(fullContext);
    console.log(`\n${'─'.repeat(50)}`);
    if (level < 3) {
      console.log(`💡  使用 --level ${level + 1} 获取更多上下文\n`);
    } else {
      console.log(`💡  已是最高级别；归档正文仍需 topic/task-id/include-archive 按需命中\n`);
    }
  }

  if (output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(output, fullContext, 'utf-8');
    console.log(`✅  已保存到 ${output}`);
  }
}
