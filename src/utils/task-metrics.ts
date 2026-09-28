/**
 * Task Metrics & Efficiency Telemetry Engine (Layer 1 Utils)
 *
 * Tracks task cycle time, pass rates, code diffs, and context token efficiency.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, appendFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gitSyncOptional } from './git-run.js';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { estimateTokens } from './document-index.js';

export interface TaskMetrics {
  taskId: string;
  taskTitle: string;
  backlogId: string | null;
  profile: 'quick' | 'standard';
  level: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  durationMinutes: number;
  totalSteps: number;
  passedSteps: number;
  blockedSteps: number;
  firstTimePassRate: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalDiffLines: number;
  estimatedContextTokens: number;
  tokensPerDiffLine: number;
}

export interface TaskMetricsSummary {
  totalTasks: number;
  avgDurationMinutes: number;
  avgFirstTimePassRate: number;
  avgTokensPerTask: number;
  avgTokensPerLine: number;
  totalLinesChanged: number;
  quickCount: number;
  standardCount: number;
  recentTasks: TaskMetrics[];
}

export interface TaskMetricsOptions {
  cwd: string;
  limit?: number;
  agent?: boolean;
  json?: boolean;
}

/**
 * 提取 Git Diff 行数统计
 */
function getTaskDiffStats(cwd: string): { filesChanged: number; linesAdded: number; linesDeleted: number } {
  try {
    const diffStat = gitSyncOptional(cwd, ['diff', '--stat', 'HEAD~1...HEAD']) || '';
    const match = diffStat.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
    if (match) {
      return {
        filesChanged: parseInt(match[1] || '0', 10),
        linesAdded: parseInt(match[2] || '0', 10),
        linesDeleted: parseInt(match[3] || '0', 10),
      };
    }
    // 回退到当前暂存区/工作区状态
    const statusOut = gitSyncOptional(cwd, ['status', '--porcelain']) || '';
    const lines = statusOut.split('\n').filter(Boolean);
    return {
      filesChanged: lines.length,
      linesAdded: lines.length * 15, // 估算
      linesDeleted: 0,
    };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
  }
}

/**
 * 从任务目录结构化数据收集指标
 */
export async function collectTaskMetrics(
  cwd: string,
  taskId: string,
  completedAtTime?: Date,
): Promise<TaskMetrics> {
  const docpathDir = await resolveDocpathDir(cwd);
  const now = completedAtTime || new Date();
  const taskDir = existsSync(join(docpathDir, 'tasks', taskId))
    ? join(docpathDir, 'tasks', taskId)
    : existsSync(join(docpathDir, 'tasks', 'done', taskId))
      ? join(docpathDir, 'tasks', 'done', taskId)
      : join(docpathDir, 'tasks', 'current');

  let taskTitle = taskId;
  let backlogId: string | null = null;
  let profile: 'quick' | 'standard' = 'standard';
  let level = 2;
  let startedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  let totalSteps = 1;
  let passedSteps = 1;
  let blockedSteps = 0;
  let specTokens = 500;
  let planTokens = 300;

  // 1. 读取 spec.json
  const specJsonPath = join(taskDir, 'spec.json');
  if (existsSync(specJsonPath)) {
    try {
      const spec = JSON.parse(await readFile(specJsonPath, 'utf-8'));
      if (spec.title) taskTitle = spec.title;
      if (spec.backlog_id) backlogId = spec.backlog_id;
      specTokens = estimateTokens(JSON.stringify(spec));
    } catch {
      // 容错
    }
  }

  // 2. 读取 plan.json
  const planJsonPath = join(taskDir, 'plan.json');
  if (existsSync(planJsonPath)) {
    try {
      const plan = JSON.parse(await readFile(planJsonPath, 'utf-8'));
      if (Array.isArray(plan.steps)) {
        totalSteps = Math.max(1, plan.steps.length);
        passedSteps = plan.steps.filter((s: { status?: string }) => s.status === 'done').length || totalSteps;
      }
      planTokens = estimateTokens(JSON.stringify(plan));
    } catch {
      // 容错
    }
  }

  // 3. 读取 state.json
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf-8'));
      if (state.workflow_profile === 'quick') profile = 'quick';
      if (typeof state.level === 'number') level = state.level;
      if (state.started_at) startedAt = state.started_at;
      if (state.task_title && taskTitle === taskId) taskTitle = state.task_title;
      if (state.backlog_id && !backlogId) backlogId = state.backlog_id;
    } catch {
      // 容错
    }
  }

  // 4. 读取 breadcrumb.jsonl
  const breadcrumbPath = join(taskDir, 'breadcrumb.jsonl');
  if (existsSync(breadcrumbPath)) {
    try {
      const content = await readFile(breadcrumbPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      if (lines.length > 0) {
        const first = JSON.parse(lines[0]);
        if (first.timestamp) startedAt = first.timestamp;
        for (const line of lines) {
          const entry = JSON.parse(line);
          if (entry.status === 'blocked') blockedSteps++;
        }
      }
    } catch {
      // 容错
    }
  }

  // 5. 计算时间与通过率
  const startTime = new Date(startedAt).getTime();
  const endTime = now.getTime();
  const durationSeconds = Math.max(10, Math.round((endTime - startTime) / 1000));
  const durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));
  const firstTimePassRate = totalSteps > 0
    ? Math.max(0, Math.round(((totalSteps - Math.min(blockedSteps, totalSteps)) / totalSteps) * 100))
    : 100;

  // 6. Diff 统计
  const diff = getTaskDiffStats(cwd);
  const totalDiffLines = diff.linesAdded + diff.linesDeleted;

  // 7. Token 估算：任务期间平均各步骤上下文（基线+文档+spec/plan+事件流）累加
  const baseStepContext = profile === 'quick' ? 1200 : 2500;
  const estimatedContextTokens = (baseStepContext + specTokens + planTokens) * (passedSteps + blockedSteps);
  const tokensPerDiffLine = totalDiffLines > 0
    ? Math.round(estimatedContextTokens / totalDiffLines)
    : estimatedContextTokens;

  return {
    taskId,
    taskTitle,
    backlogId,
    profile,
    level,
    startedAt,
    completedAt: now.toISOString(),
    durationSeconds,
    durationMinutes,
    totalSteps,
    passedSteps,
    blockedSteps,
    firstTimePassRate,
    filesChanged: diff.filesChanged,
    linesAdded: diff.linesAdded,
    linesDeleted: diff.linesDeleted,
    totalDiffLines,
    estimatedContextTokens,
    tokensPerDiffLine,
  };
}

/**
 * 持久化任务度量数据
 */
export async function persistTaskMetrics(
  cwd: string,
  metrics: TaskMetrics,
): Promise<void> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const taskDir = join(docpathDir, 'tasks', metrics.taskId);
    const doneTaskDir = join(docpathDir, 'tasks', 'done', metrics.taskId);
    const targetDir = existsSync(taskDir) ? taskDir : existsSync(doneTaskDir) ? doneTaskDir : join(docpathDir, 'tasks', 'current');

    // 写入单任务 metrics.json
    await mkdir(targetDir, { recursive: true });
    await writeFileAtomic(join(targetDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

    // 追加到全局 task-metrics.jsonl
    const globalPath = join(docpathDir, 'workspace', 'task-metrics.jsonl');
    await appendFile(globalPath, `${JSON.stringify(metrics)}\n`, 'utf-8');
  } catch {
    // 容错非致命
  }
}

/**
 * 汇总全仓历史任务度量数据
 */
export async function aggregateTaskMetrics(
  cwd: string,
  limit: number = 10,
): Promise<TaskMetricsSummary> {
  const docpathDir = await resolveDocpathDir(cwd);
  const tasks: TaskMetrics[] = [];
  const globalPath = join(docpathDir, 'workspace', 'task-metrics.jsonl');

  // 优先从全局 task-metrics.jsonl 读取
  if (existsSync(globalPath)) {
    try {
      const raw = await readFile(globalPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          tasks.push(JSON.parse(line));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  // 扫描 tasks/done 目录中的 metrics.json 补充
  const doneDir = join(docpathDir, 'tasks', 'done');
  if (existsSync(doneDir)) {
    try {
      const entries = await readdir(doneDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metricsPath = join(doneDir, entry.name, 'metrics.json');
        if (existsSync(metricsPath) && !tasks.some((t) => t.taskId === entry.name)) {
          try {
            tasks.push(JSON.parse(await readFile(metricsPath, 'utf-8')));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  tasks.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      avgDurationMinutes: 0,
      avgFirstTimePassRate: 100,
      avgTokensPerTask: 0,
      avgTokensPerLine: 0,
      totalLinesChanged: 0,
      quickCount: 0,
      standardCount: 0,
      recentTasks: [],
    };
  }

  const quickCount = tasks.filter((t) => t.profile === 'quick').length;
  const standardCount = totalTasks - quickCount;
  const totalDuration = tasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  const totalPassRate = tasks.reduce((sum, t) => sum + (t.firstTimePassRate || 100), 0);
  const totalTokens = tasks.reduce((sum, t) => sum + (t.estimatedContextTokens || 0), 0);
  const totalLines = tasks.reduce((sum, t) => sum + (t.totalDiffLines || 0), 0);

  return {
    totalTasks,
    avgDurationMinutes: parseFloat((totalDuration / totalTasks).toFixed(1)),
    avgFirstTimePassRate: Math.round(totalPassRate / totalTasks),
    avgTokensPerTask: Math.round(totalTokens / totalTasks),
    avgTokensPerLine: totalLines > 0 ? Math.round(totalTokens / totalLines) : 0,
    totalLinesChanged: totalLines,
    quickCount,
    standardCount,
    recentTasks: tasks.slice(0, limit),
  };
}
