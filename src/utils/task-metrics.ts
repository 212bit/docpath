/**
 * Task Metrics & Efficiency Telemetry Engine (Layer 1 Utils)
 *
 * Tracks objective engineering metrics (cycle time, pass rates, code diffs, turns)
 * and probes real Agent session telemetry (Input/Output/Cached Tokens, costs, compliance).
 */

import { existsSync } from 'node:fs';
import { readFile, appendFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gitSyncOptional } from './git-run.js';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { estimateTokens } from './document-index.js';
import {
  resolveAgentTelemetry,
  type SessionTelemetryRecord,
  type ComplianceViolation,
  type ComplianceSeverity,
  type DiffStats,
} from './agent-telemetry-adapter.js';

export interface RealAgentUsage {
  source: 'antigravity' | 'claude' | 'opencode' | 'env' | 'breadcrumb' | 'unknown';
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  costUsd?: number;
  toolCallsCount?: number;
  model?: string;
  complianceScore?: number;
  violations?: ComplianceViolation[];
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
  complianceScore?: number;
  violations?: ComplianceViolation[];
  totalDiffLines: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  engineering: EngineeringMetrics;
  protocol: ProtocolOverhead;
  realUsage: RealAgentUsage | null;
  sessionRecord?: SessionTelemetryRecord | null;
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

export interface TokenDriftMetrics {
  profile: 'quick' | 'standard';
  taskCount: number;
  baselineProtocolTokens: number;
  recentProtocolTokens: number;
  protocolInflationRate: number; // percentage e.g. +12.5
  baselineRealTokensMedian: number;
  roiTokensPerLine: number; // tokens per diff line changed
  spikeThresholdTokens: number; // 2.5 * baselineRealTokensMedian
}

export interface TaskSpikeAlert {
  taskId: string;
  taskTitle: string;
  profile: 'quick' | 'standard';
  realTokens: number;
  baselineTokens: number;
  spikeRatio: number;
  reason: string;
}

export interface ComplianceSummary {
  avgComplianceScore: number;
  totalViolations: number;
  violationsByRule: Record<string, number>;
  violationsBySeverity: Record<ComplianceSeverity, number>;
  criticalViolationsCount: number;
  unhealthyTasksCount: number;
}

export interface MonitorSummary {
  totalTasks: number;
  healthIndex: number;
  compliance: ComplianceSummary;
  drift: {
    quick: TokenDriftMetrics;
    standard: TokenDriftMetrics;
    overallProtocolInflationRate: number;
  };
  spikes: TaskSpikeAlert[];
  realUsageSummary: {
    tasksWithRealUsage: number;
    totalRealTokens: number;
    avgRealTokensPerTask: number;
    totalRealCostUsd: number;
    avgCostPerTaskUsd: number;
    overallRoiTokensPerLine: number;
  } | null;
  recentTasks: TaskMetrics[];
}

export interface TaskMetricsOptions {
  cwd: string;
  limit?: number;
  agent?: boolean;
  json?: boolean;
}

export interface MonitorOptions {
  cwd: string;
  limit?: number;
  agent?: boolean;
  json?: boolean;
  strict?: boolean;
  ci?: boolean;
  threshold?: number;
}

/**
 * 提取 Git Diff 行数及变更文件统计
 */
function getTaskDiffStats(cwd: string): DiffStats {
  try {
    const nameOnly = gitSyncOptional(cwd, ['diff', '--name-only', 'HEAD~1...HEAD']) || '';
    const changedFiles = nameOnly.split('\n').filter(Boolean);
    const diffStat = gitSyncOptional(cwd, ['diff', '--stat', 'HEAD~1...HEAD']) || '';
    const match = diffStat.match(
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i
    );
    if (match) {
      const linesAdded = parseInt(match[2] || '0', 10);
      const linesDeleted = parseInt(match[3] || '0', 10);
      return {
        filesChanged: parseInt(match[1] || '0', 10),
        linesAdded,
        linesDeleted,
        totalDiffLines: linesAdded + linesDeleted,
        changedFiles,
      };
    }
    // 回退到当前暂存区/工作区状态
    const statusOut = gitSyncOptional(cwd, ['status', '--porcelain']) || '';
    const lines = statusOut.split('\n').filter(Boolean);
    const fallbackFiles = lines.map((l) => l.slice(3).trim()).filter(Boolean);
    const linesAdded = lines.length * 15;
    return {
      filesChanged: lines.length,
      linesAdded,
      linesDeleted: 0,
      totalDiffLines: linesAdded,
      changedFiles: fallbackFiles,
    };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesDeleted: 0, totalDiffLines: 0, changedFiles: [] };
  }
}

/**
 * 探测并提取真实 Agent 会话遥测数据 (Antigravity / Claude Code / 环境变量)
 */
export async function probeRealAgentTelemetry(
  startedAt: string,
  completedAt: string,
  options?: {
    cwd?: string;
    taskId?: string;
    profile?: 'quick' | 'standard';
    level?: number;
    diffStats?: DiffStats;
    spec?: Record<string, any>;
    plan?: Record<string, any>;
    state?: Record<string, any>;
    brainDir?: string;
    transcriptPath?: string;
  }
): Promise<RealAgentUsage | null> {
  const telemetry = await resolveAgentTelemetry({
    cwd: options?.cwd || process.cwd(),
    taskId: options?.taskId || 'current',
    startedAt,
    completedAt,
    profile: options?.profile,
    level: options?.level,
    diffStats: options?.diffStats,
    spec: options?.spec,
    plan: options?.plan,
    state: options?.state,
    brainDir: options?.brainDir,
    transcriptPath: options?.transcriptPath,
  });

  if (!telemetry || (telemetry.source === 'unknown' && telemetry.tokens.totalTokens === 0 && telemetry.turnsCount <= 1)) {
    return null;
  }

  return {
    source: telemetry.source,
    inputTokens: telemetry.tokens.inputTokens,
    outputTokens: telemetry.tokens.outputTokens,
    cachedTokens: telemetry.tokens.cachedTokens,
    totalTokens: telemetry.tokens.totalTokens,
    costUsd: telemetry.tokens.costUsd,
    toolCallsCount: telemetry.toolCalls.total,
    model: telemetry.model,
    complianceScore: telemetry.complianceScore,
    violations: telemetry.violations,
  };
}

/**
 * 从任务目录结构化数据收集指标与合规遥测
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

  let parsedSpec: Record<string, any> | undefined;
  let parsedPlan: Record<string, any> | undefined;
  let parsedState: Record<string, any> | undefined;

  // 1. 读取 spec.json
  const specJsonPath = join(taskDir, 'spec.json');
  if (existsSync(specJsonPath)) {
    try {
      parsedSpec = JSON.parse(await readFile(specJsonPath, 'utf-8'));
      if (parsedSpec?.title) taskTitle = parsedSpec.title;
      if (parsedSpec?.backlog_id) backlogId = parsedSpec.backlog_id;
      specTokens = estimateTokens(JSON.stringify(parsedSpec));
    } catch {
      // 容错
    }
  }

  // 2. 读取 plan.json
  const planJsonPath = join(taskDir, 'plan.json');
  if (existsSync(planJsonPath)) {
    try {
      parsedPlan = JSON.parse(await readFile(planJsonPath, 'utf-8'));
      if (Array.isArray(parsedPlan?.steps)) {
        totalSteps = Math.max(1, parsedPlan.steps.length);
        passedSteps = parsedPlan.steps.filter((s: { status?: string }) => s.status === 'done').length || totalSteps;
      }
      planTokens = estimateTokens(JSON.stringify(parsedPlan));
    } catch {
      // 容错
    }
  }

  // 3. 读取 state.json
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (existsSync(statePath)) {
    try {
      parsedState = JSON.parse(await readFile(statePath, 'utf-8'));
      if (parsedState?.workflow_profile === 'quick') profile = 'quick';
      if (typeof parsedState?.level === 'number') level = parsedState.level;
      if (parsedState?.started_at) startedAt = parsedState.started_at;
      if (parsedState?.task_title && taskTitle === taskId) taskTitle = parsedState.task_title;
      if (parsedState?.backlog_id && !backlogId) backlogId = parsedState.backlog_id;
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
  const totalDiffLines = diff.totalDiffLines;
  const speedLinesPerMinute = parseFloat((totalDiffLines / Math.max(0.1, durationMinutes)).toFixed(1));

  // 7. DocPath 协议注入体积 (Protocol Overhead)
  const rulesTokens = profile === 'quick' ? 600 : 1800;
  const totalInjectedTokens = specTokens + planTokens + rulesTokens;

  // 8. 探测真实 Agent 会话遥测并执行合规审计
  const sessionRecord = await resolveAgentTelemetry({
    cwd,
    taskId,
    startedAt,
    completedAt: now.toISOString(),
    profile,
    level,
    diffStats: diff,
    spec: parsedSpec,
    plan: parsedPlan,
    state: parsedState,
  });

  const realUsage: RealAgentUsage | null =
    sessionRecord && (sessionRecord.tokens.totalTokens > 0 || sessionRecord.source !== 'unknown')
      ? {
          source: sessionRecord.source,
          inputTokens: sessionRecord.tokens.inputTokens,
          outputTokens: sessionRecord.tokens.outputTokens,
          cachedTokens: sessionRecord.tokens.cachedTokens,
          totalTokens: sessionRecord.tokens.totalTokens,
          costUsd: sessionRecord.tokens.costUsd,
          toolCallsCount: sessionRecord.toolCalls.total,
          model: sessionRecord.model,
          complianceScore: sessionRecord.complianceScore,
          violations: sessionRecord.violations,
        }
      : null;

  const complianceScore = sessionRecord ? sessionRecord.complianceScore : 100;
  const violations = sessionRecord ? sessionRecord.violations : [];

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
    complianceScore,
    violations,
    totalDiffLines,
    filesChanged: diff.filesChanged,
    linesAdded: diff.linesAdded,
    linesDeleted: diff.linesDeleted,
    engineering,
    protocol,
    realUsage,
    sessionRecord,
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
 * 计算数字序列的中位数
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 加载全仓所有已归档及历史任务度量数据 (按完成时间倒序)
 */
export async function loadAllTaskMetrics(cwd: string): Promise<TaskMetrics[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const tasks: TaskMetrics[] = [];
  const globalPath = join(docpathDir, 'workspace', 'task-metrics.jsonl');

  // 1. 优先从全局 task-metrics.jsonl 读取
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

  // 2. 扫描 tasks/done 目录中的 metrics.json 补充
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

  tasks.sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  return tasks;
}

/**
 * 计算 Token 消耗漂移与协议膨胀率 (Token Drift & Inflation Analysis)
 */
export function calculateTokenDrift(tasks: TaskMetrics[]): {
  quick: TokenDriftMetrics;
  standard: TokenDriftMetrics;
  overallProtocolInflationRate: number;
} {
  const buildProfileDrift = (profile: 'quick' | 'standard'): TokenDriftMetrics => {
    const pTasks = tasks.filter((t) => (t.profile || 'standard') === profile);
    const defaultBaselineProto = profile === 'quick' ? 800 : 2400;
    const defaultBaselineReal = profile === 'quick' ? 8000 : 30000;

    const protoTokensList = pTasks.map((t) => t.protocol?.totalInjectedTokens || 0);
    const baselineProtocolTokens = protoTokensList.length >= 2
      ? calculateMedian(protoTokensList)
      : protoTokensList.length === 1 && protoTokensList[0] > 0
        ? protoTokensList[0]
        : defaultBaselineProto;

    const recentSlice = pTasks.slice(0, 5);
    const recentProtocolTokens = recentSlice.length > 0
      ? Math.round(recentSlice.reduce((sum, t) => sum + (t.protocol?.totalInjectedTokens || 0), 0) / recentSlice.length)
      : baselineProtocolTokens;

    const protocolInflationRate = baselineProtocolTokens > 0
      ? parseFloat((((recentProtocolTokens - baselineProtocolTokens) / baselineProtocolTokens) * 100).toFixed(1))
      : 0;

    const realTokensList = pTasks
      .filter((t) => t.realUsage && t.realUsage.totalTokens > 0)
      .map((t) => t.realUsage!.totalTokens);

    const baselineRealTokensMedian = realTokensList.length > 0
      ? calculateMedian(realTokensList)
      : defaultBaselineReal;

    const totalReal = pTasks.reduce((sum, t) => sum + (t.realUsage?.totalTokens || 0), 0);
    const totalDiff = pTasks.reduce((sum, t) => sum + (t.totalDiffLines || 0), 0);
    const roiTokensPerLine = totalDiff > 0
      ? parseFloat((totalReal / totalDiff).toFixed(1))
      : 0;

    return {
      profile,
      taskCount: pTasks.length,
      baselineProtocolTokens,
      recentProtocolTokens,
      protocolInflationRate,
      baselineRealTokensMedian,
      roiTokensPerLine,
      spikeThresholdTokens: Math.round(baselineRealTokensMedian * 2.5),
    };
  };

  const quickDrift = buildProfileDrift('quick');
  const standardDrift = buildProfileDrift('standard');

  const allProto = tasks.map((t) => t.protocol?.totalInjectedTokens || 0);
  const baselineOverall = allProto.length >= 2
    ? calculateMedian(allProto)
    : allProto.length === 1 && allProto[0] > 0
      ? allProto[0]
      : 2000;

  const recentOverallSlice = tasks.slice(0, 5);
  const recentOverall = recentOverallSlice.length > 0
    ? Math.round(recentOverallSlice.reduce((sum, t) => sum + (t.protocol?.totalInjectedTokens || 0), 0) / recentOverallSlice.length)
    : baselineOverall;

  const overallProtocolInflationRate = baselineOverall > 0
    ? parseFloat((((recentOverall - baselineOverall) / baselineOverall) * 100).toFixed(1))
    : 0;

  return {
    quick: quickDrift,
    standard: standardDrift,
    overallProtocolInflationRate,
  };
}

/**
 * 探测任务 Token 异常突增告警 (> 2.5x 对应 Profile 基线中位数)
 */
export function detectTaskSpikes(
  tasks: TaskMetrics[],
  drift: { quick: TokenDriftMetrics; standard: TokenDriftMetrics }
): TaskSpikeAlert[] {
  const alerts: TaskSpikeAlert[] = [];

  for (const t of tasks) {
    const profile = t.profile === 'quick' ? 'quick' : 'standard';
    const baselineMedian = profile === 'quick' ? drift.quick.baselineRealTokensMedian : drift.standard.baselineRealTokensMedian;
    const realTokens = t.realUsage?.totalTokens || 0;

    if (realTokens > 0 && baselineMedian > 0 && realTokens > 2.5 * baselineMedian) {
      const spikeRatio = parseFloat((realTokens / baselineMedian).toFixed(2));
      alerts.push({
        taskId: t.taskId,
        taskTitle: t.taskTitle,
        profile,
        realTokens,
        baselineTokens: baselineMedian,
        spikeRatio,
        reason: `Task real tokens (${realTokens.toLocaleString()}) exceeded 2.5x of ${profile} baseline median (${baselineMedian.toLocaleString()}) by ${spikeRatio}x`,
      });
    }
  }

  return alerts;
}

/**
 * 汇总任务流程合规审计得分与违规项分布
 */
export function calculateComplianceSummary(tasks: TaskMetrics[]): ComplianceSummary {
  const violationsByRule: Record<string, number> = {
    'CR-01': 0,
    'CR-02': 0,
    'CR-03': 0,
    'CR-04': 0,
    'CR-05': 0,
  };
  const violationsBySeverity: Record<ComplianceSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let totalViolations = 0;
  let totalScore = 0;
  let unhealthyTasksCount = 0;

  for (const t of tasks) {
    const score = typeof t.complianceScore === 'number' ? t.complianceScore : 100;
    totalScore += score;
    if (score < 70) unhealthyTasksCount++;

    const violations = t.violations || t.sessionRecord?.violations || t.realUsage?.violations || [];
    for (const v of violations) {
      totalViolations++;
      violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] || 0) + 1;
      if (v.severity && violationsBySeverity[v.severity] !== undefined) {
        violationsBySeverity[v.severity]++;
      }
    }
  }

  const avgComplianceScore = tasks.length > 0 ? Math.round(totalScore / tasks.length) : 100;
  const criticalViolationsCount = violationsBySeverity.critical;

  return {
    avgComplianceScore,
    totalViolations,
    violationsByRule,
    violationsBySeverity,
    criticalViolationsCount,
    unhealthyTasksCount,
  };
}

/**
 * 汇总全仓历史任务度量数据 (stats 命令底层)
 */
export async function aggregateTaskMetrics(
  cwd: string,
  limit: number = 10,
): Promise<TaskMetricsSummary> {
  const tasks = await loadAllTaskMetrics(cwd);
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

/**
 * 汇总全仓监控大盘度量数据 (monitor 命令底层)
 */
export async function aggregateMonitorMetrics(
  cwd: string,
  limit: number = 10,
): Promise<MonitorSummary> {
  const allTasks = await loadAllTaskMetrics(cwd);
  const baseSummary = await aggregateTaskMetrics(cwd, limit);

  const compliance = calculateComplianceSummary(allTasks);
  const drift = calculateTokenDrift(allTasks);
  const spikes = detectTaskSpikes(allTasks, drift);

  let realUsageSummary: MonitorSummary['realUsageSummary'] = null;
  if (baseSummary.realUsageSummary) {
    const totalLines = allTasks.reduce((sum, t) => sum + (t.totalDiffLines || 0), 0);
    const overallRoi = totalLines > 0
      ? parseFloat((baseSummary.realUsageSummary.totalRealTokens / totalLines).toFixed(1))
      : 0;
    const avgCost = baseSummary.realUsageSummary.tasksWithRealUsage > 0
      ? parseFloat((baseSummary.realUsageSummary.totalRealCostUsd / baseSummary.realUsageSummary.tasksWithRealUsage).toFixed(4))
      : 0;

    realUsageSummary = {
      ...baseSummary.realUsageSummary,
      avgCostPerTaskUsd: avgCost,
      overallRoiTokensPerLine: overallRoi,
    };
  }

  return {
    totalTasks: baseSummary.totalTasks,
    healthIndex: compliance.avgComplianceScore,
    compliance,
    drift,
    spikes,
    realUsageSummary,
    recentTasks: allTasks.slice(0, limit),
  };
}

