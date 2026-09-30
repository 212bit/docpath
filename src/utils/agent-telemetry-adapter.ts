/**
 * Agent Session Telemetry & Compliance Audit Adapter (Layer 1 Utils)
 *
 * Provides unified telemetry ingestion across Antigravity transcripts,
 * environment variables, and DocPath breadcrumbs, coupled with a strict
 * compliance audit engine (CR-01 ~ CR-05) to detect workflow violations.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { estimateTokens } from './document-index.js';
import { resolveDocpathDir } from './file.js';

export interface TelemetryTokens {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  costUsd?: number;
}

export interface TelemetryToolCallSummary {
  name: string;
  count: number;
  errorCount: number;
}

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceViolation {
  ruleId: 'CR-01' | 'CR-02' | 'CR-03' | 'CR-04' | 'CR-05' | string;
  ruleName: string;
  severity: ComplianceSeverity;
  description: string;
  penalty: number;
  evidence?: Record<string, any>;
}

export interface SessionTelemetryRecord {
  source: 'antigravity' | 'claude' | 'opencode' | 'env' | 'breadcrumb' | 'unknown';
  sessionId?: string;
  model?: string;
  tokens: TelemetryTokens;
  toolCalls: {
    total: number;
    byName: Record<string, number>;
    details?: TelemetryToolCallSummary[];
  };
  turnsCount: number;
  errorCount: number;
  heavyReadsCount?: number;
  flappingCount?: number;
  violations: ComplianceViolation[];
  complianceScore: number; // 0-100
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalDiffLines: number;
  changedFiles?: string[];
}

export interface TelemetryProbeOptions {
  cwd: string;
  taskId: string;
  startedAt?: string;
  completedAt?: string;
  profile?: 'quick' | 'standard';
  level?: number;
  diffStats?: DiffStats;
  spec?: Record<string, any>;
  plan?: Record<string, any>;
  state?: Record<string, any>;
  brainDir?: string;
  transcriptPath?: string;
  env?: Record<string, string | undefined>;
}

export interface ComplianceAuditContext {
  profile?: 'quick' | 'standard';
  level?: number;
  diffStats?: DiffStats;
  turnsCount: number;
  errorCount: number;
  heavyReadsCount: number;
  flappingCount: number;
  totalTokens: number;
  durationMinutes: number;
  spec?: Record<string, any>;
  toolCalls?: Record<string, number>;
}

/**
 * 违规红线规则定义与判定引擎
 */
export class ComplianceAuditor {
  // CR-01: Quick 严禁修改核心调度器、引擎及协议文件
  public static FORBIDDEN_QUICK_PATTERNS = [
    /src\/commands\/(?:agent|check|done|runtime)\.ts$/,
    /src\/engine\//,
    /\.docpath\/rules\//,
    /AGENTS\.md$/,
  ];

  public static evaluate(context: ComplianceAuditContext): {
    violations: ComplianceViolation[];
    complianceScore: number;
  } {
    const violations: ComplianceViolation[] = [];

    const profile = context.profile || 'standard';
    const level = context.level ?? 2;
    const diff = context.diffStats || {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      totalDiffLines: 0,
      changedFiles: [],
    };

    // CR-01: Tiering 违规 (quick 越级或超限)
    if (profile === 'quick') {
      const changedFiles = diff.changedFiles || [];
      const forbiddenTouched = changedFiles.filter((f) =>
        ComplianceAuditor.FORBIDDEN_QUICK_PATTERNS.some((pattern) => pattern.test(f))
      );

      if (forbiddenTouched.length > 0) {
        violations.push({
          ruleId: 'CR-01',
          ruleName: 'Quick Tiering Violation (Forbidden Files)',
          severity: 'critical',
          description: `Quick 工作流严禁修改调度器/引擎/协议文件，但触碰了: ${forbiddenTouched.join(', ')}`,
          penalty: 35,
          evidence: { forbiddenTouched, changedFiles },
        });
      } else if (diff.totalDiffLines > 50) {
        violations.push({
          ruleId: 'CR-01',
          ruleName: 'Quick Tiering Violation (Diff Threshold Exceeded)',
          severity: 'high',
          description: `Quick 工作流限额 ≤ 50 行 Diff，当前变更已达 ${diff.totalDiffLines} 行`,
          penalty: 25,
          evidence: { totalDiffLines: diff.totalDiffLines, limit: 50 },
        });
      }
    }

    // CR-02: 工具滥用 (主会话大文件泛读或脚本编辑绕过)
    if (context.heavyReadsCount >= 3) {
      violations.push({
        ruleId: 'CR-02',
        ruleName: 'Tool Misuse / Heavy File Reads',
        severity: 'medium',
        description: `主会话中直接发生了 ${context.heavyReadsCount} 次大文件/全量读取，未通过子代理派发或定向切片`,
        penalty: 15,
        evidence: { heavyReadsCount: context.heavyReadsCount },
      });
    }

    // CR-03: 翻转死循环与连续失败重试
    if (context.flappingCount > 0 || context.errorCount >= 4) {
      violations.push({
        ruleId: 'CR-03',
        ruleName: 'Flapping Tool / Harness Retry Loops',
        severity: 'high',
        description: `检测到 ${context.flappingCount} 次连续相同工具/命令重试死循环或 ${context.errorCount} 次工具执行错误`,
        penalty: 20,
        evidence: { flappingCount: context.flappingCount, errorCount: context.errorCount },
      });
    }

    // CR-04: 跨任务未轮转的长会话 (Token / Turn 爆炸)
    if (context.turnsCount > 35 || context.totalTokens > 150_000 || context.durationMinutes > 60) {
      violations.push({
        ruleId: 'CR-04',
        ruleName: 'Unrotated Long Session',
        severity: 'medium',
        description: `会话未及时轮转（轮次: ${context.turnsCount}, 消耗: ${context.totalTokens} Tokens, 时长: ${context.durationMinutes} 分钟），存在上下文爆炸风险`,
        penalty: 15,
        evidence: {
          turnsCount: context.turnsCount,
          totalTokens: context.totalTokens,
          durationMinutes: context.durationMinutes,
        },
      });
    }

    // CR-05: 架构与重大变更缺少决策简报 (Decision Brief)
    if (profile === 'standard' && level >= 2) {
      const spec = context.spec;
      const majorGate = spec?.major_change_gate;
      const decisionBrief = spec?.decision_brief;

      const isMajorRequired = majorGate?.required === true;
      const isDecisionBriefMissing =
        !decisionBrief ||
        !decisionBrief.problem ||
        !decisionBrief.chosen ||
        decisionBrief.problem === '待确认' ||
        decisionBrief.chosen === '待确认';

      if (isMajorRequired && isDecisionBriefMissing) {
        violations.push({
          ruleId: 'CR-05',
          ruleName: 'Missing Decision Brief for Major Change',
          severity: 'high',
          description: '涉及架构/技术栈/协议等重大变更（Major Change Gate），但未在 spec 中提供完整决策简报与确认',
          penalty: 20,
          evidence: { majorGate, decisionBrief },
        });
      }
    }

    const totalPenalties = violations.reduce((acc, v) => acc + v.penalty, 0);
    const complianceScore = Math.max(0, Math.min(100, 100 - totalPenalties));

    return {
      violations,
      complianceScore,
    };
  }
}

/**
 * Antigravity / Gemini CLI transcript 遥测适配器
 */
export class AntigravityTelemetryAdapter {
  public static parseTranscript(
    content: string,
    options?: { startTime?: number; endTime?: number }
  ): {
    tokens: TelemetryTokens;
    toolCalls: { total: number; byName: Record<string, number>; errorCount: number };
    turnsCount: number;
    errorCount: number;
    heavyReadsCount: number;
    flappingCount: number;
    model?: string;
    sessionId?: string;
    durationMs?: number;
  } {
    const lines = content.split('\n').filter((l) => l.trim());
    let toolCallsTotal = 0;
    const byName: Record<string, number> = {};
    let errorCount = 0;
    let heavyReadsCount = 0;
    let flappingCount = 0;
    let turnsCount = 0;
    let totalEstimated = 0;
    let firstTimestamp = 0;
    let lastTimestamp = 0;
    let detectedModel: string | undefined;

    let lastFailedToolOrCmd: string | null = null;
    let consecutiveFailures = 0;

    const startTime = options?.startTime;
    const endTime = options?.endTime;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryTime = entry.created_at ? new Date(entry.created_at).getTime() : 0;

        if (entryTime) {
          if (!firstTimestamp || entryTime < firstTimestamp) firstTimestamp = entryTime;
          if (entryTime > lastTimestamp) lastTimestamp = entryTime;
        }

        // 时间窗口过滤 (若提供了有效时间范围)
        if (startTime && endTime) {
          if (entryTime && (entryTime < startTime - 30_000 || entryTime > endTime + 30_000)) {
            continue;
          }
        }

        if (entry.type === 'USER_INPUT' || entry.type === 'PLANNER_RESPONSE') {
          turnsCount++;
        }

        if (entry.model && !detectedModel) {
          detectedModel = entry.model;
        }

        // Token 估算
        if (entry.content) {
          totalEstimated += estimateTokens(entry.content);
        }
        if (entry.thinking) {
          totalEstimated += estimateTokens(entry.thinking);
        }

        // 工具调用分析
        if (Array.isArray(entry.tool_calls)) {
          for (const tc of entry.tool_calls) {
            toolCallsTotal++;
            const name = tc.name || 'unknown';
            byName[name] = (byName[name] || 0) + 1;

            if (tc.args) {
              totalEstimated += estimateTokens(JSON.stringify(tc.args));

              // 检测大文件泛读
              if (name === 'view_file') {
                const startLine = tc.args.StartLine;
                const endLine = tc.args.EndLine;
                if (
                  (typeof startLine === 'number' && typeof endLine === 'number' && endLine - startLine > 500) ||
                  (!startLine && !endLine)
                ) {
                  heavyReadsCount++;
                }
              }
            }
          }
        }

        // 工具执行结果与失败检测
        const isErrorStatus = entry.status === 'ERROR' || entry.status === 'FAILED';
        const hasErrorContent =
          typeof entry.content === 'string' &&
          (entry.content.includes('Command failed with exit code') ||
            entry.content.includes('The command exited with code 1') ||
            entry.content.includes('The command exited with code 2') ||
            entry.content.includes('Error:') ||
            entry.content.includes('UnhandledPromiseRejection'));

        if (isErrorStatus || hasErrorContent) {
          errorCount++;
          const currentToolOrCmd = entry.type || 'unknown_tool';
          if (currentToolOrCmd === lastFailedToolOrCmd) {
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              flappingCount++;
            }
          } else {
            lastFailedToolOrCmd = currentToolOrCmd;
            consecutiveFailures = 1;
          }
        } else if (entry.status === 'DONE' && !hasErrorContent) {
          consecutiveFailures = 0;
          lastFailedToolOrCmd = null;
        }
      } catch {
        // ignore malformed line
      }
    }

    const inputTokens = Math.round(totalEstimated * 0.7);
    const outputTokens = Math.round(totalEstimated * 0.3);
    const durationMs = lastTimestamp && firstTimestamp ? Math.max(0, lastTimestamp - firstTimestamp) : 0;

    return {
      tokens: {
        inputTokens,
        outputTokens,
        totalTokens: totalEstimated,
        costUsd: parseFloat(((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(4)),
      },
      toolCalls: {
        total: toolCallsTotal,
        byName,
        errorCount,
      },
      turnsCount: Math.max(1, turnsCount),
      errorCount,
      heavyReadsCount,
      flappingCount,
      model: detectedModel,
      durationMs,
    };
  }

  public static async probe(options: TelemetryProbeOptions): Promise<SessionTelemetryRecord | null> {
    try {
      let transcriptPath = options.transcriptPath;

      if (!transcriptPath) {
        const appDataDir =
          options.brainDir ||
          process.env.GEMINI_CLI_APP_DATA_DIR ||
          join(homedir(), '.gemini', 'antigravity-cli');
        const brainDir = join(appDataDir, 'brain');

        if (existsSync(brainDir)) {
          const convEntries = await readdir(brainDir, { withFileTypes: true });
          let latestTranscript: string | null = null;
          let latestMtime = 0;
          const startTime = options.startedAt ? new Date(options.startedAt).getTime() : 0;

          for (const conv of convEntries) {
            if (!conv.isDirectory()) continue;
            const tp = join(brainDir, conv.name, '.system_generated', 'logs', 'transcript.jsonl');
            if (existsSync(tp)) {
              const s = await stat(tp);
              if (s.mtimeMs > latestMtime && (!startTime || s.mtimeMs >= startTime - 60_000)) {
                latestMtime = s.mtimeMs;
                latestTranscript = tp;
              }
            }
          }
          transcriptPath = latestTranscript || undefined;
        }
      }

      if (!transcriptPath || !existsSync(transcriptPath)) {
        return null;
      }

      const content = await readFile(transcriptPath, 'utf-8');
      const startTime = options.startedAt ? new Date(options.startedAt).getTime() : undefined;
      const endTime = options.completedAt ? new Date(options.completedAt).getTime() : undefined;

      const parsed = AntigravityTelemetryAdapter.parseTranscript(content, { startTime, endTime });

      const durationMinutes = parsed.durationMs
        ? Math.round(parsed.durationMs / 60000)
        : options.startedAt && options.completedAt
          ? Math.max(1, Math.round((new Date(options.completedAt).getTime() - new Date(options.startedAt).getTime()) / 60000))
          : 5;

      const audit = ComplianceAuditor.evaluate({
        profile: options.profile,
        level: options.level,
        diffStats: options.diffStats,
        turnsCount: parsed.turnsCount,
        errorCount: parsed.errorCount,
        heavyReadsCount: parsed.heavyReadsCount,
        flappingCount: parsed.flappingCount,
        totalTokens: parsed.tokens.totalTokens,
        durationMinutes,
        spec: options.spec,
        toolCalls: parsed.toolCalls.byName,
      });

      return {
        source: 'antigravity',
        sessionId: basename(join(transcriptPath, '..', '..')),
        model: parsed.model,
        tokens: parsed.tokens,
        toolCalls: parsed.toolCalls,
        turnsCount: parsed.turnsCount,
        errorCount: parsed.errorCount,
        heavyReadsCount: parsed.heavyReadsCount,
        flappingCount: parsed.flappingCount,
        violations: audit.violations,
        complianceScore: audit.complianceScore,
        durationMs: parsed.durationMs,
      };
    } catch {
      return null;
    }
  }
}

/**
 * 环境变量遥测适配器 (标准 DOCPATH_AGENT_* 注入)
 */
export class EnvTelemetryAdapter {
  public static async probe(options: TelemetryProbeOptions): Promise<SessionTelemetryRecord | null> {
    const env = options.env || process.env;
    if (!env.DOCPATH_AGENT_INPUT_TOKENS && !env.DOCPATH_AGENT_TOTAL_TOKENS && !env.DOCPATH_AGENT_TURNS) {
      return null;
    }

    const inputTokens = parseInt(env.DOCPATH_AGENT_INPUT_TOKENS || '0', 10);
    const outputTokens = parseInt(env.DOCPATH_AGENT_OUTPUT_TOKENS || '0', 10);
    const totalTokens = parseInt(env.DOCPATH_AGENT_TOTAL_TOKENS || `${inputTokens + outputTokens}`, 10);
    const costUsd = env.DOCPATH_AGENT_COST_USD ? parseFloat(env.DOCPATH_AGENT_COST_USD) : undefined;
    const model = env.DOCPATH_AGENT_MODEL;
    const sessionId = env.DOCPATH_AGENT_SESSION_ID;
    const source = (env.DOCPATH_AGENT_SOURCE as SessionTelemetryRecord['source']) || 'env';
    const turnsCount = parseInt(env.DOCPATH_AGENT_TURNS || '1', 10);
    const errorCount = parseInt(env.DOCPATH_AGENT_ERRORS || '0', 10);
    const toolCallsCount = parseInt(env.DOCPATH_AGENT_TOOL_CALLS || '0', 10);

    const durationMinutes = options.startedAt && options.completedAt
      ? Math.max(1, Math.round((new Date(options.completedAt).getTime() - new Date(options.startedAt).getTime()) / 60000))
      : 5;

    const audit = ComplianceAuditor.evaluate({
      profile: options.profile,
      level: options.level,
      diffStats: options.diffStats,
      turnsCount,
      errorCount,
      heavyReadsCount: 0,
      flappingCount: 0,
      totalTokens,
      durationMinutes,
      spec: options.spec,
    });

    return {
      source,
      sessionId,
      model,
      tokens: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
      },
      toolCalls: {
        total: toolCallsCount,
        byName: {},
      },
      turnsCount,
      errorCount,
      violations: audit.violations,
      complianceScore: audit.complianceScore,
    };
  }
}

/**
 * 降级 DocPath 面包屑 (breadcrumb.jsonl) 适配器
 */
export class FallbackBreadcrumbAdapter {
  public static async probe(options: TelemetryProbeOptions): Promise<SessionTelemetryRecord | null> {
    try {
      const docpathDir = await resolveDocpathDir(options.cwd);
      const candidates = [
        join(docpathDir, 'tasks', options.taskId, 'breadcrumb.jsonl'),
        join(docpathDir, 'tasks', 'done', options.taskId, 'breadcrumb.jsonl'),
        join(docpathDir, 'tasks', 'current', 'breadcrumb.jsonl'),
        join(docpathDir, 'workspace', 'breadcrumb.jsonl'),
      ];

      let breadcrumbPath: string | null = null;
      for (const p of candidates) {
        if (existsSync(p)) {
          breadcrumbPath = p;
          break;
        }
      }

      if (!breadcrumbPath) return null;

      const raw = await readFile(breadcrumbPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return null;

      let turnsCount = lines.length;
      let errorCount = 0;
      let blockedSteps = 0;
      let estimatedTokens = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          estimatedTokens += estimateTokens(line);
          if (entry.status === 'blocked' || entry.gate_verdict === 'fail') {
            errorCount++;
            blockedSteps++;
          }
        } catch {
          // ignore
        }
      }

      const inputTokens = Math.round(estimatedTokens * 0.7);
      const outputTokens = Math.round(estimatedTokens * 0.3);
      const durationMinutes = options.startedAt && options.completedAt
        ? Math.max(1, Math.round((new Date(options.completedAt).getTime() - new Date(options.startedAt).getTime()) / 60000))
        : 5;

      const audit = ComplianceAuditor.evaluate({
        profile: options.profile,
        level: options.level,
        diffStats: options.diffStats,
        turnsCount,
        errorCount,
        heavyReadsCount: 0,
        flappingCount: blockedSteps >= 3 ? 1 : 0,
        totalTokens: estimatedTokens,
        durationMinutes,
        spec: options.spec,
      });

      return {
        source: 'breadcrumb',
        tokens: {
          inputTokens,
          outputTokens,
          totalTokens: estimatedTokens,
        },
        toolCalls: {
          total: turnsCount,
          byName: {},
        },
        turnsCount,
        errorCount,
        violations: audit.violations,
        complianceScore: audit.complianceScore,
      };
    } catch {
      return null;
    }
  }
}

/**
 * 统一遥测探针入口：按优先级调度各适配器并完成流程审计
 */
export async function resolveAgentTelemetry(
  options: TelemetryProbeOptions
): Promise<SessionTelemetryRecord> {
  // 1. 显式环境变量优先
  const envRecord = await EnvTelemetryAdapter.probe(options);
  if (envRecord) return envRecord;

  // 2. 真实 Antigravity / Gemini CLI 会话日志
  const antigravityRecord = await AntigravityTelemetryAdapter.probe(options);
  if (antigravityRecord) return antigravityRecord;

  // 3. Fallback 到 DocPath breadcrumb.jsonl
  const breadcrumbRecord = await FallbackBreadcrumbAdapter.probe(options);
  if (breadcrumbRecord) return breadcrumbRecord;

  // 4. 默认兜底合规记录
  const audit = ComplianceAuditor.evaluate({
    profile: options.profile,
    level: options.level,
    diffStats: options.diffStats,
    turnsCount: 1,
    errorCount: 0,
    heavyReadsCount: 0,
    flappingCount: 0,
    totalTokens: 0,
    durationMinutes: 1,
    spec: options.spec,
  });

  return {
    source: 'unknown',
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    toolCalls: {
      total: 0,
      byName: {},
    },
    turnsCount: 1,
    errorCount: 0,
    violations: audit.violations,
    complianceScore: audit.complianceScore,
  };
}

export type { ActiveTaskMetrics, ActiveTaskStepProgress } from './task-metrics.js';
export { probeActiveTaskMetrics } from './task-metrics.js';

