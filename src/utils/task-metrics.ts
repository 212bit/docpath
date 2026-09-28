/**
 * Task Metrics & Efficiency Telemetry Engine (Layer 1 Utils)
 *
 * Tracks objective engineering metrics (cycle time, pass rates, code diffs, turns)
 * and probes real Agent session telemetry (Input/Output/Cached Tokens, costs).
 */

import { existsSync } from 'node:fs';
import { readFile, appendFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { gitSyncOptional } from './git-run.js';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { estimateTokens } from './document-index.js';

export interface RealAgentUsage {
  source: 'antigravity' | 'claude' | 'opencode' | 'env' | 'unknown';
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  costUsd?: number;
  toolCallsCount?: number;
  model?: string;
}

export interface EngineeringMetrics {
  turnCount: number;
  retryCount: number;
  firstTimePassRate: number;
  cycleTimeMinutes: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalDiffLines: number;
  speedLinesPerMinute: number;
}

export interface ProtocolOverhead {
  specTokens: number;
  planTokens: number;
  rulesTokens: number;
  totalInjectedTokens: number;
}

export interface TaskMetrics {
  taskId: string;
  taskTitle: string;
  backlogId: string | null;
  profile: 'quick' | 'standard';
  level: number;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  firstTimePassRate: number;
  totalDiffLines: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  engineering: EngineeringMetrics;
  protocol: ProtocolOverhead;
  realUsage: RealAgentUsage | null;
}

export interface TaskMetricsSummary {
  totalTasks: number;
  avgDurationMinutes: number;
  avgFirstTimePassRate: number;
  avgSpeedLinesPerMinute: number;
  totalLinesChanged: number;
  quickCount: number;
  standardCount: number;
  avgProtocolTokensPerTask: number;
  realUsageSummary: {
    tasksWithRealUsage: number;
    totalRealTokens: number;
    avgRealTokensPerTask: number;
    totalRealCostUsd: number;
  } | null;
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
      linesAdded: lines.length * 15,
      linesDeleted: 0,
    };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
  }
}

/**
 * 探测并提取真实 Agent 会话遥测数据 (Antigravity / Claude Code / 环境变量)
 */
export async function probeRealAgentTelemetry(
  startedAt: string,
  completedAt: string,
): Promise<RealAgentUsage | null> {
  // 1. 优先读取显式环境变量注入
  if (process.env.DOCPATH_AGENT_INPUT_TOKENS || process.env.DOCPATH_AGENT_TOTAL_TOKENS) {
    const inputTokens = parseInt(process.env.DOCPATH_AGENT_INPUT_TOKENS || '0', 10);
    const outputTokens = parseInt(process.env.DOCPATH_AGENT_OUTPUT_TOKENS || '0', 10);
    const totalTokens = parseInt(process.env.DOCPATH_AGENT_TOTAL_TOKENS || `${inputTokens + outputTokens}`, 10);
    const costUsd = process.env.DOCPATH_AGENT_COST_USD ? parseFloat(process.env.DOCPATH_AGENT_COST_USD) : undefined;
    const source = (process.env.DOCPATH_AGENT_SOURCE as RealAgentUsage['source']) || 'env';
    return {
      source,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
    };
  }

  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(completedAt).getTime();

  // 2. 探测 Antigravity / Gemini CLI transcript
  try {
    const appDataDir = process.env.GEMINI_CLI_APP_DATA_DIR || join(homedir(), '.gemini', 'antigravity-cli');
    const brainDir = join(appDataDir, 'brain');
    if (existsSync(brainDir)) {
      const convEntries = await readdir(brainDir, { withFileTypes: true });
      // 寻找最近修改的会话目录
      let latestTranscript: string | null = null;
      let latestMtime = 0;

      for (const conv of convEntries) {
        if (!conv.isDirectory()) continue;
        const transcriptPath = join(brainDir, conv.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (existsSync(transcriptPath)) {
          const s = await stat(transcriptPath);
          if (s.mtimeMs > latestMtime && s.mtimeMs >= startTime - 60000) {
            latestMtime = s.mtimeMs;
            latestTranscript = transcriptPath;
          }
        }
      }

      if (latestTranscript) {
        const content = await readFile(latestTranscript, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        let toolCallsCount = 0;
        let estimatedTokens = 0;

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryTime = entry.created_at ? new Date(entry.created_at).getTime() : 0;
            // 过滤在任务时间窗口内的记录
            if (entryTime >= startTime - 30000 && entryTime <= endTime + 30000) {
              if (Array.isArray(entry.tool_calls)) {
                toolCallsCount += entry.tool_calls.length;
              }
              if (entry.content) {
                estimatedTokens += estimateTokens(entry.content);
              }
            }
          } catch {
            // ignore malformed line
          }
        }

        if (toolCallsCount > 0 || estimatedTokens > 0) {
          const inputTokens = Math.round(estimatedTokens * 0.7);
          const outputTokens = Math.round(estimatedTokens * 0.3);
          return {
            source: 'antigravity',
            inputTokens,
            outputTokens,
            totalTokens: estimatedTokens,
            toolCallsCount,
          };
        }
      }
    }
  } catch {
    // 探针异常容错
  }

  return null;
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
  let turnCount = 0;
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
      turnCount = lines.length;
      if (lines.length > 0) {
        const first = JSON.parse(lines[0]);
        if (first.timestamp) startedAt = first.timestamp;
        for (const line of lines) {
          const entry = JSON.parse(line);
          if (entry.status === 'blocked' || entry.gate_verdict === 'fail') blockedSteps++;
        }
      }
    } catch {
      // 容错
    }
  }

  // 5. 计算客观工程效能指标
  const startTime = new Date(startedAt).getTime();
  const endTime = now.getTime();
  const durationSeconds = Math.max(10, Math.round((endTime - startTime) / 1000));
  const durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));
  const firstTimePassRate = totalSteps > 0
    ? Math.max(0, Math.round(((totalSteps - Math.min(blockedSteps, totalSteps)) / totalSteps) * 100))
    : 100;

  // 6. Diff 统计与交付流速
  const diff = getTaskDiffStats(cwd);
  const totalDiffLines = diff.linesAdded + diff.linesDeleted;
  const speedLinesPerMinute = parseFloat((totalDiffLines / Math.max(0.1, durationMinutes)).toFixed(1));

  // 7. DocPath 协议注入体积 (Protocol Overhead)
  const rulesTokens = profile === 'quick' ? 600 : 1800;
  const totalInjectedTokens = specTokens + planTokens + rulesTokens;

  // 8. 探测真实 Agent 会话遥测
  const realUsage = await probeRealAgentTelemetry(startedAt, now.toISOString());

  const engineering: EngineeringMetrics = {
    turnCount: Math.max(turnCount, totalSteps),
    retryCount: blockedSteps,
    firstTimePassRate,
    cycleTimeMinutes: durationMinutes,
    filesChanged: diff.filesChanged,
    linesAdded: diff.linesAdded,
    linesDeleted: diff.linesDeleted,
    totalDiffLines,
    speedLinesPerMinute,
  };

  const protocol: ProtocolOverhead = {
    specTokens,
    planTokens,
    rulesTokens,
    totalInjectedTokens,
  };

  return {
    taskId,
    taskTitle,
    backlogId,
    profile,
    level,
    startedAt,
    completedAt: now.toISOString(),
    durationMinutes,
    firstTimePassRate,
    totalDiffLines,
    filesChanged: diff.filesChanged,
    linesAdded: diff.linesAdded,
    linesDeleted: diff.linesDeleted,
    engineering,
    protocol,
    realUsage,
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
      avgSpeedLinesPerMinute: 0,
      totalLinesChanged: 0,
      quickCount: 0,
      standardCount: 0,
      avgProtocolTokensPerTask: 0,
      realUsageSummary: null,
      recentTasks: [],
    };
  }

  const quickCount = tasks.filter((t) => t.profile === 'quick').length;
  const standardCount = totalTasks - quickCount;
  const totalDuration = tasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  const totalPassRate = tasks.reduce((sum, t) => sum + (t.firstTimePassRate || 100), 0);
  const totalLines = tasks.reduce((sum, t) => sum + (t.totalDiffLines || 0), 0);
  const totalProtocolTokens = tasks.reduce((sum, t) => sum + (t.protocol?.totalInjectedTokens || 0), 0);

  // 真实使用统计
  const tasksWithReal = tasks.filter((t) => t.realUsage && t.realUsage.totalTokens > 0);
  let realUsageSummary: TaskMetricsSummary['realUsageSummary'] = null;
  if (tasksWithReal.length > 0) {
    const totalRealTokens = tasksWithReal.reduce((sum, t) => sum + (t.realUsage?.totalTokens || 0), 0);
    const totalRealCost = tasksWithReal.reduce((sum, t) => sum + (t.realUsage?.costUsd || 0), 0);
    realUsageSummary = {
      tasksWithRealUsage: tasksWithReal.length,
      totalRealTokens,
      avgRealTokensPerTask: Math.round(totalRealTokens / tasksWithReal.length),
      totalRealCostUsd: parseFloat(totalRealCost.toFixed(4)),
    };
  }

  return {
    totalTasks,
    avgDurationMinutes: parseFloat((totalDuration / totalTasks).toFixed(1)),
    avgFirstTimePassRate: Math.round(totalPassRate / totalTasks),
    avgSpeedLinesPerMinute: parseFloat((totalLines / Math.max(1, totalDuration)).toFixed(1)),
    totalLinesChanged: totalLines,
    quickCount,
    standardCount,
    avgProtocolTokensPerTask: Math.round(totalProtocolTokens / totalTasks),
    realUsageSummary,
    recentTasks: tasks.slice(0, limit),
  };
}
