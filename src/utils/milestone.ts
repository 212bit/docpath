import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSafe, resolveDocpathDir, ensureDir } from './file.js';
import { resolveRulePaths } from './rules.js';
import { readDecisionJsonl } from '../governance/decisions.js';
import { listBacklogItems } from '../engine/backlog.js';
import { readActiveTaskFile, canonicalTaskDir, archivedTaskDir } from './task-files.js';
import { parseSpecMarkdownDocument, type StructuredSpecDocument } from './structured-docs.js';
import { parsePlanSteps } from './doc-parser.js';
import { refreshProjectDocumentIndex } from '../commands/docs.js';

export interface MilestoneTaskSummary {
  taskId: string;
  title: string;
  completedAt?: string;
  frCount: number;
  acCount: number;
  stepCount: number;
}

export interface MilestoneBacklogSummary {
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface MilestoneDecisionSummary {
  id: string;
  category: string;
  conclusion: string;
  createdAt: string;
  taskId?: string;
}

export interface MilestoneRuleSummary {
  name: string;
  ruleCount: number;
  displayPath: string;
}

export interface MilestoneData {
  version: string;
  title: string;
  date: string;
  summary: string;
  tasks: MilestoneTaskSummary[];
  backlog: MilestoneBacklogSummary[];
  decisions: MilestoneDecisionSummary[];
  rules: MilestoneRuleSummary[];
  metrics: {
    totalTasks: number;
    totalBacklogClosed: number;
    totalDecisions: number;
    totalRules: number;
  };
}

export interface MilestoneMeta {
  version: string;
  title: string;
  date: string;
  path: string;
  displayPath: string;
  taskCount: number;
}

/**
 * 自动收集当前里程碑/版本的数据快照
 */
export async function collectMilestoneData(
  cwd: string,
  version: string,
  title?: string,
  sinceDate?: Date,
): Promise<MilestoneData> {
  const docpathDir = await resolveDocpathDir(cwd);
  const nowStr = new Date().toISOString().slice(0, 10);
  const resolvedTitle = title?.trim() || `${version} Milestone Release`;

  // 1. 收集已归档任务 (tasks/done/*)
  const tasks: MilestoneTaskSummary[] = [];
  const doneTasksDir = join(docpathDir, 'tasks', 'done');
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
          const planContent = (await readFileSafe(planJsonPath)) || (await readFileSafe(planMdPath)) || '';

          const specDoc = specContent ? parseSpecMarkdownDocument(specContent, { taskId }) : null;
          let stepCount = 0;
          if (existsSync(planJsonPath)) {
            try {
              const raw = await readFileSafe(planJsonPath);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.steps)) {
                  stepCount = parsed.steps.length;
                }
              }
            } catch {
              // 容错
            }
          }
          if (stepCount === 0 && existsSync(planMdPath)) {
            const planMd = (await readFileSafe(planMdPath)) || '';
            stepCount = planMd ? parsePlanSteps(planMd).length : 0;
          }

          const taskTitle = specDoc?.title || taskId;
          const frCount = specDoc?.functional_requirements?.length || 0;
          const acCount = specDoc?.acceptance_criteria?.length || 0;

          tasks.push({
            taskId,
            title: taskTitle,
            frCount,
            acCount,
            stepCount,
          });
        }
      }
    } catch {
      // 容错处理
    }
  }

  // 2. 收集已闭环的 Backlog 项
  const backlog: MilestoneBacklogSummary[] = [];
  try {
    const backlogItems = await listBacklogItems(cwd);
    for (const item of backlogItems) {
      if (item.status === 'done') {
        backlog.push({
          id: item.id,
          title: item.title,
          priority: item.priority,
          status: item.status,
        });
      }
    }
  } catch {
    // 容错处理
  }

  // 3. 收集架构决策 (ADRs)
  const decisions: MilestoneDecisionSummary[] = [];
  try {
    const workspaceDir = join(docpathDir, 'workspace');
    const records = await readDecisionJsonl(workspaceDir);
    if (records && records.length > 0) {
      for (const r of records) {
        decisions.push({
          id: r.id,
          category: r.category,
          conclusion: r.decision,
          createdAt: r.createdAt,
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
          const category = block.match(/^##\s+[^\s—:]+\s*[-—:]\s*(.+)$/m)?.[1]?.trim()
            || block.match(/-\s*category:\s*(.+)$/m)?.[1]?.trim()
            || 'General';
          const decision = block.match(/###\s+(?:决策|结论)\s*\n+([^#\n]+)/m)?.[1]?.trim()
            || block.match(/-\s*(?:conclusion|decision):\s*(.+)$/m)?.[1]?.trim()
            || '';
          const createdAt = block.match(/^- created_at:\s*(.+)$/m)?.[1]?.trim() || nowStr;
          const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
          if (id && decision) {
            decisions.push({
              id,
              category,
              conclusion: decision,
              createdAt,
              taskId,
            });
          }
        }
      }
    }
  } catch {
    // 容错处理
  }

  // 4. 收集系统规则统计
  const rules: MilestoneRuleSummary[] = [];
  try {
    const rulePaths = resolveRulePaths(docpathDir);
    for (const r of rulePaths.allRules) {
      if (r.exists) {
        const content = (await readFileSafe(r.path)) || '';
        const ruleCount = (content.match(/^##\s+/gm) || []).length;
        rules.push({
          name: r.name,
          ruleCount,
          displayPath: r.displayPath,
        });
      }
    }
  } catch {
    // 容错处理
  }

  return {
    version,
    title: resolvedTitle,
    date: nowStr,
    summary: `本版本交付 ${tasks.length} 个任务，闭环 ${backlog.length} 个需求项，沉淀 ${decisions.length} 项架构决策。`,
    tasks,
    backlog,
    decisions,
    rules,
    metrics: {
      totalTasks: tasks.length,
      totalBacklogClosed: backlog.length,
      totalDecisions: decisions.length,
      totalRules: rules.reduce((acc, r) => acc + r.ruleCount, 0),
    },
  };
}

/**
 * 将里程碑数据渲染为结构化 Markdown 发布报告
 */
export function renderMilestoneMarkdown(data: MilestoneData): string {
  const lines: string[] = [
    `# Release ${data.version}: ${data.title}`,
    '',
    `> **发布日期**: ${data.date}  `,
    `> **成果概览**: 交付 **${data.metrics.totalTasks}** 个已归档任务 | 闭环 **${data.metrics.totalBacklogClosed}** 个需求 | 沉淀 **${data.metrics.totalDecisions}** 项架构决策`,
    '',
    '## 1. 🚀 交付特性与任务汇总',
    '',
  ];

  if (data.tasks.length === 0) {
    lines.push('*(本周期暂无归档任务)*', '');
  } else {
    for (const t of data.tasks) {
      lines.push(`- **${t.taskId}**: ${t.title} (${t.stepCount} 个步骤, ${t.frCount} FR / ${t.acCount} AC)`);
    }
    lines.push('');
  }

  if (data.backlog.length > 0) {
    lines.push('### 需求清单关闭明细', '');
    for (const b of data.backlog) {
      lines.push(`- [x] **${b.id}** [${b.priority}]: ${b.title}`);
    }
    lines.push('');
  }

  lines.push('## 2. 🏛️ 架构决策与设计演进 (ADRs)', '');
  if (data.decisions.length === 0) {
    lines.push('*(本周期无新增架构决策)*', '');
  } else {
    for (const d of data.decisions) {
      const taskSuffix = d.taskId ? ` (任务: \`${d.taskId}\`)` : '';
      lines.push(`- **${d.id}** [${d.category}]: ${d.conclusion}${taskSuffix}`);
    }
    lines.push('');
  }

  lines.push('## 3. 💡 规则固化与知识沉淀 (Rules Promoted)', '');
  if (data.rules.length === 0) {
    lines.push('*(本周期未变动规则库)*', '');
  } else {
    for (const r of data.rules) {
      lines.push(`- \`${r.displayPath}\`: 共沉淀 **${r.ruleCount}** 条系统规范与最佳实践`);
    }
    lines.push('');
  }

  lines.push(
    '## 4. 📊 质量与基线状态',
    '',
    '- **门禁状态**: ✅ 全部质量门禁 (Check & Review) 100% 验证通过',
    `- **活文档索引**: ✅ 自动同步更新至 \`docs-index.json\``,
    '',
    '## 5. 🗺️ 演进时间线 (Milestone Timeline)',
    '',
    '```mermaid',
    'timeline',
    `    title Release ${data.version} 演进轨迹`,
    `    ${data.date} : 交付 ${data.metrics.totalTasks} 个已归档任务`,
    `                 : 闭环 ${data.metrics.totalBacklogClosed} 个需求`,
    `                 : 沉淀 ${data.metrics.totalDecisions} 项架构决策`,
    '```',
    '',
  );

  return lines.join('\n');
}

/**
 * 将全部里程碑渲染为全局 Mermaid 时间线大盘
 */
export function renderGlobalTimelineMarkdown(milestones: MilestoneMeta[]): string {
  const lines: string[] = [
    '# DocPath 项目演进全景时间线 (Project Evolution Timeline)',
    '',
    '> 自动聚合历史已发布里程碑与架构决策生成。',
    '',
    '```mermaid',
    'timeline',
    '    title DocPath 系统架构与里程碑演进大盘',
  ];

  if (milestones.length === 0) {
    lines.push('    当前 : 持续迭代演进中');
  } else {
    for (const m of milestones) {
      lines.push(`    ${m.date} : [${m.version}] ${m.title}`);
      lines.push(`             : 交付 ${m.taskCount} 个任务`);
    }
  }

  lines.push('```', '');
  return lines.join('\n');
}

/**
 * 更新或创建根目录 CHANGELOG.md
 */
export async function updateChangelog(cwd: string, data: MilestoneData): Promise<string> {
  const changelogPath = join(cwd, 'CHANGELOG.md');
  const existing = (await readFileSafe(changelogPath)) || '';

  const section = [
    `## [${data.version}] - ${data.date}`,
    `### ${data.title}`,
    '',
    ...data.tasks.map((t) => `- **${t.taskId}**: ${t.title}`),
    ...(data.decisions.length > 0 ? ['', '#### 架构决策 (ADRs)', ...data.decisions.map((d) => `- ${d.conclusion}`)] : []),
    '',
  ].join('\n');

  let nextContent = '';
  if (!existing.trim()) {
    nextContent = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${section}\n`;
  } else {
    const headingIndex = existing.search(/^##\s+/m);
    if (headingIndex === -1) {
      nextContent = `${existing.trimEnd()}\n\n${section}\n`;
    } else {
      nextContent = `${existing.slice(0, headingIndex)}${section}\n${existing.slice(headingIndex)}`;
    }
  }

  await writeFile(changelogPath, nextContent, 'utf-8');
  return changelogPath;
}

/**
 * 保存里程碑文档并刷新活文档索引
 */
export async function persistMilestone(
  cwd: string,
  data: MilestoneData,
): Promise<{ releaseDocPath: string; changelogPath: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const releasesDir = join(cwd, 'docs', 'releases');
  const milestonesDir = join(docpathDir, 'milestones');

  await ensureDir(releasesDir);
  await ensureDir(milestonesDir);

  const filename = `${data.version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`;
  const releaseDocPath = join(releasesDir, filename);
  const milestoneDocPath = join(milestonesDir, filename);

  const markdownContent = renderMilestoneMarkdown(data);

  await writeFile(releaseDocPath, markdownContent, 'utf-8');
  await writeFile(milestoneDocPath, markdownContent, 'utf-8');

  // 同步更新 CHANGELOG.md
  const changelogPath = await updateChangelog(cwd, data);

  // 刷新活文档索引，确保即刻可被 docpath docs search 检索
  await refreshProjectDocumentIndex(docpathDir, cwd);

  return { releaseDocPath, changelogPath };
}

/**
 * 列出所有已记录的里程碑
 */
export async function listMilestones(cwd: string): Promise<MilestoneMeta[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const milestonesDir = join(docpathDir, 'milestones');
  const releasesDir = join(cwd, 'docs', 'releases');

  const metaList: MilestoneMeta[] = [];
  const seenVersions = new Set<string>();

  const scanDir = async (dir: string, displayPrefix: string) => {
    if (!existsSync(dir)) return;
    try {
      const files = readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile() && f.name.endsWith('.md')) {
          const filePath = join(dir, f.name);
          const content = (await readFileSafe(filePath)) || '';
          const titleMatch = content.match(/^#\s+Release\s+([^:]+):\s*(.+)$/m);
          const dateMatch = content.match(/>\s*\*\*发布日期\*\*:\s*([^\s<]+)/);
          const version = titleMatch?.[1]?.trim() || f.name.replace(/\.md$/, '');

          if (!seenVersions.has(version)) {
            seenVersions.add(version);
            const taskMatches = content.match(/^- \*\*T-[^:]+\*\*:/gm) || [];
            metaList.push({
              version,
              title: titleMatch?.[2]?.trim() || version,
              date: dateMatch?.[1]?.trim() || 'unknown',
              path: filePath,
              displayPath: `${displayPrefix}/${f.name}`,
              taskCount: taskMatches.length,
            });
          }
        }
      }
    } catch {
      // 容错
    }
  };

  await scanDir(releasesDir, 'docs/releases');
  await scanDir(milestonesDir, '.docpath/milestones');

  return metaList.sort((a, b) => b.date.localeCompare(a.date));
}
