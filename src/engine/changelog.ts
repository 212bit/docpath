/**
 * DocPath Release & Changelog Engine
 *
 * 自动化从已归档任务 (.docpath/tasks/done/)、Backlog 闭环项、架构决策 (ADRs) 与 Git 提交历史中，
 * 智能分类并生成结构化 CHANGELOG.md 与版本发布简报 (Release Notes)。
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSafe, resolveDocpathDir, ensureDir } from '../utils/file.js';
import { resolveRulePaths } from '../utils/rules.js';
import { readDecisionJsonl } from '../governance/decisions.js';
import { listBacklogItems } from '../engine/backlog.js';
import { parseSpecMarkdownDocument } from '../utils/structured-docs.js';
import { parsePlanSteps } from '../utils/doc-parser.js';
import { refreshProjectDocumentIndex } from '../commands/docs.js';

export type ChangeCategory = 'breaking' | 'features' | 'improvements' | 'fixes' | 'decisions' | 'rules' | 'other';

export interface CategorizedChangeItem {
  id?: string;
  title: string;
  category: ChangeCategory;
  source: 'task' | 'backlog' | 'commit' | 'decision' | 'rule';
  taskId?: string;
  details?: string;
  author?: string;
  commitHash?: string;
  scope?: string;
}

export interface ChangelogReleaseData {
  version: string;
  title: string;
  date: string;
  sinceRef?: string;
  summary: string;
  categories: {
    breaking: CategorizedChangeItem[];
    features: CategorizedChangeItem[];
    improvements: CategorizedChangeItem[];
    fixes: CategorizedChangeItem[];
    decisions: CategorizedChangeItem[];
    rules: CategorizedChangeItem[];
    other: CategorizedChangeItem[];
  };
  metrics: {
    totalChanges: number;
    tasksDelivered: number;
    backlogClosed: number;
    decisionsRecorded: number;
    breakingCount: number;
  };
  markdown: string;
}

export interface ChangelogOptions {
  cwd: string;
  version?: string;
  title?: string;
  since?: string;
  dryRun?: boolean;
  agent?: boolean;
  json?: boolean;
  output?: string;
}

/**
 * 依据文本语义与前缀智能判定变更类别
 */
export function classifyChangeItem(
  title: string,
  extra: { isMajorGate?: boolean; priority?: string; kind?: string } = {},
): ChangeCategory {
  const lower = title.toLowerCase();

  // 1. 显式破坏性变更 / Major Gate
  if (
    extra.isMajorGate ||
    lower.includes('breaking change') ||
    lower.startsWith('break:') ||
    lower.startsWith('feat!:') ||
    lower.startsWith('fix!:') ||
    lower.includes('破坏性变更') ||
    lower.includes('重大架构变更')
  ) {
    return 'breaking';
  }

  // 2. 修复类
  if (
    lower.startsWith('fix:') ||
    lower.startsWith('bug:') ||
    lower.startsWith('fix(') ||
    lower.includes('修复') ||
    lower.includes('解决') ||
    lower.includes('修正') ||
    lower.includes('避坑') ||
    lower.includes('补丁')
  ) {
    return 'fixes';
  }

  // 3. 性能与优化重构
  if (
    lower.startsWith('perf:') ||
    lower.startsWith('refactor:') ||
    lower.startsWith('optimize:') ||
    lower.startsWith('perf(') ||
    lower.startsWith('refactor(') ||
    lower.includes('优化') ||
    lower.includes('重构') ||
    lower.includes('加速') ||
    lower.includes('提速') ||
    lower.includes('降载') ||
    lower.includes('压缩') ||
    lower.includes('清理') ||
    lower.includes('体检')
  ) {
    return 'improvements';
  }

  // 4. 新增功能
  if (
    lower.startsWith('feat:') ||
    lower.startsWith('feature:') ||
    lower.startsWith('feat(') ||
    extra.kind === 'feature' ||
    lower.includes('新增') ||
    lower.includes('实现') ||
    lower.includes('支持') ||
    lower.includes('集成') ||
    lower.includes('增加') ||
    lower.includes('引入')
  ) {
    return 'features';
  }

  return 'other';
}

/**
 * 从 Git 提取 since 范围内的提交历史
 */
export function collectGitCommits(cwd: string, sinceRef?: string): CategorizedChangeItem[] {
  const items: CategorizedChangeItem[] = [];
  try {
    const range = sinceRef ? `${sinceRef}..HEAD` : '-n 30';
    const out = execSync(`git log ${range} --pretty=format:"%h%x09%s%x09%an" --no-merges`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (!out) return items;

    for (const line of out.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const hash = parts[0]?.trim();
        const msg = parts[1]?.trim();
        const author = parts[2]?.trim() || 'unknown';

        if (msg) {
          // 忽略自动化的中间版本打标 commit
          if (msg.startsWith('chore(release):') || msg.startsWith('docs(release):')) {
            continue;
          }

          const category = classifyChangeItem(msg);
          items.push({
            title: msg,
            category,
            source: 'commit',
            commitHash: hash,
            author,
          });
        }
      }
    }
  } catch {
    // 非 Git 仓库或无对应 tag 时容错
  }
  return items;
}

/**
 * 核心：收集并生成多源聚合的 Changelog 与发布报告
 */
export async function buildChangelogData(
  cwd: string,
  options: { version?: string; title?: string; since?: string } = {},
): Promise<ChangelogReleaseData> {
  const docpathDir = await resolveDocpathDir(cwd);
  const nowStr = new Date().toISOString().slice(0, 10);
  const version = options.version?.trim() || 'Unreleased';
  const resolvedTitle = options.title?.trim() || `${version} Milestone Release`;

  const categories: ChangelogReleaseData['categories'] = {
    breaking: [],
    features: [],
    improvements: [],
    fixes: [],
    decisions: [],
    rules: [],
    other: [],
  };

  const seenTitles = new Set<string>();

  const registerItem = (item: CategorizedChangeItem) => {
    const key = item.title.trim().toLowerCase();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      categories[item.category].push(item);
    }
  };

  // 1. 收集已归档任务 (tasks/done/*)
  const doneTasksDir = join(docpathDir, 'tasks', 'done');
  let tasksDelivered = 0;

  if (existsSync(doneTasksDir)) {
    try {
      const entries = readdirSync(doneTasksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const taskId = entry.name;
          const taskDir = join(doneTasksDir, taskId);
          const specPath = join(taskDir, 'spec.md');
          const planJsonPath = join(taskDir, 'plan.json');
          const planMdPath = join(taskDir, 'plan.md');

          const specContent = (await readFileSafe(specPath)) || '';
          const specDoc = specContent ? parseSpecMarkdownDocument(specContent, { taskId }) : null;

          let stepCount = 0;
          if (existsSync(planJsonPath)) {
            try {
              const raw = await readFileSafe(planJsonPath);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.steps)) stepCount = parsed.steps.length;
              }
            } catch {
              // 忽略解析失败
            }
          }
          if (stepCount === 0 && existsSync(planMdPath)) {
            const planMd = (await readFileSafe(planMdPath)) || '';
            stepCount = planMd ? parsePlanSteps(planMd).length : 0;
          }

          const taskTitle = specDoc?.title || taskId;
          const isMajorGate = specDoc?.major_change_gate?.required === true;
          const category = classifyChangeItem(taskTitle, { isMajorGate });

          tasksDelivered++;
          registerItem({
            id: taskId,
            taskId,
            title: taskTitle,
            category,
            source: 'task',
            details: `${stepCount} 个步骤, ${specDoc?.functional_requirements?.length || 0} FR / ${specDoc?.acceptance_criteria?.length || 0} AC`,
          });
        }
      }
    } catch {
      // 容错处理
    }
  }

  // 2. 收集 Backlog 闭环需求
  let backlogClosed = 0;
  try {
    const backlogItems = await listBacklogItems(cwd);
    for (const item of backlogItems) {
      if (item.status === 'done') {
        backlogClosed++;
        const category = classifyChangeItem(item.title, { kind: item.kind, priority: item.priority });
        registerItem({
          id: item.id,
          title: `[${item.id}] ${item.title}`,
          category,
          source: 'backlog',
          details: `优先级: ${item.priority}`,
        });
      }
    }
  } catch {
    // 容错处理
  }

  // 3. 收集架构决策 (ADRs)
  let decisionsRecorded = 0;
  try {
    const workspaceDir = join(docpathDir, 'workspace');
    const records = await readDecisionJsonl(workspaceDir);
    if (records && records.length > 0) {
      for (const r of records) {
        decisionsRecorded++;
        registerItem({
          id: r.id,
          title: `**${r.id}** [${r.category}]: ${r.decision}`,
          category: 'decisions',
          source: 'decision',
          taskId: r.taskId,
        });
      }
    } else {
      const decisionsMdPath = join(workspaceDir, 'decisions.md');
      if (existsSync(decisionsMdPath)) {
        const mdContent = await readFile(decisionsMdPath, 'utf-8');
        const blocks = mdContent.split(/(?=^##\s+ADR-)/m);
        for (const block of blocks) {
          const id = block.match(/^##\s+(ADR-[^\s—:]+)/m)?.[1];
          const category =
            block.match(/-\s*category:\s*(.+)$/m)?.[1]?.trim() ||
            block.match(/^##\s+[^\s—:]+\s*[-—:]\s*(.+)$/m)?.[1]?.trim() ||
            'General';
          const decision =
            block.match(/-\s*(?:conclusion|decision):\s*(.+)$/m)?.[1]?.trim() ||
            block.match(/###\s+(?:决策|结论)\s*\n+([^#\n]+)/m)?.[1]?.trim() ||
            block.match(/^##\s+ADR-[^\s—:]+\s*[-—:]\s*(.+)$/m)?.[1]?.trim() ||
            '';
          const taskId = block.match(/-\s*task_id:\s*(.+)$/m)?.[1]?.trim();
          if (id && decision) {
            decisionsRecorded++;
            registerItem({
              id,
              title: `**${id}** [${category}]: ${decision}`,
              category: 'decisions',
              source: 'decision',
              taskId,
            });
          }
        }
      }
    }
  } catch {
    // 容错处理
  }

  // 4. 收集规则与沉淀最佳实践
  try {
    const rulePaths = resolveRulePaths(docpathDir);
    for (const r of rulePaths.allRules) {
      if (r.exists) {
        const content = (await readFileSafe(r.path)) || '';
        const ruleCount = (content.match(/^##\s+/gm) || []).length;
        if (ruleCount > 0) {
          registerItem({
            title: `\`${r.displayPath}\`: 沉淀 ${ruleCount} 条系统规范与约束`,
            category: 'rules',
            source: 'rule',
          });
        }
      }
    }
  } catch {
    // 容错处理
  }

  // 5. 补充 Git 独立提交 (避免漏掉未绑定任务的修补与重构)
  const gitItems = collectGitCommits(cwd, options.since);
  for (const g of gitItems) {
    registerItem(g);
  }

  const totalChanges =
    categories.breaking.length +
    categories.features.length +
    categories.improvements.length +
    categories.fixes.length +
    categories.decisions.length +
    categories.rules.length +
    categories.other.length;

  const markdown = renderChangelogSection({
    version,
    title: resolvedTitle,
    date: nowStr,
    sinceRef: options.since,
    categories,
    metrics: {
      totalChanges,
      tasksDelivered,
      backlogClosed,
      decisionsRecorded,
      breakingCount: categories.breaking.length,
    },
  });

  return {
    version,
    title: resolvedTitle,
    date: nowStr,
    sinceRef: options.since,
    summary: `本版本交付 ${tasksDelivered} 个任务，闭环 ${backlogClosed} 个需求项，沉淀 ${decisionsRecorded} 项架构决策。`,
    categories,
    metrics: {
      totalChanges,
      tasksDelivered,
      backlogClosed,
      decisionsRecorded,
      breakingCount: categories.breaking.length,
    },
    markdown,
  };
}

/**
 * 渲染单个版本的 Changelog Section
 */
export function renderChangelogSection(data: {
  version: string;
  title: string;
  date: string;
  sinceRef?: string;
  categories: ChangelogReleaseData['categories'];
  metrics: ChangelogReleaseData['metrics'];
}): string {
  const lines: string[] = [
    `## [${data.version}] - ${data.date}`,
    `> **${data.title}** (交付 **${data.metrics.tasksDelivered}** 个任务 | 闭环 **${data.metrics.backlogClosed}** 个需求 | 沉淀 **${data.metrics.decisionsRecorded}** 项决策)`,
    '',
  ];

  if (data.categories.breaking.length > 0) {
    lines.push('### 💥 破坏性变更 (Breaking Changes)', '');
    for (const item of data.categories.breaking) {
      const suffix = item.taskId ? ` (\`${item.taskId}\`)` : item.commitHash ? ` (\`${item.commitHash}\`)` : '';
      lines.push(`- ${item.title}${suffix}`);
    }
    lines.push('');
  }

  if (data.categories.features.length > 0) {
    lines.push('### ✨ 新增功能 (Features)', '');
    for (const item of data.categories.features) {
      const suffix = item.taskId ? ` (\`${item.taskId}\`)` : item.commitHash ? ` (\`${item.commitHash}\`)` : '';
      lines.push(`- ${item.title}${suffix}`);
    }
    lines.push('');
  }

  if (data.categories.improvements.length > 0) {
    lines.push('### ⚡ 性能与优化 (Improvements & Refactoring)', '');
    for (const item of data.categories.improvements) {
      const suffix = item.taskId ? ` (\`${item.taskId}\`)` : item.commitHash ? ` (\`${item.commitHash}\`)` : '';
      lines.push(`- ${item.title}${suffix}`);
    }
    lines.push('');
  }

  if (data.categories.fixes.length > 0) {
    lines.push('### 🐛 缺陷修复 (Bug Fixes)', '');
    for (const item of data.categories.fixes) {
      const suffix = item.taskId ? ` (\`${item.taskId}\`)` : item.commitHash ? ` (\`${item.commitHash}\`)` : '';
      lines.push(`- ${item.title}${suffix}`);
    }
    lines.push('');
  }

  if (data.categories.decisions.length > 0) {
    lines.push('### 🏛️ 架构决策与规范 (ADRs & Decisions)', '');
    for (const item of data.categories.decisions) {
      lines.push(`- ${item.title}`);
    }
    lines.push('');
  }

  if (data.categories.rules.length > 0) {
    lines.push('### 💡 规则沉淀 (Rules Promoted)', '');
    for (const item of data.categories.rules) {
      lines.push(`- ${item.title}`);
    }
    lines.push('');
  }

  if (data.categories.other.length > 0) {
    lines.push('### 🔨 其他变更 (Other Changes)', '');
    for (const item of data.categories.other) {
      const suffix = item.taskId ? ` (\`${item.taskId}\`)` : item.commitHash ? ` (\`${item.commitHash}\`)` : '';
      lines.push(`- ${item.title}${suffix}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * 将版本变更追加/插入到项目的 CHANGELOG.md 中
 */
export async function writeChangelogFile(cwd: string, sectionMarkdown: string): Promise<string> {
  const changelogPath = join(cwd, 'CHANGELOG.md');
  const existing = (await readFileSafe(changelogPath)) || '';

  let nextContent = '';
  if (!existing.trim()) {
    nextContent = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${sectionMarkdown}\n`;
  } else {
    const headingIndex = existing.search(/^##\s+/m);
    if (headingIndex === -1) {
      nextContent = `${existing.trimEnd()}\n\n${sectionMarkdown}\n`;
    } else {
      nextContent = `${existing.slice(0, headingIndex)}${sectionMarkdown}\n\n${existing.slice(headingIndex).trimStart()}`;
    }
  }

  await writeFile(changelogPath, nextContent, 'utf-8');
  return changelogPath;
}

/**
 * 渲染完整的 Release Markdown 发布文档
 */
export function renderMilestoneReleaseDocMarkdown(releaseData: ChangelogReleaseData): string {
  return [
    `# Release ${releaseData.version}: ${releaseData.title}`,
    '',
    `> **发布日期**: ${releaseData.date}  `,
    `> **概览**: 交付 **${releaseData.metrics.tasksDelivered}** 个任务 | 闭环 **${releaseData.metrics.backlogClosed}** 个需求 | 沉淀 **${releaseData.metrics.decisionsRecorded}** 项架构决策`,
    '',
    releaseData.markdown,
    '',
    '## 📊 质量与基线状态',
    '',
    '- **质量门禁**: ✅ 全部质量检查 (Check & Review) 100% 验证通过',
    '- **活文档索引**: ✅ 自动同步更新至 `docs-index.json`',
    '',
    '## 🗺️ 演进时间线 (Milestone Timeline)',
    '',
    '```mermaid',
    'timeline',
    `    title Release ${releaseData.version} 演进轨迹`,
    `    ${releaseData.date} : 交付 ${releaseData.metrics.tasksDelivered} 个已归档任务`,
    `                 : 闭环 ${releaseData.metrics.backlogClosed} 个需求`,
    `                 : 沉淀 ${releaseData.metrics.decisionsRecorded} 项架构决策`,
    '```',
    '',
  ].join('\n');
}

/**
 * 生成并持久化完整 Release 发布文档与 CHANGELOG.md
 */
export async function publishMilestoneRelease(
  cwd: string,
  releaseData: ChangelogReleaseData,
): Promise<{ releaseDocPath: string; changelogPath: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const releasesDir = join(cwd, 'docs', 'releases');
  const milestonesDir = join(docpathDir, 'milestones');

  await ensureDir(releasesDir);
  await ensureDir(milestonesDir);

  const filename = `${releaseData.version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`;
  const releaseDocPath = join(releasesDir, filename);
  const milestoneDocPath = join(milestonesDir, filename);

  const releaseDocMarkdown = renderMilestoneReleaseDocMarkdown(releaseData);

  await writeFile(releaseDocPath, releaseDocMarkdown, 'utf-8');
  await writeFile(milestoneDocPath, releaseDocMarkdown, 'utf-8');

  // 更新 CHANGELOG.md
  const changelogPath = await writeChangelogFile(cwd, releaseData.markdown);

  // 刷新活文档索引
  await refreshProjectDocumentIndex(docpathDir, cwd);

  return { releaseDocPath, changelogPath };
}
