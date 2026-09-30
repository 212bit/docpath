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
  detectCurrentSessionId,
  captureGitCommit,
  detectWorkflowFrictions,
  type LifecycleAnchor,
  type StepTelemetrySlice,
  type SessionTelemetryRecord,
  type ComplianceViolation,
  type ComplianceSeverity,
  type DiffStats,
  type ToolAttribution,
  type ToolInefficiencyFinding,
  type WorkflowFrictionFinding,
  type WorkflowFrictionContext,
} from './agent-telemetry-adapter.js';

export type {
  ToolAttribution,
  ToolInefficiencyFinding,
  LifecycleAnchor,
  StepTelemetrySlice,
  WorkflowFrictionFinding,
  WorkflowFrictionContext,
};
export { detectCurrentSessionId, captureGitCommit, detectWorkflowFrictions };

export interface RealAgentUsage {
  source: 'antigravity' | 'claude' | 'opencode' | 'zcode' | 'env' | 'breadcrumb' | 'unknown';
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  costUsd?: number;
  toolCallsCount?: number;
  toolAttributions?: ToolAttribution[];
  toolInefficiencies?: ToolInefficiencyFinding[];
  frictionFindings?: WorkflowFrictionFinding[];
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

export interface DocPathValueRoi {
  protocolTokens: number;
  realModelTokens: number;
  overheadRatio: number; // e.g. 2.3 for 2.3%
  complianceScore: number;
  firstTimePassRate: number;
  summaryText: string;
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
  toolAttributions?: ToolAttribution[];
  toolInefficiencies?: ToolInefficiencyFinding[];
  frictionFindings?: WorkflowFrictionFinding[];
  lifecycleAnchor?: LifecycleAnchor;
  stepSlices?: StepTelemetrySlice[];
  docpathValueRoi?: DocPathValueRoi;
}

export interface RealAgentUsageSummary {
  tasksWithRealUsage: number;
  totalRealTokens: number;
  totalCachedTokens: number;
  cacheHitRatio: number; // 0 - 100 percentage
  avgRealTokensPerTask: number;
  totalRealCostUsd: number;
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
  realUsageSummary: RealAgentUsageSummary | null;
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

export interface ActiveTaskStepProgress {
  totalSteps: number;
  passedSteps: number;
  blockedSteps: number;
  currentStep: string;
  currentStepTitle?: string;
  percent: number;
}

export interface ActiveTaskMetrics {
  taskId: string;
  taskTitle: string;
  backlogId: string | null;
  profile: 'quick' | 'standard';
  level: number;
  phase: string;
  startedAt: string;
  durationMinutes: number;
  durationSeconds: number;
  progress: ActiveTaskStepProgress;
  complianceScore: number;
  violations: ComplianceViolation[];
  totalDiffLines: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  realUsage: RealAgentUsage | null;
  sessionRecord?: SessionTelemetryRecord | null;
  toolAttributions?: ToolAttribution[];
  toolInefficiencies?: ToolInefficiencyFinding[];
  frictionFindings?: WorkflowFrictionFinding[];
  lifecycleAnchor?: LifecycleAnchor;
  stepSlices?: StepTelemetrySlice[];
  docpathValueRoi?: DocPathValueRoi;
}

export interface ComplianceSummary {
  avgComplianceScore: number;
  totalViolations: number;
  violationsByRule: Record<string, number>;
  violationsBySeverity: Record<ComplianceSeverity, number>;
  criticalViolationsCount: number;
  unhealthyTasksCount: number;
}

export interface RemediationRecommendation {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  recommendedCommand: string;
  actionable: boolean;
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
  remediations: RemediationRecommendation[];
  realUsageSummary: {
    tasksWithRealUsage: number;
    totalRealTokens: number;
    totalCachedTokens: number;
    cacheHitRatio: number;
    avgRealTokensPerTask: number;
    totalRealCostUsd: number;
    avgCostPerTaskUsd: number;
    overallRoiTokensPerLine: number;
  } | null;
  globalToolAttributions?: ToolAttribution[];
  globalToolInefficiencies?: ToolInefficiencyFinding[];
  toolInefficiencies?: ToolInefficiencyFinding[];
  globalFrictionFindings?: WorkflowFrictionFinding[];
  frictionFindings?: WorkflowFrictionFinding[];
  workflowFrictions?: WorkflowFrictionFinding[];
  activeTask?: ActiveTaskMetrics | null;
  recentTasks: TaskMetrics[];
  docpathValueRoi?: DocPathValueRoi;
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
  current?: boolean;
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
    toolAttributions: telemetry.toolAttributions,
    toolInefficiencies: telemetry.toolInefficiencies,
    model: telemetry.model,
    complianceScore: telemetry.complianceScore,
    violations: telemetry.violations,
  };
}

/**
 * 步骤级 Token 成本与耗时切片提取引擎 (FR-2 / AC-3, AC-4)
 */
export async function extractStepTelemetrySlices(
  cwd: string,
  taskId: string,
  options?: {
    taskDir?: string;
    plan?: Record<string, any>;
    state?: Record<string, any>;
    spec?: Record<string, any>;
    anchor?: LifecycleAnchor;
    sessionId?: string;
    profile?: 'quick' | 'standard';
    level?: number;
    breadcrumbs?: Array<Record<string, any>>;
    transcriptPath?: string;
    zcodeDbPath?: string;
    zcodeRolloutDir?: string;
  }
): Promise<StepTelemetrySlice[]> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const taskDir = options?.taskDir || (
      existsSync(join(docpathDir, 'tasks', taskId))
        ? join(docpathDir, 'tasks', taskId)
        : existsSync(join(docpathDir, 'tasks', 'done', taskId))
          ? join(docpathDir, 'tasks', 'done', taskId)
          : join(docpathDir, 'tasks', 'current')
    );

    // 1. 获取 steps 定义
    let planSteps: Array<{ id: string; title?: string; status?: string }> = [];
    if (Array.isArray(options?.plan?.steps)) {
      planSteps = options.plan.steps.map((s: any) => ({
        id: s.id || s.step || s.stepId,
        title: s.title || s.name || s.stepTitle,
        status: s.status,
      }));
    } else {
      const planJsonPath = join(taskDir, 'plan.json');
      if (existsSync(planJsonPath)) {
        try {
          const parsedPlan = JSON.parse(await readFile(planJsonPath, 'utf-8'));
          if (Array.isArray(parsedPlan?.steps)) {
            planSteps = parsedPlan.steps.map((s: any) => ({
              id: s.id || s.step || s.stepId,
              title: s.title || s.name || s.stepTitle,
              status: s.status,
            }));
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. 收集 breadcrumb 记录
    let breadcrumbRecords: Array<Record<string, any>> = [];
    if (Array.isArray(options?.breadcrumbs)) {
      breadcrumbRecords = options.breadcrumbs;
    } else {
      const candidates = [
        join(taskDir, 'breadcrumb.jsonl'),
        join(docpathDir, 'tasks', taskId, 'breadcrumb.jsonl'),
        join(docpathDir, 'tasks', 'done', taskId, 'breadcrumb.jsonl'),
        join(docpathDir, 'tasks', 'current', 'breadcrumb.jsonl'),
        join(docpathDir, 'workspace', 'breadcrumb.jsonl'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) {
          try {
            const raw = await readFile(p, 'utf-8');
            const lines = raw.split('\n').filter((l) => l.trim());
            for (const line of lines) {
              try {
                breadcrumbRecords.push(JSON.parse(line));
              } catch {
                // ignore
              }
            }
            if (breadcrumbRecords.length > 0) {
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // 如果 planSteps 为空，从 breadcrumbs 中推断 steps
    if (planSteps.length === 0) {
      const stepIdsSeen = new Set<string>();
      for (const b of breadcrumbRecords) {
        const sId = b.step || b.stepId || b.step_id;
        if (sId && !stepIdsSeen.has(sId)) {
          stepIdsSeen.add(sId);
          planSteps.push({ id: sId, title: b.stepTitle || b.title });
        }
      }
    }

    if (planSteps.length === 0) {
      return [];
    }

    const slices: StepTelemetrySlice[] = [];
    const taskStartedAt = options?.anchor?.startedAt || options?.state?.started_at || (breadcrumbRecords[0]?.timestamp) || new Date().toISOString();

    for (let i = 0; i < planSteps.length; i++) {
      const step = planSteps[i];
      const stepId = step.id;
      const stepTitle = step.title;

      // 筛选该 step 关联的所有 breadcrumb 条目
      const stepEntries = breadcrumbRecords.filter((b) => {
        const s = b.step || b.stepId || b.step_id;
        return s === stepId;
      });

      let startedAt: string | undefined;
      let completedAt: string | undefined;

      // 寻找 start 事件
      const startEntry = stepEntries.find((b) => {
        const st = b.status || b.state;
        const ev = b.event || b.action || b.type;
        return st === 'in_progress' || st === 'active' || st === 'started' || ev === 'step.started' || ev === 'start' || ev === 'step_started';
      });

      if (startEntry) {
        startedAt = startEntry.timestamp || startEntry.created_at || startEntry.time;
      } else if (stepEntries.length > 0) {
        startedAt = stepEntries[0].timestamp || stepEntries[0].created_at || stepEntries[0].time;
      } else if (i === 0) {
        startedAt = taskStartedAt;
      } else if (slices[i - 1]?.completedAt) {
        startedAt = slices[i - 1].completedAt;
      }

      // 寻找 end / pass / completion 事件
      const endEntry = stepEntries.slice().reverse().find((b) => {
        const st = b.status || b.state;
        const ev = b.event || b.action || b.type;
        const ctx = typeof b.context === 'string' ? b.context : '';
        return (
          st === 'done' ||
          st === 'passed' ||
          st === 'completed' ||
          st === 'skipped' ||
          ev === 'step-pass' ||
          ev === 'step.completed' ||
          ev === 'agent.step' ||
          ev === 'end' ||
          ctx.startsWith('step-pass')
        );
      });

      if (endEntry) {
        completedAt = endEntry.timestamp || endEntry.created_at || endEntry.time;
      } else {
        // 检查后续 step 是否有开始时间
        let nextStepStart: string | undefined;
        for (let j = i + 1; j < planSteps.length; j++) {
          const nextEntries = breadcrumbRecords.filter((b) => (b.step || b.stepId || b.step_id) === planSteps[j].id);
          if (nextEntries.length > 0) {
            nextStepStart = nextEntries[0].timestamp || nextEntries[0].created_at || nextEntries[0].time;
            break;
          }
        }
        if (nextStepStart) {
          completedAt = nextStepStart;
        } else if (stepEntries.length > 0) {
          completedAt = new Date().toISOString();
        }
      }

      if (!startedAt) {
        continue;
      }
      if (!completedAt) {
        completedAt = new Date().toISOString();
      }

      const startMs = new Date(startedAt).getTime();
      const endMs = new Date(completedAt).getTime();
      const durationMinutes = parseFloat((Math.max(0, endMs - startMs) / 60000).toFixed(1));

      let stepStartTurnId: string | number | undefined;
      let stepEndTurnId: string | number | undefined;

      for (const entry of stepEntries) {
        const sTurn = entry.startTurnId ?? entry.start_turn_id ?? entry.startTurn ?? entry.turnId ?? entry.turn_id ?? entry.step_index;
        const eTurn = entry.endTurnId ?? entry.end_turn_id ?? entry.endTurn ?? entry.turnId ?? entry.turn_id ?? entry.step_index;
        if (sTurn !== undefined && stepStartTurnId === undefined) {
          stepStartTurnId = sTurn;
        }
        if (eTurn !== undefined) {
          stepEndTurnId = eTurn;
        }
      }

      // 探测该时间切片的 Session Telemetry
      const telemetry = await resolveAgentTelemetry({
        cwd,
        taskId,
        startedAt,
        completedAt,
        profile: options?.profile,
        level: options?.level,
        sessionId: options?.sessionId || options?.anchor?.sessionId,
        anchor: options?.anchor ? { ...options.anchor, startedAt, completedAt } : undefined,
        startTurnId: stepStartTurnId,
        endTurnId: stepEndTurnId,
        transcriptPath: options?.transcriptPath,
        zcodeDbPath: options?.zcodeDbPath,
        zcodeRolloutDir: options?.zcodeRolloutDir,
        spec: options?.spec,
        plan: options?.plan,
        state: options?.state,
      });

      const totalTokens = telemetry?.tokens?.totalTokens || 0;
      const inputTokens = telemetry?.tokens?.inputTokens || 0;
      const outputTokens = telemetry?.tokens?.outputTokens || 0;
      const cachedTokens = telemetry?.tokens?.cachedTokens;
      const costUsd = telemetry?.tokens?.costUsd;
      const toolCallsCount = telemetry?.toolCalls?.total || 0;
      const topTools = telemetry?.toolAttributions && telemetry.toolAttributions.length > 0
        ? telemetry.toolAttributions.slice(0, 3).map((t) => ({ name: t.name, count: t.count, tokens: t.totalTokens }))
        : Object.keys(telemetry?.toolCalls?.byName || {}).length > 0
          ? Object.entries(telemetry!.toolCalls.byName).slice(0, 3).map(([name, count]) => ({ name, count, tokens: 0 }))
          : undefined;

      slices.push({
        stepId,
        stepTitle,
        startedAt,
        completedAt,
        durationMinutes,
        totalTokens,
        inputTokens,
        outputTokens,
        cachedTokens: (cachedTokens && cachedTokens > 0) ? cachedTokens : undefined,
        costUsd: (costUsd !== undefined && costUsd > 0) ? costUsd : undefined,
        toolCallsCount,
        topTools,
      });
    }

    return slices;
  } catch {
    return [];
  }
}

/**
 * 计算 DocPath 极轻量价值透视与治理收益指标 (DocPath Lightweight Overhead Ratio & Value ROI Engine)
 */
export function calculateDocPathValueRoi(params: {
  protocolTokens: number;
  realModelTokens: number;
  complianceScore?: number;
  firstTimePassRate?: number;
}): DocPathValueRoi {
  const protocolTokens = params.protocolTokens || 0;
  const realModelTokens = params.realModelTokens || 0;
  const overheadRatio = realModelTokens > 0
    ? parseFloat(((protocolTokens / realModelTokens) * 100).toFixed(2))
    : 100;
  const complianceScore = typeof params.complianceScore === 'number' ? params.complianceScore : 100;
  const firstTimePassRate = typeof params.firstTimePassRate === 'number' ? params.firstTimePassRate : 100;
  const summaryText = '以极低 Token 负担 (<3%~5%) 规范 Agent 工作流并阻断试错死循环';

  return {
    protocolTokens,
    realModelTokens,
    overheadRatio,
    complianceScore,
    firstTimePassRate,
    summaryText,
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
  let parsedBreadcrumbs: Array<Record<string, any>> = [];
  const breadcrumbPath = join(taskDir, 'breadcrumb.jsonl');
  if (existsSync(breadcrumbPath)) {
    try {
      const content = await readFile(breadcrumbPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      turnCount = lines.length;
      if (lines.length > 0) {
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            parsedBreadcrumbs.push(entry);
            if (entry.status === 'blocked' || entry.gate_verdict === 'fail') blockedSteps++;
          } catch {
            // 容错单行 JSON 解析
          }
        }
        if (parsedBreadcrumbs[0]?.timestamp) startedAt = parsedBreadcrumbs[0].timestamp;
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
  const baseCommit = parsedState?.base_commit || (parsedState?.lifecycle_anchor as any)?.baseCommit;
  const headCommit = captureGitCommit(cwd);
  const sessionId =
    parsedState?.session_id ||
    (parsedState?.lifecycle_anchor as any)?.sessionId ||
    (await detectCurrentSessionId(cwd));

  const lifecycleAnchor: LifecycleAnchor = {
    sessionId: sessionId || undefined,
    baseCommit: baseCommit || undefined,
    headCommit: headCommit || undefined,
    startedAt,
    completedAt: now.toISOString(),
  };

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
    anchor: lifecycleAnchor,
    sessionId: lifecycleAnchor.sessionId,
  });

  const stepSlices = await extractStepTelemetrySlices(cwd, taskId, {
    taskDir,
    plan: parsedPlan,
    state: parsedState,
    spec: parsedSpec,
    anchor: lifecycleAnchor,
    sessionId: lifecycleAnchor.sessionId,
    profile,
    level,
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
          toolAttributions: sessionRecord.toolAttributions,
          toolInefficiencies: sessionRecord.toolInefficiencies,
          model: sessionRecord.model,
          complianceScore: sessionRecord.complianceScore,
          violations: sessionRecord.violations,
        }
      : null;

  const complianceScore = sessionRecord ? sessionRecord.complianceScore : 100;
  const violations = sessionRecord ? sessionRecord.violations : [];

  const frictionFindings = detectWorkflowFrictions({
    breadcrumbs: parsedBreadcrumbs,
    sessionRecord,
    spec: parsedSpec,
    plan: parsedPlan,
    state: parsedState,
    toolInefficiencies: sessionRecord?.toolInefficiencies || realUsage?.toolInefficiencies,
    violations,
    blockedSteps,
    retryCount: blockedSteps,
    diffStats: diff,
  });

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

  const docpathValueRoi = calculateDocPathValueRoi({
    protocolTokens: totalInjectedTokens,
    realModelTokens: realUsage?.totalTokens || 0,
    complianceScore,
    firstTimePassRate,
  });

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
    toolAttributions: sessionRecord?.toolAttributions || realUsage?.toolAttributions,
    toolInefficiencies: sessionRecord?.toolInefficiencies || realUsage?.toolInefficiencies,
    frictionFindings: frictionFindings.length > 0 ? frictionFindings : undefined,
    lifecycleAnchor,
    stepSlices: stepSlices.length > 0 ? stepSlices : undefined,
    docpathValueRoi,
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
  for (const t of tasks) {
    if (!t.docpathValueRoi) {
      t.docpathValueRoi = calculateDocPathValueRoi({
        protocolTokens: t.protocol?.totalInjectedTokens || 0,
        realModelTokens: t.realUsage?.totalTokens || 0,
        complianceScore: t.complianceScore,
        firstTimePassRate: t.firstTimePassRate,
      });
    }
  }
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
    const totalCachedTokens = tasksWithReal.reduce((sum, t) => sum + (t.realUsage?.cachedTokens || 0), 0);
    const totalRealCost = tasksWithReal.reduce((sum, t) => sum + (t.realUsage?.costUsd || 0), 0);
    const cacheHitRatio = totalCachedTokens > 0
      ? parseFloat(((totalCachedTokens / (totalRealTokens + totalCachedTokens)) * 100).toFixed(1))
      : 0;

    realUsageSummary = {
      tasksWithRealUsage: tasksWithReal.length,
      totalRealTokens,
      totalCachedTokens,
      cacheHitRatio,
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
 * 实时探测当前正在执行的活跃任务遥测数据 (In-flight Active Task Telemetry Probe)
 */
export async function probeActiveTaskMetrics(cwd: string): Promise<ActiveTaskMetrics | null> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const statePath = join(docpathDir, 'workspace', 'state.json');

    if (!existsSync(statePath)) {
      return null;
    }

    let parsedState: Record<string, any> | undefined;
    try {
      parsedState = JSON.parse(await readFile(statePath, 'utf-8'));
    } catch {
      return null;
    }

    const taskId = parsedState?.task_id?.trim();
    if (!taskId || taskId === 'idle') {
      return null;
    }

    const profile: 'quick' | 'standard' = parsedState?.workflow_profile === 'quick' ? 'quick' : 'standard';
    const level = typeof parsedState?.level === 'number' ? parsedState.level : 2;
    let taskTitle = parsedState?.task_title || taskId;
    let backlogId: string | null = parsedState?.backlog_id || null;
    const phase = parsedState?.phase || 'execution';
    let startedAt = parsedState?.started_at || new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const taskDir = existsSync(join(docpathDir, 'tasks', taskId))
      ? join(docpathDir, 'tasks', taskId)
      : existsSync(join(docpathDir, 'tasks', 'current'))
        ? join(docpathDir, 'tasks', 'current')
        : join(docpathDir, 'tasks', taskId);

    let parsedSpec: Record<string, any> | undefined;
    let parsedPlan: Record<string, any> | undefined;

    // 1. 读取 spec.json
    const specJsonPath = existsSync(join(taskDir, 'spec.json'))
      ? join(taskDir, 'spec.json')
      : join(docpathDir, 'tasks', 'current', 'spec.json');

    if (existsSync(specJsonPath)) {
      try {
        parsedSpec = JSON.parse(await readFile(specJsonPath, 'utf-8'));
        if (parsedSpec?.title) taskTitle = parsedSpec.title;
        if (parsedSpec?.backlog_id) backlogId = parsedSpec.backlog_id;
      } catch {
        // 容错
      }
    }

    // 2. 读取 plan.json 并计算步骤进度
    let totalSteps = 1;
    let passedSteps = 0;
    let currentStep = parsedState?.current_step || 'S1';
    let currentStepTitle: string | undefined;

    const planJsonPath = existsSync(join(taskDir, 'plan.json'))
      ? join(taskDir, 'plan.json')
      : join(docpathDir, 'tasks', 'current', 'plan.json');

    if (existsSync(planJsonPath)) {
      try {
        parsedPlan = JSON.parse(await readFile(planJsonPath, 'utf-8'));
        if (Array.isArray(parsedPlan?.steps) && parsedPlan.steps.length > 0) {
          totalSteps = parsedPlan.steps.length;
          passedSteps = parsedPlan.steps.filter((s: { status?: string }) => s.status === 'done' || s.status === 'passed').length;
          const activeStep = parsedPlan.steps.find((s: { status?: string }) => s.status === 'in_progress' || s.status === 'active' || s.status === 'current' || s.status === 'blocked')
            || parsedPlan.steps.find((s: { status?: string }) => s.status !== 'done' && s.status !== 'passed')
            || parsedPlan.steps[0];
          if (activeStep) {
            currentStep = activeStep.id || activeStep.step || currentStep;
            currentStepTitle = activeStep.title || activeStep.name;
          }
        }
      } catch {
        // 容错
      }
    }

    // 3. 读取 breadcrumb.jsonl
    let blockedSteps = 0;
    let parsedBreadcrumbs: Array<Record<string, any>> = [];
    const breadcrumbCandidates = [
      join(taskDir, 'breadcrumb.jsonl'),
      join(docpathDir, 'tasks', 'current', 'breadcrumb.jsonl'),
      join(docpathDir, 'workspace', 'breadcrumb.jsonl'),
    ];

    for (const bp of breadcrumbCandidates) {
      if (existsSync(bp)) {
        try {
          const content = await readFile(bp, 'utf-8');
          const lines = content.split('\n').filter((l) => l.trim());
          if (lines.length > 0) {
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                parsedBreadcrumbs.push(entry);
                if (entry.status === 'blocked' || entry.gate_verdict === 'fail') {
                  blockedSteps++;
                }
              } catch {
                // 容错
              }
            }
            if (parsedBreadcrumbs[0]?.timestamp && !parsedState?.started_at) {
              startedAt = parsedBreadcrumbs[0].timestamp;
            }
          }
          break;
        } catch {
          // 容错
        }
      }
    }

    // 4. 计算实时运行时长
    const now = new Date();
    const startTime = new Date(startedAt).getTime();
    const endTime = now.getTime();
    const durationSeconds = Math.max(0, Math.round((endTime - startTime) / 1000));
    const durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));

    // 5. Git Diff 统计
    const diff = getTaskDiffStats(cwd);

    // 6. 探测实时 Agent 遥测与合规违规审计
    const baseCommit = parsedState?.base_commit || (parsedState?.lifecycle_anchor as any)?.baseCommit;
    const headCommit = captureGitCommit(cwd);
    const sessionId =
      parsedState?.session_id ||
      (parsedState?.lifecycle_anchor as any)?.sessionId ||
      (await detectCurrentSessionId(cwd));

    const lifecycleAnchor: LifecycleAnchor = {
      sessionId: sessionId || undefined,
      baseCommit: baseCommit || undefined,
      headCommit: headCommit || undefined,
      startedAt,
    };

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
      anchor: lifecycleAnchor,
      sessionId: lifecycleAnchor.sessionId,
    });

    // 优先读取显式落盘的 metrics.json（如果已存在），以便承载明确的遥测快照
    const metricsJsonPath = existsSync(join(taskDir, 'metrics.json'))
      ? join(taskDir, 'metrics.json')
      : join(docpathDir, 'tasks', 'current', 'metrics.json');
    let fileMetricsUsage: RealAgentUsage | null = null;
    let fileFrictionFindings: WorkflowFrictionFinding[] | undefined;
    if (existsSync(metricsJsonPath)) {
      try {
        const parsedMetrics = JSON.parse(await readFile(metricsJsonPath, 'utf-8'));
        if (parsedMetrics.realUsage) {
          fileMetricsUsage = parsedMetrics.realUsage;
        }
        if (Array.isArray(parsedMetrics.frictionFindings)) {
          fileFrictionFindings = parsedMetrics.frictionFindings;
        }
      } catch {
        // 容错
      }
    }

    let realUsage: RealAgentUsage | null = fileMetricsUsage || (
      sessionRecord && (sessionRecord.tokens.totalTokens > 0 || sessionRecord.source !== 'unknown')
        ? {
            source: sessionRecord.source,
            inputTokens: sessionRecord.tokens.inputTokens,
            outputTokens: sessionRecord.tokens.outputTokens,
            cachedTokens: sessionRecord.tokens.cachedTokens,
            totalTokens: sessionRecord.tokens.totalTokens,
            costUsd: sessionRecord.tokens.costUsd,
            toolCallsCount: sessionRecord.toolCalls.total,
            toolAttributions: sessionRecord.toolAttributions,
            toolInefficiencies: sessionRecord.toolInefficiencies,
            model: sessionRecord.model,
            complianceScore: sessionRecord.complianceScore,
            violations: sessionRecord.violations,
          }
        : null
    );

    const complianceScore = sessionRecord ? sessionRecord.complianceScore : 100;
    const violations = sessionRecord ? sessionRecord.violations : [];

    const percent = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

    const frictionFindings = fileFrictionFindings || detectWorkflowFrictions({
      breadcrumbs: parsedBreadcrumbs,
      sessionRecord,
      spec: parsedSpec,
      plan: parsedPlan,
      state: parsedState,
      toolInefficiencies: sessionRecord?.toolInefficiencies || realUsage?.toolInefficiencies,
      violations,
      blockedSteps,
      retryCount: blockedSteps,
      diffStats: diff,
    });

    let stepSlices: StepTelemetrySlice[] = [];
    try {
      stepSlices = await extractStepTelemetrySlices(cwd, taskId, {
        taskDir,
        plan: parsedPlan,
        state: parsedState,
        spec: parsedSpec,
        anchor: lifecycleAnchor,
        sessionId: lifecycleAnchor.sessionId,
        profile,
        level,
      });
    } catch {
      // 容错
    }

    const rulesTokens = profile === 'quick' ? 600 : 1800;
    const specTokens = parsedSpec ? estimateTokens(JSON.stringify(parsedSpec)) : 500;
    const planTokens = parsedPlan ? estimateTokens(JSON.stringify(parsedPlan)) : 300;
    const totalInjectedTokens = specTokens + planTokens + rulesTokens;
    const docpathValueRoi = calculateDocPathValueRoi({
      protocolTokens: totalInjectedTokens,
      realModelTokens: realUsage?.totalTokens || 0,
      complianceScore,
      firstTimePassRate: 100,
    });

    return {
      taskId,
      taskTitle,
      backlogId,
      profile,
      level,
      phase,
      startedAt,
      durationMinutes,
      durationSeconds,
      progress: {
        totalSteps,
        passedSteps,
        blockedSteps,
        currentStep,
        currentStepTitle,
        percent,
      },
      complianceScore,
      violations,
      totalDiffLines: diff.totalDiffLines,
      filesChanged: diff.filesChanged,
      linesAdded: diff.linesAdded,
      linesDeleted: diff.linesDeleted,
      realUsage,
      sessionRecord,
      toolAttributions: sessionRecord?.toolAttributions || realUsage?.toolAttributions,
      toolInefficiencies: sessionRecord?.toolInefficiencies || realUsage?.toolInefficiencies,
      frictionFindings: frictionFindings.length > 0 ? frictionFindings : undefined,
      lifecycleAnchor,
      stepSlices: stepSlices.length > 0 ? stepSlices : undefined,
      docpathValueRoi,
    };
  } catch {
    return null;
  }
}

/**
 * 跨任务聚合工具级 Token 深度归因
 */
export function aggregateToolAttributions(tasks: TaskMetrics[]): ToolAttribution[] {
  const map: Record<string, { count: number; inputTokens: number; outputTokens: number; totalTokens: number; errorCount: number }> = {};
  let grandTotal = 0;

  for (const task of tasks) {
    const attributions = task.toolAttributions || task.realUsage?.toolAttributions || task.sessionRecord?.toolAttributions || [];
    for (const attr of attributions) {
      if (!map[attr.name]) {
        map[attr.name] = { count: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, errorCount: 0 };
      }
      map[attr.name].count += attr.count || 0;
      map[attr.name].inputTokens += attr.inputTokens || 0;
      map[attr.name].outputTokens += attr.outputTokens || 0;
      const total = attr.totalTokens || (attr.inputTokens + attr.outputTokens);
      map[attr.name].totalTokens += total;
      map[attr.name].errorCount += attr.errorCount || 0;
      grandTotal += total;
    }
  }

  const result: ToolAttribution[] = Object.entries(map).map(([name, stat]) => ({
    name,
    count: stat.count,
    inputTokens: stat.inputTokens,
    outputTokens: stat.outputTokens,
    totalTokens: stat.totalTokens,
    percentage: grandTotal > 0 ? parseFloat(((stat.totalTokens / grandTotal) * 100).toFixed(1)) : 0,
    errorCount: stat.errorCount,
  }));

  result.sort((a, b) => b.totalTokens - a.totalTokens);
  return result;
}

/**
 * 跨任务聚合工具低效与上下文浪费诊断
 */
export function aggregateToolInefficiencies(
  tasks: TaskMetrics[],
  activeTask?: ActiveTaskMetrics | null
): ToolInefficiencyFinding[] {
  const list: ToolInefficiencyFinding[] = [];
  const seen = new Set<string>();

  if (activeTask) {
    const ineffs = activeTask.toolInefficiencies || activeTask.realUsage?.toolInefficiencies || activeTask.sessionRecord?.toolInefficiencies || [];
    for (const ineff of ineffs) {
      const key = `${ineff.type}:${ineff.tool}:${ineff.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(ineff);
      }
    }
  }

  for (const task of tasks) {
    const ineffs = task.toolInefficiencies || task.realUsage?.toolInefficiencies || task.sessionRecord?.toolInefficiencies || [];
    for (const ineff of ineffs) {
      const key = `${ineff.type}:${ineff.tool}:${ineff.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(ineff);
      }
    }
  }

  const sevWeight = { high: 3, medium: 2, low: 1 };
  list.sort((a, b) => {
    const diffSev = (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0);
    if (diffSev !== 0) return diffSev;
    return (b.tokensWasted || 0) - (a.tokensWasted || 0);
  });

  return list;
}

/**
 * 跨任务聚合研发流程摩擦与阻力诊断 (Workflow Friction Aggregation)
 */
export function aggregateWorkflowFrictions(
  tasks: TaskMetrics[],
  activeTask?: ActiveTaskMetrics | null
): WorkflowFrictionFinding[] {
  const map: Record<string, WorkflowFrictionFinding> = {};

  const processFinding = (f: WorkflowFrictionFinding) => {
    if (!map[f.id]) {
      map[f.id] = { ...f };
    } else {
      map[f.id].count += f.count;
      if (typeof f.tokensWasted === 'number') {
        map[f.id].tokensWasted = (map[f.id].tokensWasted || 0) + (f.tokensWasted || 0);
      }
      if (f.severity === 'high') {
        map[f.id].severity = 'high';
      } else if (f.severity === 'medium' && map[f.id].severity !== 'high') {
        map[f.id].severity = 'medium';
      }
    }
  };

  if (activeTask?.frictionFindings) {
    for (const f of activeTask.frictionFindings) {
      processFinding(f);
    }
  }

  for (const task of tasks) {
    if (task.frictionFindings) {
      for (const f of task.frictionFindings) {
        processFinding(f);
      }
    }
  }

  const result = Object.values(map);
  const sevWeight = { high: 3, medium: 2, low: 1 };
  result.sort((a, b) => {
    const diffSev = (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0);
    if (diffSev !== 0) return diffSev;
    return b.count - a.count;
  });

  return result;
}

/**
 * 生成流程合规与 Token 消耗治理的自愈与改进建议 (Actionable Remediation Engine)
 */
export function generateRemediations(summary: {
  compliance: ComplianceSummary;
  drift: {
    quick: TokenDriftMetrics;
    standard: TokenDriftMetrics;
    overallProtocolInflationRate: number;
  };
  spikes: TaskSpikeAlert[];
  activeTask?: ActiveTaskMetrics | null;
  toolInefficiencies?: ToolInefficiencyFinding[];
  frictionFindings?: WorkflowFrictionFinding[];
}): RemediationRecommendation[] {
  const remediations: RemediationRecommendation[] = [];

  const violationsByRule = { ...(summary.compliance?.violationsByRule || {}) };
  // 纳入活跃任务的即时违规
  if (summary.activeTask?.violations) {
    for (const v of summary.activeTask.violations) {
      violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] || 0) + 1;
    }
  }

  // 1. CR-01: Quick 越级/非法修改红线
  if ((violationsByRule['CR-01'] || 0) > 0) {
    const count = violationsByRule['CR-01'];
    remediations.push({
      id: 'REM-CR01',
      severity: 'critical',
      title: 'Upgrade Quick task or promote to Standard tier',
      reason: `Found ${count} CR-01 (Quick Tiering Violation) occurrence(s). Quick profile is strictly for diff < 50 lines and localized fixes without touching scheduler or core engine.`,
      recommendedCommand: 'docpath quick upgrade',
      actionable: true,
    });
  }

  // 2. CR-02: 主会话长文本大文件直接读取
  if ((violationsByRule['CR-02'] || 0) > 0) {
    const count = violationsByRule['CR-02'];
    remediations.push({
      id: 'REM-CR02',
      severity: 'high',
      title: 'Delegate heavy file reading to subagents',
      reason: `Found ${count} CR-02 (Heavy Reads in Main Session) occurrence(s). Reading large files in the main conversation causes quadratic token context bloat.`,
      recommendedCommand: 'invoke_subagent',
      actionable: true,
    });
  }

  // 3. CR-03: 工具翻转与死循环
  if ((violationsByRule['CR-03'] || 0) > 0) {
    const count = violationsByRule['CR-03'];
    remediations.push({
      id: 'REM-CR03',
      severity: 'high',
      title: 'Break tool flapping loops with targeted single-test execution',
      reason: `Found ${count} CR-03 (Flapping Loops) occurrence(s). Avoid repeated full test suites during debugging; run targeted single tests instead.`,
      recommendedCommand: 'node --test <single-test-path>',
      actionable: true,
    });
  }

  // 4. CR-04: 跨任务不轮转长会话
  if ((violationsByRule['CR-04'] || 0) > 0) {
    const count = violationsByRule['CR-04'];
    remediations.push({
      id: 'REM-CR04',
      severity: 'high',
      title: 'Rotate long-running agent sessions',
      reason: `Found ${count} CR-04 (Unrotated Session) occurrence(s). Long multi-turn sessions degrade reasoning and inflate token consumption. End current session and start fresh.`,
      recommendedCommand: 'docpath start <task-id>',
      actionable: true,
    });
  }

  // 5. CR-05: 架构与跨模块变更缺少 Decision Brief
  if ((violationsByRule['CR-05'] || 0) > 0) {
    const count = violationsByRule['CR-05'];
    remediations.push({
      id: 'REM-CR05',
      severity: 'medium',
      title: 'Record architectural Decision Brief in spec',
      reason: `Found ${count} CR-05 (Missing Decision Brief) occurrence(s). Architecture or cross-module changes require explicit Decision Brief in spec.md before implementation.`,
      recommendedCommand: 'docpath spec refine --brief',
      actionable: true,
    });
  }

  // 6. 协议膨胀率 > 10%
  const overallInflation = summary.drift?.overallProtocolInflationRate || 0;
  const standardInflation = summary.drift?.standard?.protocolInflationRate || 0;
  const quickInflation = summary.drift?.quick?.protocolInflationRate || 0;
  const maxInflation = Math.max(overallInflation, standardInflation, quickInflation);

  if (maxInflation > 10) {
    const formattedInflation = maxInflation > 0 ? `+${maxInflation}%` : `${maxInflation}%`;
    remediations.push({
      id: 'REM-PROTOCOL-INFLATION',
      severity: 'medium',
      title: 'Deduplicate rules and prune prompt token bloat',
      reason: `Protocol inflation rate (${formattedInflation}) exceeds 10% threshold. Prompt overhead is growing over historical baseline.`,
      recommendedCommand: 'docpath rule dedupe',
      actionable: true,
    });
  }

  // 7. Token 异常突增告警
  if (summary.spikes && summary.spikes.length > 0) {
    const firstSpike = summary.spikes[0];
    remediations.push({
      id: 'REM-TOKEN-SPIKE',
      severity: 'high',
      title: 'Inspect anomalous token spike tasks',
      reason: `Detected ${summary.spikes.length} task(s) with token consumption exceeding 2.5x baseline median (e.g. ${firstSpike.taskId} used ~${firstSpike.realTokens.toLocaleString()} tokens, ${firstSpike.spikeRatio}x baseline).`,
      recommendedCommand: `docpath stats --task ${firstSpike.taskId}`,
      actionable: true,
    });
  }

  // 8. 工具低效与上下文浪费建议 (Tool Inefficiencies)
  const ineffList: ToolInefficiencyFinding[] = [
    ...(summary.toolInefficiencies || []),
    ...(summary.activeTask?.toolInefficiencies || []),
    ...(summary.activeTask?.realUsage?.toolInefficiencies || []),
    ...(summary.activeTask?.sessionRecord?.toolInefficiencies || []),
  ];

  // 8.1 REM-DUP-READS: 重复读取相同文件
  const dupReads = ineffList.filter((i) => i.type === 'duplicate_file_reads');
  if (dupReads.length > 0) {
    const totalWasted = dupReads.reduce((sum, i) => sum + (i.tokensWasted || 0), 0);
    remediations.push({
      id: 'REM-DUP-READS',
      severity: totalWasted > 5000 ? 'high' : 'medium',
      title: 'Delegate file exploration or cache duplicate reads',
      reason: `Detected ${dupReads.length} repeated file read pattern(s) wasting ~${totalWasted.toLocaleString()} tokens. Reading the same file repeatedly bloats context.`,
      recommendedCommand: 'invoke_subagent',
      actionable: true,
    });
  }

  // 8.2 REM-OVERSIZED-OUTPUT: 超长命令输出
  const oversized = ineffList.filter((i) => i.type === 'oversized_command_output');
  if (oversized.length > 0) {
    const totalWasted = oversized.reduce((sum, i) => sum + (i.tokensWasted || 0), 0);
    remediations.push({
      id: 'REM-OVERSIZED-OUTPUT',
      severity: 'high',
      title: 'Truncate command output or run targeted test slice',
      reason: `Detected ${oversized.length} oversized command output(s) wasting ~${totalWasted.toLocaleString()} tokens. Uncapped command outputs saturate context.`,
      recommendedCommand: 'node --test <single-test>',
      actionable: true,
    });
  }

  // 8.3 REM-EDIT-MISS: 代码编辑目标失真与重试
  const editMisses = ineffList.filter((i) => i.type === 'edit_target_miss');
  if (editMisses.length > 0) {
    const totalWasted = editMisses.reduce((sum, i) => sum + (i.tokensWasted || 0), 0);
    remediations.push({
      id: 'REM-EDIT-MISS',
      severity: 'high',
      title: 'Inspect target file content before replacing',
      reason: `Detected ${editMisses.length} replace target miss/failure(s) wasting ~${totalWasted.toLocaleString()} tokens. Replace target strings must match exact file content.`,
      recommendedCommand: 'docpath check',
      actionable: true,
    });
  }

  // 9. 研发流程摩擦治理建议 (Workflow Friction Remediations)
  const frictionList: WorkflowFrictionFinding[] = [
    ...(summary.frictionFindings || []),
    ...(summary.activeTask?.frictionFindings || []),
  ];

  // 9.1 REM-FRICTION-CMD: 命令调用错误
  const cmdErrFrictions = frictionList.filter((f) => f.category === 'command_error');
  if (cmdErrFrictions.length > 0) {
    const totalCount = cmdErrFrictions.reduce((sum, f) => sum + f.count, 0);
    remediations.push({
      id: 'REM-FRICTION-CMD',
      severity: totalCount >= 3 ? 'high' : 'medium',
      title: 'Fix invalid CLI command invocations',
      reason: `Detected ${totalCount} command execution error(s). Review command options and usage in docpath --help or AGENTS.md.`,
      recommendedCommand: 'docpath next --agent',
      actionable: true,
    });
  }

  // 9.2 REM-FRICTION-GATE: 质量门禁与构建拦截阻力
  const gateFrictions = frictionList.filter((f) => f.category === 'gate_block');
  if (gateFrictions.length > 0) {
    const totalCount = gateFrictions.reduce((sum, f) => sum + f.count, 0);
    remediations.push({
      id: 'REM-FRICTION-GATE',
      severity: totalCount >= 2 ? 'high' : 'medium',
      title: 'Resolve quality gate failures with targeted verification',
      reason: `Detected ${totalCount} quality gate / check blockage(s). Run targeted unit tests to fix issues before full gate checks.`,
      recommendedCommand: 'docpath check',
      actionable: true,
    });
  }

  // 9.3 REM-FRICTION-REWORK: 步骤返工与重试阻力
  const reworkFrictions = frictionList.filter((f) => f.category === 'step_rework');
  if (reworkFrictions.length > 0) {
    const totalCount = reworkFrictions.reduce((sum, f) => sum + f.count, 0);
    remediations.push({
      id: 'REM-FRICTION-REWORK',
      severity: totalCount >= 2 ? 'high' : 'medium',
      title: 'Decompose blocked steps or delegate to subagents',
      reason: `Detected ${totalCount} step rework or retry event(s). Claim steps cleanly and delegate complex steps to Worker subagents.`,
      recommendedCommand: 'docpath go --step <step-id>',
      actionable: true,
    });
  }

  // 9.4 REM-FRICTION-SPEC: 需求与规格决策摩擦
  const specFrictions = frictionList.filter((f) => f.category === 'spec_friction');
  if (specFrictions.length > 0 && !violationsByRule['CR-05']) {
    const totalCount = specFrictions.reduce((sum, f) => sum + f.count, 0);
    remediations.push({
      id: 'REM-FRICTION-SPEC',
      severity: 'medium',
      title: 'Resolve specification ambiguity and record Decision Brief',
      reason: `Detected ${totalCount} spec ambiguity/friction event(s). Record clear decisions and refine acceptance criteria.`,
      recommendedCommand: 'docpath spec refine --brief',
      actionable: true,
    });
  }

  return remediations;
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
  const activeTask = await probeActiveTaskMetrics(cwd);

  const compliance = calculateComplianceSummary(allTasks);
  const drift = calculateTokenDrift(allTasks);
  const spikes = detectTaskSpikes(allTasks, drift);
  const recentTasks = allTasks.slice(0, limit);
  const globalToolAttributions = aggregateToolAttributions(recentTasks.length > 0 ? recentTasks : allTasks);
  const globalToolInefficiencies = aggregateToolInefficiencies(recentTasks.length > 0 ? recentTasks : allTasks, activeTask);
  const globalFrictionFindings = aggregateWorkflowFrictions(recentTasks.length > 0 ? recentTasks : allTasks, activeTask);

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

  let docpathValueRoi: DocPathValueRoi;
  if (allTasks.length === 0 && activeTask?.docpathValueRoi) {
    docpathValueRoi = activeTask.docpathValueRoi;
  } else {
    const totalProtocolTokens = allTasks.reduce((sum, t) => sum + (t.protocol?.totalInjectedTokens || 0), 0);
    const totalRealTokens = allTasks.reduce((sum, t) => sum + (t.realUsage?.totalTokens || 0), 0);
    docpathValueRoi = calculateDocPathValueRoi({
      protocolTokens: totalProtocolTokens,
      realModelTokens: totalRealTokens,
      complianceScore: compliance.avgComplianceScore,
      firstTimePassRate: baseSummary.avgFirstTimePassRate,
    });
  }

  const partialSummary = {
    totalTasks: baseSummary.totalTasks,
    healthIndex: compliance.avgComplianceScore,
    compliance,
    drift,
    spikes,
    realUsageSummary,
    globalToolAttributions,
    globalToolInefficiencies,
    toolInefficiencies: globalToolInefficiencies,
    globalFrictionFindings,
    frictionFindings: globalFrictionFindings,
    workflowFrictions: globalFrictionFindings,
    activeTask,
    recentTasks,
    docpathValueRoi,
  };

  const remediations = generateRemediations(partialSummary);

  return {
    ...partialSummary,
    remediations,
  };
}

/**
 * 格式化 Token 计数，清晰展示百万/千级缩写 (Clean Token Formatter)
 */
export function formatTokens(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1);
    return `${n.toLocaleString()} (~${val}M)`;
  }
  if (n >= 1_000) {
    const val = Math.round((n / 1_000) * 10) / 10;
    return `${n.toLocaleString()} (~${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}K)`;
  }
  return n.toLocaleString();
}



