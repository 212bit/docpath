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

export interface ToolAttribution {
  name: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percentage: number; // 0 - 100
  errorCount: number;
}

export interface ToolInefficiencyFinding {
  type: 'duplicate_file_reads' | 'oversized_command_output' | 'edit_target_miss' | 'unbudgeted_web_searches';
  severity: 'high' | 'medium' | 'low';
  tool: string;
  description: string;
  tokensWasted: number;
  evidence?: Record<string, any>;
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
  source: 'antigravity' | 'claude' | 'opencode' | 'zcode' | 'env' | 'breadcrumb' | 'unknown';
  sessionId?: string;
  model?: string;
  tokens: TelemetryTokens;
  toolCalls: {
    total: number;
    byName: Record<string, number>;
    details?: TelemetryToolCallSummary[];
  };
  toolAttributions?: ToolAttribution[];
  toolInefficiencies?: ToolInefficiencyFinding[];
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
  zcodeDbPath?: string;
  zcodeRolloutDir?: string;
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
    toolAttributions: ToolAttribution[];
    toolInefficiencies: ToolInefficiencyFinding[];
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
    const toolStatsMap = new Map<string, { count: number; inputTokens: number; outputTokens: number; errorCount: number }>();
    const pendingToolCalls: Array<{ name: string; args?: Record<string, any>; inputTokens: number }> = [];
    const fileReadStats = new Map<string, { count: number; totalTokens: number; readTokens: number[] }>();
    const oversizedOutputs: Array<{ cmd: string; outputTokens: number; wasted: number }> = [];
    const editMisses: Array<{ targetFile: string; inputTokens: number; outputTokens: number; error: string }> = [];

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

            const stat = toolStatsMap.get(name) || { count: 0, inputTokens: 0, outputTokens: 0, errorCount: 0 };
            stat.count++;

            let argsTokens = 0;
            if (tc.args) {
              argsTokens = estimateTokens(JSON.stringify(tc.args));
              totalEstimated += argsTokens;
              stat.inputTokens += argsTokens;

              // 检测大文件泛读与重复文件读取统计
              if (name === 'view_file') {
                const startLine = tc.args.StartLine;
                const endLine = tc.args.EndLine;
                if (
                  (typeof startLine === 'number' && typeof endLine === 'number' && endLine - startLine > 500) ||
                  (!startLine && !endLine)
                ) {
                  heavyReadsCount++;
                }

                const filePath = tc.args.AbsolutePath || tc.args.TargetFile || tc.args.path || 'unknown_file';
                const fileStat = fileReadStats.get(filePath) || { count: 0, totalTokens: 0, readTokens: [] };
                fileStat.count++;
                fileStat.totalTokens += argsTokens;
                fileReadStats.set(filePath, fileStat);
              }
            }
            toolStatsMap.set(name, stat);
            pendingToolCalls.push({ name, args: tc.args, inputTokens: argsTokens });
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

        const isToolError = isErrorStatus || hasErrorContent;

        // 工具执行响应 Token 归因
        if (entry.type !== 'USER_INPUT' && entry.type !== 'PLANNER_RESPONSE') {
          let matchedItem: { name: string; args?: Record<string, any>; inputTokens: number } | undefined;
          const normalizedType = typeof entry.type === 'string' ? entry.type.toLowerCase().replace(/[\s_-]+/g, '') : '';

          if (pendingToolCalls.length > 0) {
            const idx = pendingToolCalls.findIndex((t) => t.name.toLowerCase().replace(/[\s_-]+/g, '') === normalizedType);
            if (idx >= 0) {
              matchedItem = pendingToolCalls.splice(idx, 1)[0];
            } else {
              matchedItem = pendingToolCalls.shift();
            }
          }

          const matchedToolName = matchedItem?.name || entry.tool_name || entry.name || (
            Array.from(toolStatsMap.keys()).find((k) => k.toLowerCase().replace(/[\s_-]+/g, '') === normalizedType)
          );

          if (matchedToolName) {
            const stat = toolStatsMap.get(matchedToolName) || { count: 0, inputTokens: 0, outputTokens: 0, errorCount: 0 };
            let outTokens = 0;
            if (entry.content) {
              const outContent = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
              outTokens = estimateTokens(outContent);
              stat.outputTokens += outTokens;
            }
            if (isToolError) {
              stat.errorCount += 1;
            }
            toolStatsMap.set(matchedToolName, stat);

            // 1. 重复读取文件 Token 归因
            if (matchedToolName === 'view_file') {
              const filePath = matchedItem?.args?.AbsolutePath || matchedItem?.args?.TargetFile || matchedItem?.args?.path || 'unknown_file';
              const fileStat = fileReadStats.get(filePath);
              if (fileStat) {
                fileStat.totalTokens += outTokens;
                fileStat.readTokens.push((matchedItem?.inputTokens || 0) + outTokens);
              }
            }

            // 2. 超长命令输出检测 (run_command 输出 > 2000 tokens)
            if (matchedToolName === 'run_command' && outTokens > 2000) {
              const cmd = matchedItem?.args?.CommandLine || 'run_command';
              const wasted = Math.max(0, outTokens - 500);
              oversizedOutputs.push({ cmd, outputTokens: outTokens, wasted });
            }

            // 3. 代码编辑目标失真与重试检测 (replace_file_content 错误)
            if (matchedToolName === 'replace_file_content' && isToolError) {
              const targetFile = matchedItem?.args?.TargetFile || matchedItem?.args?.AbsolutePath || 'unknown';
              const inputTokens = matchedItem?.inputTokens || 200;
              editMisses.push({
                targetFile,
                inputTokens,
                outputTokens: outTokens,
                error: typeof entry.content === 'string' ? entry.content : 'Edit target miss / failure',
              });
            }
          } else {
            // 兜底未匹配到 pending 工具调用时的直接检测
            let outTokens = 0;
            if (entry.content) {
              const outContent = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
              outTokens = estimateTokens(outContent);
            }
            if (normalizedType === 'runcommand' && outTokens > 2000) {
              oversizedOutputs.push({ cmd: 'run_command', outputTokens: outTokens, wasted: Math.max(0, outTokens - 500) });
            }
            if (normalizedType === 'replacefilecontent' && isToolError) {
              editMisses.push({ targetFile: 'unknown', inputTokens: 200, outputTokens: outTokens, error: 'Edit failure' });
            }
          }
        }

        if (isToolError) {
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

    const toolAttributions: ToolAttribution[] = Array.from(toolStatsMap.entries()).map(([name, stat]) => {
      const totalTokens = stat.inputTokens + stat.outputTokens;
      const percentage = totalEstimated > 0
        ? parseFloat(((totalTokens / totalEstimated) * 100).toFixed(1))
        : 0;
      return {
        name,
        count: stat.count,
        inputTokens: stat.inputTokens,
        outputTokens: stat.outputTokens,
        totalTokens,
        percentage,
        errorCount: stat.errorCount,
      };
    });

    toolAttributions.sort((a, b) => b.totalTokens - a.totalTokens);

    // 汇总工具低效诊断 (Tool Inefficiencies)
    const toolInefficiencies: ToolInefficiencyFinding[] = [];

    // 1. 重复读取相同文件 (view_file 同路径 >= 3 次)
    for (const [filePath, stat] of fileReadStats.entries()) {
      if (stat.count >= 3) {
        let tokensWasted = 0;
        if (stat.readTokens.length >= 2) {
          tokensWasted = stat.readTokens.slice(1).reduce((sum, t) => sum + t, 0);
        } else {
          const avg = stat.count > 0 ? Math.round(stat.totalTokens / stat.count) : 100;
          tokensWasted = Math.max(avg * (stat.count - 1), 100);
        }
        const fileName = basename(filePath) || filePath;
        toolInefficiencies.push({
          type: 'duplicate_file_reads',
          severity: stat.count >= 5 || tokensWasted > 5000 ? 'high' : 'medium',
          tool: 'view_file',
          description: `文件 "${fileName}" 被重复读取了 ${stat.count} 次，建议派发子代理或在内存中缓存/按行切片读取`,
          tokensWasted,
          evidence: { path: filePath, readCount: stat.count, wastedTokens: tokensWasted },
        });
      }
    }

    // 2. 超长命令输出污染 (run_command 输出 > 2000 tokens)
    for (const item of oversizedOutputs) {
      toolInefficiencies.push({
        type: 'oversized_command_output',
        severity: item.outputTokens > 5000 ? 'high' : 'medium',
        tool: 'run_command',
        description: `run_command 执行产生了超长输出 (~${item.outputTokens.toLocaleString()} tokens)，建议过滤命令输出或改用定向测试`,
        tokensWasted: item.wasted,
        evidence: { commandLine: item.cmd, outputTokens: item.outputTokens, wastedTokens: item.wasted },
      });
    }

    // 3. 代码编辑目标失真与重试 (replace_file_content 失败/重试)
    if (editMisses.length > 0) {
      const totalWasted = editMisses.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0) || (editMisses.length * 300);
      const uniqueFiles = Array.from(new Set(editMisses.map((e) => e.targetFile).filter((f) => f !== 'unknown')));
      const fileSuffix = uniqueFiles.length > 0 ? ` (涉及文件: ${uniqueFiles.map((f) => basename(f)).join(', ')})` : '';
      toolInefficiencies.push({
        type: 'edit_target_miss',
        severity: editMisses.length >= 2 ? 'high' : 'medium',
        tool: 'replace_file_content',
        description: `replace_file_content 发生了 ${editMisses.length} 次目标内容不匹配或编辑失败重试${fileSuffix}，导致上下文浪费`,
        tokensWasted: totalWasted,
        evidence: { errorCount: editMisses.length, targetFiles: uniqueFiles, wastedTokens: totalWasted },
      });
    }

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
      toolAttributions,
      toolInefficiencies,
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
        toolAttributions: parsed.toolAttributions,
        toolInefficiencies: parsed.toolInefficiencies,
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
 * ZCode 原生 SQLite 遥测直连与 Rollout 适配器 (FR-1 / AC-1)
 */
export class ZCodeTelemetryAdapter {
  public static async querySqlite(
    dbPath: string,
    sql: string,
    params: (string | number)[] = []
  ): Promise<any[]> {
    // 1. 尝试 node:sqlite DatabaseSync 原生直连
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new (DatabaseSync as any)(dbPath, { readOnly: true });
      try {
        const stmt = db.prepare(sql);
        return stmt.all(...params) as any[];
      } finally {
        db.close();
      }
    } catch {
      // 2. 降级尝试 sqlite3 CLI 执行
      try {
        const { execSync } = await import('node:child_process');
        let formattedSql = sql;
        for (const p of params) {
          const val = typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`;
          formattedSql = formattedSql.replace('?', String(val));
        }
        const output = execSync(`sqlite3 "${dbPath}" "${formattedSql.replace(/"/g, '\\"')}" -json`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
        });
        if (!output || !output.trim()) return [];
        return JSON.parse(output.trim());
      } catch {
        return [];
      }
    }
  }

  public static async probeSqlite(options: {
    dbPath?: string;
    startTime?: number;
    endTime?: number;
    sessionId?: string;
  }): Promise<SessionTelemetryRecord | null> {
    try {
      const dbPath = options.dbPath || join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite');
      if (!existsSync(dbPath)) {
        return null;
      }

      const whereClauses: string[] = [];
      const params: (string | number)[] = [];

      if (options.sessionId) {
        whereClauses.push('session_id = ?');
        params.push(options.sessionId);
      }
      if (typeof options.startTime === 'number' && options.startTime > 0) {
        whereClauses.push('started_at >= ?');
        params.push(options.startTime - 30_000);
      }
      if (typeof options.endTime === 'number' && options.endTime > 0) {
        whereClauses.push('started_at <= ?');
        params.push(options.endTime + 30_000);
      }

      // 如果未指定任何过滤条件，默认检索近 30 分钟记录
      if (whereClauses.length === 0) {
        whereClauses.push('started_at >= ?');
        params.push(Date.now() - 30 * 60 * 1000);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // 1. 查询 model_usage
      const modelSql = `
        SELECT
          model_id,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(reasoning_tokens) AS reasoning_tokens,
          SUM(cache_read_input_tokens) AS cache_read_input_tokens,
          SUM(computed_total_tokens) AS computed_total_tokens,
          SUM(tool_call_count) AS tool_call_count,
          COUNT(*) AS request_count,
          MIN(started_at) AS min_started_at,
          MAX(completed_at) AS max_completed_at
        FROM model_usage
        ${whereSql}
        GROUP BY model_id
        ORDER BY request_count DESC
      `;

      const modelRows = await ZCodeTelemetryAdapter.querySqlite(dbPath, modelSql, params);
      if (!modelRows || modelRows.length === 0) {
        return null;
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let reasoningTokens = 0;
      let cachedTokens = 0;
      let computedTotal = 0;
      let modelToolCalls = 0;
      let totalRequests = 0;
      let minStartedAt: number | null = null;
      let maxCompletedAt: number | null = null;

      for (const row of modelRows) {
        inputTokens += Number(row.input_tokens) || 0;
        outputTokens += Number(row.output_tokens) || 0;
        reasoningTokens += Number(row.reasoning_tokens) || 0;
        cachedTokens += Number(row.cache_read_input_tokens) || 0;
        computedTotal += Number(row.computed_total_tokens) || 0;
        modelToolCalls += Number(row.tool_call_count) || 0;
        totalRequests += Number(row.request_count) || 0;
        const rowMin = Number(row.min_started_at) || 0;
        const rowMax = Number(row.max_completed_at) || 0;
        if (rowMin > 0 && (!minStartedAt || rowMin < minStartedAt)) minStartedAt = rowMin;
        if (rowMax > 0 && (!maxCompletedAt || rowMax > maxCompletedAt)) maxCompletedAt = rowMax;
      }

      const totalTokens = computedTotal > 0 ? computedTotal : inputTokens + outputTokens;
      if (totalTokens === 0 && totalRequests === 0) {
        return null;
      }

      const model = modelRows[0]?.model_id || 'zcode-model';
      const durationMs = maxCompletedAt && minStartedAt ? Math.max(0, maxCompletedAt - minStartedAt) : undefined;
      const costUsd = parseFloat(((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(4));

      // 2. 查询 turn_usage
      let turnsCount = totalRequests;
      let errorCount = 0;
      try {
        const turnSql = `
          SELECT
            COUNT(*) AS turns_count,
            SUM(tool_call_count) AS tool_call_count,
            SUM(tool_error_count) AS tool_error_count
          FROM turn_usage
          ${whereSql}
        `;
        const turnRows = await ZCodeTelemetryAdapter.querySqlite(dbPath, turnSql, params);
        if (turnRows && turnRows.length > 0 && Number(turnRows[0].turns_count) > 0) {
          turnsCount = Number(turnRows[0].turns_count);
          errorCount = Number(turnRows[0].tool_error_count) || 0;
        }
      } catch {
        // ignore turn_usage query failure
      }

      // 3. 查询 tool_usage
      const byName: Record<string, number> = {};
      const toolAttributions: ToolAttribution[] = [];
      let totalToolCalls = 0;

      try {
        const toolSql = `
          SELECT
            tool_name,
            COUNT(*) AS count,
            SUM(CASE WHEN status = 'error' OR (exit_code IS NOT NULL AND exit_code != 0) THEN 1 ELSE 0 END) AS error_count,
            SUM(output_bytes) AS total_output_bytes,
            SUM(duration_ms) AS total_duration_ms
          FROM tool_usage
          ${whereSql}
          GROUP BY tool_name
          ORDER BY count DESC
        `;
        const toolRows = await ZCodeTelemetryAdapter.querySqlite(dbPath, toolSql, params);
        if (toolRows && toolRows.length > 0) {
          for (const row of toolRows) {
            const name = String(row.tool_name);
            const count = Number(row.count) || 0;
            byName[name] = count;
            totalToolCalls += count;
          }

          for (const row of toolRows) {
            const name = String(row.tool_name);
            const count = Number(row.count) || 0;
            const toolErr = Number(row.error_count) || 0;
            const fraction = totalToolCalls > 0 ? count / totalToolCalls : 0;
            const toolTotal = Math.round(totalTokens * fraction);
            const inTok = Math.round(toolTotal * 0.7);
            const outTok = toolTotal - inTok;
            const percentage = totalTokens > 0 ? parseFloat(((toolTotal / totalTokens) * 100).toFixed(1)) : 0;

            toolAttributions.push({
              name,
              count,
              inputTokens: inTok,
              outputTokens: outTok,
              totalTokens: toolTotal,
              percentage,
              errorCount: toolErr,
            });
          }
        }
      } catch {
        // ignore tool_usage query failure
      }

      if (totalToolCalls === 0 && modelToolCalls > 0) {
        totalToolCalls = modelToolCalls;
      }

      return {
        source: 'zcode',
        sessionId: options.sessionId,
        model,
        tokens: {
          inputTokens,
          outputTokens,
          cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
          totalTokens,
          costUsd,
        },
        toolCalls: {
          total: totalToolCalls,
          byName,
        },
        toolAttributions: toolAttributions.length > 0 ? toolAttributions : undefined,
        toolInefficiencies: [],
        turnsCount: Math.max(1, turnsCount),
        errorCount,
        heavyReadsCount: 0,
        flappingCount: 0,
        violations: [],
        complianceScore: 100,
        durationMs,
      };
    } catch {
      return null;
    }
  }

  public static async probeRolloutJsonl(options: {
    rolloutDir?: string;
    startTime?: number;
    endTime?: number;
    sessionId?: string;
  }): Promise<SessionTelemetryRecord | null> {
    try {
      const rolloutDir = options.rolloutDir || join(homedir(), '.zcode', 'cli', 'rollout');
      if (!existsSync(rolloutDir)) {
        return null;
      }

      const files = await readdir(rolloutDir);
      const jsonlFiles = files.filter((f) => f.startsWith('model-io-') && f.endsWith('.jsonl'));
      if (jsonlFiles.length === 0) return null;

      let matchedFile: string | null = null;
      if (options.sessionId) {
        matchedFile = jsonlFiles.find((f) => f.includes(options.sessionId!)) || null;
      }

      if (!matchedFile) {
        let latestMtime = 0;
        for (const file of jsonlFiles) {
          const filePath = join(rolloutDir, file);
          const s = await stat(filePath);
          if (s.mtimeMs > latestMtime && (!options.startTime || s.mtimeMs >= options.startTime - 60_000)) {
            latestMtime = s.mtimeMs;
            matchedFile = file;
          }
        }
      }

      if (!matchedFile) return null;

      const fullPath = join(rolloutDir, matchedFile);
      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return null;

      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let totalTokens = 0;
      let turnsCount = 0;
      let detectedModel: string | undefined;
      const byName: Record<string, number> = {};
      let totalToolCalls = 0;
      let firstTime = 0;
      let lastTime = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const t = entry.startedAt ? new Date(entry.startedAt).getTime() : 0;
          if (t > 0) {
            if (!firstTime || t < firstTime) firstTime = t;
            if (t > lastTime) lastTime = t;
          }

          if (options.startTime && options.endTime) {
            if (t > 0 && (t < options.startTime - 30_000 || t > options.endTime + 30_000)) {
              continue;
            }
          }

          turnsCount++;
          if (entry.model && !detectedModel) detectedModel = entry.model;

          const usage = entry.response?.usage;
          if (usage) {
            const inTok = Number(usage.prompt_tokens) || Number(usage.input_tokens) || 0;
            const outTok = Number(usage.completion_tokens) || Number(usage.output_tokens) || 0;
            const cacheTok = Number(usage.prompt_tokens_details?.cached_tokens) || Number(usage.cache_read_input_tokens) || 0;
            const totTok = Number(usage.total_tokens) || (inTok + outTok);

            inputTokens += inTok;
            outputTokens += outTok;
            cachedTokens += cacheTok;
            totalTokens += totTok;
          }

          const toolCalls = entry.response?.toolCalls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              const name = tc.name || tc.function?.name || 'unknown_tool';
              byName[name] = (byName[name] || 0) + 1;
              totalToolCalls++;
            }
          }
        } catch {
          // ignore line
        }
      }

      if (totalTokens === 0 && turnsCount === 0) {
        return null;
      }

      const durationMs = lastTime && firstTime ? Math.max(0, lastTime - firstTime) : undefined;
      const costUsd = parseFloat(((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(4));

      return {
        source: 'zcode',
        sessionId: options.sessionId,
        model: detectedModel,
        tokens: {
          inputTokens,
          outputTokens,
          cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
          totalTokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens,
          costUsd,
        },
        toolCalls: {
          total: totalToolCalls,
          byName,
        },
        turnsCount: Math.max(1, turnsCount),
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        violations: [],
        complianceScore: 100,
        durationMs,
      };
    } catch {
      return null;
    }
  }

  public static async probe(options: TelemetryProbeOptions): Promise<SessionTelemetryRecord | null> {
    try {
      const startTime = options.startedAt ? new Date(options.startedAt).getTime() : undefined;
      const endTime = options.completedAt ? new Date(options.completedAt).getTime() : undefined;
      const sessionId = options.state?.session_id || options.env?.ZCODE_SESSION_ID;
      const dbPath = options.zcodeDbPath || options.env?.ZCODE_DB_PATH || (process.env.ZCODE_DB_PATH || undefined);
      const rolloutDir = options.zcodeRolloutDir || options.env?.ZCODE_ROLLOUT_DIR || (process.env.ZCODE_ROLLOUT_DIR || undefined);

      let record = await ZCodeTelemetryAdapter.probeSqlite({
        dbPath,
        startTime,
        endTime,
        sessionId,
      });

      if (!record || record.tokens.totalTokens === 0) {
        record = await ZCodeTelemetryAdapter.probeRolloutJsonl({
          rolloutDir,
          startTime,
          endTime,
          sessionId,
        });
      }

      if (!record) {
        return null;
      }

      const durationMinutes = record.durationMs
        ? Math.round(record.durationMs / 60000)
        : options.startedAt && options.completedAt
          ? Math.max(1, Math.round((new Date(options.completedAt).getTime() - new Date(options.startedAt).getTime()) / 60000))
          : 5;

      const audit = ComplianceAuditor.evaluate({
        profile: options.profile,
        level: options.level,
        diffStats: options.diffStats,
        turnsCount: record.turnsCount,
        errorCount: record.errorCount,
        heavyReadsCount: record.heavyReadsCount || 0,
        flappingCount: record.flappingCount || 0,
        totalTokens: record.tokens.totalTokens,
        durationMinutes,
        spec: options.spec,
        toolCalls: record.toolCalls.byName,
      });

      record.violations = audit.violations;
      record.complianceScore = audit.complianceScore;

      return record;
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

  // 2. ZCode 原生 SQLite / Rollout 遥测直连
  const zcodeRecord = await ZCodeTelemetryAdapter.probe(options);
  if (zcodeRecord) return zcodeRecord;

  // 3. 真实 Antigravity / Gemini CLI 会话日志
  const antigravityRecord = await AntigravityTelemetryAdapter.probe(options);
  if (antigravityRecord) return antigravityRecord;

  // 4. Fallback 到 DocPath breadcrumb.jsonl
  const breadcrumbRecord = await FallbackBreadcrumbAdapter.probe(options);
  if (breadcrumbRecord) return breadcrumbRecord;

  // 5. 默认兜底合规记录
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

