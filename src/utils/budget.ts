/**
 * 上下文 Token 预算与健康度分析引擎 (Context Budget & Token Profiler)
 *
 * 深度拆解 Rules / Active Task / Governance / Events / Rendered Views / Docs
 * 的 Token 占比、行数与体积分布，提供超标警示与精准剪枝建议。
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { readFileSafe, resolveDocpathDir } from './file.js';
import { resolveRulePaths, RULE_FILE_LINE_BUDGET } from './rules.js';
import { readCurrentState } from './workspace.js';
import { estimateTokens, readProjectDocumentIndex } from './document-index.js';

export type BudgetStatus = 'healthy' | 'warning' | 'critical';

export interface BudgetItem {
  name: string;
  category: string;
  path: string;
  displayPath: string;
  tokens: number;
  lines: number;
  bytes: number;
  status: BudgetStatus;
  thresholdTokens: number;
  thresholdLines?: number;
  suggestion?: string;
  isRenderedView?: boolean;
}

export interface BudgetCategorySummary {
  category: string;
  label: string;
  totalTokens: number;
  totalLines: number;
  totalBytes: number;
  percentage: number;
  itemCount: number;
  status: BudgetStatus;
  thresholdTokens: number;
  items: BudgetItem[];
}

export interface BudgetSuggestion {
  severity: 'low' | 'medium' | 'high';
  category: string;
  target: string;
  message: string;
  actionCommand?: string;
}

export interface BudgetReport {
  overallStatus: BudgetStatus;
  totalTokens: number;
  totalLines: number;
  totalBytes: number;
  activeTask: string | null;
  categories: {
    rules: BudgetCategorySummary;
    active_task: BudgetCategorySummary;
    governance: BudgetCategorySummary;
    events: BudgetCategorySummary;
    views: BudgetCategorySummary;
    docs: BudgetCategorySummary;
  };
  topConsumers: BudgetItem[];
  suggestions: BudgetSuggestion[];
}

export const BUDGET_THRESHOLDS = {
  rules: {
    fileLines: RULE_FILE_LINE_BUDGET, // 200 lines
    fileTokens: 8000,
    categoryTokens: 16000,
  },
  active_task: {
    fileTokens: 3000,
    categoryTokens: 6000,
  },
  governance: {
    fileTokens: 8000,
    categoryTokens: 12000,
  },
  events: {
    fileTokens: 15000,
    categoryTokens: 18000,
  },
  views: {
    fileTokens: 2000,
    indexTokens: 100000,
    categoryTokens: 110000,
  },
  docs: {
    fileTokens: 4000,
    categoryTokens: 20000,
  },
};

function determineStatus(tokens: number, thresholdTokens: number, lines?: number, thresholdLines?: number): BudgetStatus {
  const tokenRatio = tokens / thresholdTokens;
  const lineRatio = (lines && thresholdLines) ? lines / thresholdLines : 0;
  const maxRatio = Math.max(tokenRatio, lineRatio);

  if (maxRatio >= 1.5) return 'critical';
  if (maxRatio >= 1.0) return 'warning';
  return 'healthy';
}

function determineCategoryStatus(items: BudgetItem[], totalTokens: number, categoryThreshold: number): BudgetStatus {
  if (totalTokens >= categoryThreshold * 1.5 || items.some((i) => i.status === 'critical')) {
    return 'critical';
  }
  if (totalTokens >= categoryThreshold || items.some((i) => i.status === 'warning')) {
    return 'warning';
  }
  return 'healthy';
}

async function collectRulesBudget(docpathDir: string, suggestions: BudgetSuggestion[]): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  try {
    const rulePaths = resolveRulePaths(docpathDir);
    for (const r of rulePaths.allRules) {
      if (!r.exists) continue;
      const content = (await readFileSafe(r.path)) || '';
      const lines = content.split('\n').length;
      const tokens = estimateTokens(content);
      const bytes = Buffer.byteLength(content, 'utf-8');
      const status = determineStatus(tokens, BUDGET_THRESHOLDS.rules.fileTokens, lines, BUDGET_THRESHOLDS.rules.fileLines);

      let suggestion: string | undefined;
      if (status !== 'healthy') {
        suggestion = `规则文件超过预算限制 (${lines} 行 / ${tokens} tokens)，建议精简或拆分到特定领域规则。`;
        suggestions.push({
          severity: status === 'critical' ? 'high' : 'medium',
          category: 'rules',
          target: r.displayPath,
          message: suggestion,
          actionCommand: `docpath learn --topic ${r.name}`,
        });
      }

      items.push({
        name: r.name,
        category: 'rules',
        path: r.path,
        displayPath: r.displayPath,
        tokens,
        lines,
        bytes,
        status,
        thresholdTokens: BUDGET_THRESHOLDS.rules.fileTokens,
        thresholdLines: BUDGET_THRESHOLDS.rules.fileLines,
        suggestion,
      });
    }
  } catch {
    // 容错
  }
  return items;
}

async function collectActiveTaskBudget(docpathDir: string, suggestions: BudgetSuggestion[]): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  const currentTaskDir = join(docpathDir, 'tasks', 'current');
  if (!existsSync(currentTaskDir)) return items;

  try {
    const scanFilesRecursive = async (dir: string, baseDisplay: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const display = `${baseDisplay}/${entry.name}`;
        if (entry.isFile() && !entry.name.startsWith('.')) {
          const content = (await readFileSafe(fullPath)) || '';
          const lines = content.split('\n').length;
          const tokens = estimateTokens(content);
          const bytes = Buffer.byteLength(content, 'utf-8');
          const status = determineStatus(tokens, BUDGET_THRESHOLDS.active_task.fileTokens);

          let suggestion: string | undefined;
          if (status !== 'healthy') {
            suggestion = `当前任务文件较大 (${tokens} tokens)，如果已完成请尽快通过 docpath quick-done 或 agent done 归档。`;
            suggestions.push({
              severity: status === 'critical' ? 'high' : 'medium',
              category: 'active_task',
              target: display,
              message: suggestion,
              actionCommand: 'docpath quick-done',
            });
          }

          items.push({
            name: entry.name,
            category: 'active_task',
            path: fullPath,
            displayPath: display,
            tokens,
            lines,
            bytes,
            status,
            thresholdTokens: BUDGET_THRESHOLDS.active_task.fileTokens,
            suggestion,
          });
        } else if (entry.isDirectory() && entry.name !== 'node_modules') {
          await scanFilesRecursive(fullPath, display);
        }
      }
    };
    await scanFilesRecursive(currentTaskDir, '.docpath/tasks/current');
  } catch {
    // 容错
  }
  return items;
}

async function collectGovernanceBudget(docpathDir: string, suggestions: BudgetSuggestion[]): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  const workspaceDir = join(docpathDir, 'workspace');
  const decisionsJsonlPath = join(workspaceDir, 'decisions.jsonl');
  const decisionsMdPath = join(workspaceDir, 'decisions.md');
  const hasJsonl = existsSync(decisionsJsonlPath);

  for (const p of [decisionsJsonlPath, decisionsMdPath]) {
    if (!existsSync(p)) continue;
    const content = (await readFileSafe(p)) || '';
    const lines = content.split('\n').length;
    const tokens = estimateTokens(content);
    const bytes = Buffer.byteLength(content, 'utf-8');
    const filename = relative(docpathDir, p);
    const isRenderedView = p === decisionsMdPath && hasJsonl;
    const status = isRenderedView
      ? 'healthy'
      : determineStatus(tokens, BUDGET_THRESHOLDS.governance.fileTokens);

    let suggestion: string | undefined;
    if (status !== 'healthy' && !isRenderedView) {
      suggestion = `活跃决策日志已累积较多历史条目 (${tokens} tokens)，建议执行老化归档。`;
      suggestions.push({
        severity: status === 'critical' ? 'high' : 'medium',
        category: 'governance',
        target: `.docpath/${filename}`,
        message: suggestion,
        actionCommand: 'docpath gc',
      });
    }

    items.push({
      name: filename,
      category: 'governance',
      path: p,
      displayPath: `.docpath/${filename}`,
      tokens,
      lines,
      bytes,
      status,
      thresholdTokens: BUDGET_THRESHOLDS.governance.fileTokens,
      suggestion,
      isRenderedView,
    });
  }
  return items;
}

async function collectEventsBudget(docpathDir: string, suggestions: BudgetSuggestion[]): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  const workspaceDir = join(docpathDir, 'workspace');
  const breadcrumbJsonlPath = join(workspaceDir, 'breadcrumb.jsonl');
  const breadcrumbMdPath = join(workspaceDir, 'breadcrumb.md');
  const hasJsonl = existsSync(breadcrumbJsonlPath);

  for (const p of [breadcrumbJsonlPath, breadcrumbMdPath]) {
    if (!existsSync(p)) continue;
    const content = (await readFileSafe(p)) || '';
    const lines = content.split('\n').length;
    const tokens = estimateTokens(content);
    const bytes = Buffer.byteLength(content, 'utf-8');
    const filename = relative(docpathDir, p);
    const isRenderedView = p === breadcrumbMdPath && hasJsonl;
    const status = isRenderedView
      ? 'healthy'
      : determineStatus(tokens, BUDGET_THRESHOLDS.events.fileTokens);

    let suggestion: string | undefined;
    if (status !== 'healthy' && !isRenderedView) {
      suggestion = `执行事件轨迹日志过长 (${lines} 行 / ${tokens} tokens)，建议执行工作区 GC 清理。`;
      suggestions.push({
        severity: status === 'critical' ? 'high' : 'medium',
        category: 'events',
        target: `.docpath/${filename}`,
        message: suggestion,
        actionCommand: 'docpath gc',
      });
    }

    items.push({
      name: filename,
      category: 'events',
      path: p,
      displayPath: `.docpath/${filename}`,
      tokens,
      lines,
      bytes,
      status,
      thresholdTokens: BUDGET_THRESHOLDS.events.fileTokens,
      suggestion,
      isRenderedView,
    });
  }
  return items;
}

async function collectViewsBudget(docpathDir: string, suggestions: BudgetSuggestion[]): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  const currentMdPath = join(docpathDir, 'workspace', 'current.md');
  const docsIndexPath = join(docpathDir, 'docs-index.json');

  for (const p of [currentMdPath, docsIndexPath]) {
    if (!existsSync(p)) continue;
    const content = (await readFileSafe(p)) || '';
    const lines = content.split('\n').length;
    const tokens = estimateTokens(content);
    const bytes = Buffer.byteLength(content, 'utf-8');
    const filename = relative(docpathDir, p);
    const isDocsIndex = basename(p) === 'docs-index.json';
    const fileThreshold = isDocsIndex
      ? BUDGET_THRESHOLDS.views.indexTokens
      : BUDGET_THRESHOLDS.views.fileTokens;
    const status = determineStatus(tokens, fileThreshold);

    let suggestion: string | undefined;
    if (status !== 'healthy' && isDocsIndex) {
      suggestion = `活文档索引体积偏大 (${tokens} tokens)，建议执行文档索引刷新或归档清理。`;
      suggestions.push({
        severity: status === 'critical' ? 'high' : 'medium',
        category: 'views',
        target: `.docpath/${filename}`,
        message: suggestion,
        actionCommand: 'docpath docs scan',
      });
    }

    items.push({
      name: filename,
      category: 'views',
      path: p,
      displayPath: `.docpath/${filename}`,
      tokens,
      lines,
      bytes,
      status,
      thresholdTokens: fileThreshold,
      suggestion,
    });
  }
  return items;
}

async function collectDocsBudget(cwd: string): Promise<BudgetItem[]> {
  const items: BudgetItem[] = [];
  try {
    const docIndex = await readProjectDocumentIndex(cwd);
    if (docIndex && Array.isArray(docIndex.entries)) {
      for (const entry of docIndex.entries) {
        if (!entry.path.startsWith('rules/') && !entry.path.startsWith('workspace/') && !entry.path.startsWith('tasks/current/')) {
          const tokens = entry.token_estimate || 0;
          const status = determineStatus(tokens, BUDGET_THRESHOLDS.docs.fileTokens);
          items.push({
            name: entry.path,
            category: 'docs',
            path: entry.path,
            displayPath: entry.path,
            tokens,
            lines: 0,
            bytes: 0,
            status,
            thresholdTokens: BUDGET_THRESHOLDS.docs.fileTokens,
          });
        }
      }
    }
  } catch {
    // 容错
  }
  return items;
}

/**
 * 收集与分析工作区所有上下文源的 Token 消耗与健康度
 */
export async function collectContextBudget(cwd: string): Promise<BudgetReport> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const activeTaskId = state?.task_id || null;
  const suggestions: BudgetSuggestion[] = [];

  const [ruleItems, activeTaskItems, governanceItems, eventItems, viewItems, docItems] = await Promise.all([
    collectRulesBudget(docpathDir, suggestions),
    collectActiveTaskBudget(docpathDir, suggestions),
    collectGovernanceBudget(docpathDir, suggestions),
    collectEventsBudget(docpathDir, suggestions),
    collectViewsBudget(docpathDir, suggestions),
    collectDocsBudget(cwd),
  ]);

  const buildSummary = (
    category: string,
    label: string,
    items: BudgetItem[],
    threshold: number,
  ): BudgetCategorySummary => {
    // 解耦人类渲染视图与机读真源的重复叠加：若有真源存在，过滤掉重复视图以得到真实 Agent 输入 tokens
    const effectiveItems = items.some((i) => i.isRenderedView)
      ? items.filter((i) => !i.isRenderedView)
      : items;
    const totalTokens = effectiveItems.reduce((acc, i) => acc + i.tokens, 0);
    const totalLines = items.reduce((acc, i) => acc + i.lines, 0);
    const totalBytes = items.reduce((acc, i) => acc + i.bytes, 0);
    const status = determineCategoryStatus(effectiveItems, totalTokens, threshold);
    return {
      category,
      label,
      totalTokens,
      totalLines,
      totalBytes,
      percentage: 0,
      itemCount: items.length,
      status,
      thresholdTokens: threshold,
      items,
    };
  };

  const categories = {
    rules: buildSummary('rules', '规则体系 (Rules)', ruleItems, BUDGET_THRESHOLDS.rules.categoryTokens),
    active_task: buildSummary('active_task', '当前活跃任务 (Active Task)', activeTaskItems, BUDGET_THRESHOLDS.active_task.categoryTokens),
    governance: buildSummary('governance', '架构决策 (Governance/ADR)', governanceItems, BUDGET_THRESHOLDS.governance.categoryTokens),
    events: buildSummary('events', '执行轨迹 (Events/Breadcrumbs)', eventItems, BUDGET_THRESHOLDS.events.categoryTokens),
    views: buildSummary('views', '渲染视图与索引 (Views/Index)', viewItems, BUDGET_THRESHOLDS.views.categoryTokens),
    docs: buildSummary('docs', '活文档库 (Living Docs)', docItems, BUDGET_THRESHOLDS.docs.categoryTokens),
  };

  const totalTokens = Object.values(categories).reduce((acc, c) => acc + c.totalTokens, 0);
  const totalLines = Object.values(categories).reduce((acc, c) => acc + c.totalLines, 0);
  const totalBytes = Object.values(categories).reduce((acc, c) => acc + c.totalBytes, 0);

  if (totalTokens > 0) {
    for (const c of Object.values(categories)) {
      c.percentage = Math.round((c.totalTokens / totalTokens) * 100);
    }
  }

  const allCategoryStatuses = Object.values(categories).map((c) => c.status);
  let overallStatus: BudgetStatus = 'healthy';
  if (allCategoryStatuses.includes('critical')) {
    overallStatus = 'critical';
  } else if (allCategoryStatuses.includes('warning')) {
    overallStatus = 'warning';
  }

  const allItems: BudgetItem[] = [
    ...ruleItems,
    ...activeTaskItems,
    ...governanceItems,
    ...eventItems,
    ...viewItems,
    ...docItems,
  ];
  const topConsumers = allItems.sort((a, b) => b.tokens - a.tokens).slice(0, 5);

  return {
    overallStatus,
    totalTokens,
    totalLines,
    totalBytes,
    activeTask: activeTaskId,
    categories,
    topConsumers,
    suggestions,
  };
}

/**
 * 将预算报告渲染为美观的终端可视化视图
 */
export function renderBudgetTable(report: BudgetReport): string {
  const lines: string[] = [];

  const statusBadge =
    report.overallStatus === 'healthy'
      ? '🟢 HEALTHY (健康)'
      : report.overallStatus === 'warning'
      ? '🟡 WARNING (轻度膨胀)'
      : '🔴 CRITICAL (严重超标)';

  lines.push('');
  lines.push(`📊  DocPath 上下文 Token 预算透视看板 [状态: ${statusBadge}]`);
  lines.push(`    总预估 Token: ${report.totalTokens.toLocaleString()} | 总行数: ${report.totalLines.toLocaleString()} | 活跃任务: ${report.activeTask || '无'}`);
  lines.push('');

  // 1. ASCII 占比进度条可视化
  lines.push('─'.repeat(72));
  lines.push('📈 上下文来源分布 (Token Share):');
  lines.push('');

  const renderBar = (pct: number, width: number = 24) => {
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  for (const cat of Object.values(report.categories)) {
    const bar = renderBar(cat.percentage);
    const icon = cat.status === 'healthy' ? '🟢' : cat.status === 'warning' ? '🟡' : '🔴';
    const pctStr = `${cat.percentage}%`.padStart(4);
    const tokenStr = `${cat.totalTokens.toLocaleString()} tokens`.padEnd(14);
    lines.push(`  ${icon} ${cat.label.padEnd(28)} [${bar}] ${pctStr} (${tokenStr})`);
  }
  lines.push('');

  // 2. 细分明细表
  lines.push('─'.repeat(72));
  lines.push('📑 分类健康度与配额详情:');
  lines.push('');
  lines.push('  分类名称                     文件数   Token / 上限       状态       占比');
  lines.push('  ──────────────────────────────────────────────────────────────────');

  for (const cat of Object.values(report.categories)) {
    const icon = cat.status === 'healthy' ? '🟢 正常' : cat.status === 'warning' ? '🟡 警告' : '🔴 超标';
    const quota = `${cat.totalTokens.toLocaleString()} / ${cat.thresholdTokens.toLocaleString()}`.padEnd(18);
    const count = `${cat.itemCount} 个`.padEnd(8);
    const pct = `${cat.percentage}%`.padStart(4);
    lines.push(`  ${cat.label.padEnd(26)} ${count} ${quota} ${icon.padEnd(10)} ${pct}`);
  }
  lines.push('');

  // 3. Top Token 消费者
  if (report.topConsumers.length > 0) {
    lines.push('─'.repeat(72));
    lines.push('🔥 Top Token 消耗源:');
    lines.push('');
    for (let i = 0; i < report.topConsumers.length; i++) {
      const item = report.topConsumers[i];
      const icon = item.status === 'healthy' ? '✓' : '⚠️';
      const viewNote = item.isRenderedView ? ' [渲染视图]' : '';
      lines.push(`  ${i + 1}. [${icon}] ${item.displayPath} — ${item.tokens.toLocaleString()} tokens (${item.lines} 行)${viewNote}`);
    }
    lines.push('');
  }

  // 4. 优化与瘦身建议
  if (report.suggestions.length > 0) {
    lines.push('─'.repeat(72));
    lines.push('💡 智能瘦身与剪枝建议:');
    lines.push('');
    for (const sug of report.suggestions) {
      const tag = sug.severity === 'high' ? '🔴 [高优先]' : sug.severity === 'medium' ? '🟡 [建议]' : 'ℹ️ [提示]';
      lines.push(`  ${tag} ${sug.target}`);
      lines.push(`     原因: ${sug.message}`);
      if (sug.actionCommand) {
        lines.push(`     快捷命令: \`${sug.actionCommand}\``);
      }
      lines.push('');
    }
  } else {
    lines.push('─'.repeat(72));
    lines.push('✨ 当前上下文极度紧凑健康，无需额外剪枝优化！\n');
  }

  return lines.join('\n');
}
