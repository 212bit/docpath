/**
 * docpath:monitor — 流程合规审计与 Token 消耗漂移监控统一看板 (Layer 3 Commands)
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  aggregateMonitorMetrics,
  probeActiveTaskMetrics,
  type MonitorOptions,
} from '../utils/task-metrics.js';

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

export async function monitorCommand(options: MonitorOptions): Promise<void> {
  const {
    cwd,
    limit = 10,
    agent = false,
    json = false,
    strict = false,
    ci = false,
    threshold = 70,
    current = false,
  } = options;

  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  // 1. 若指定 --current，仅探查并输出当前在途活跃任务的实时遥测
  if (current) {
    const activeTask = await probeActiveTaskMetrics(cwd);

    if (json) {
      if (!activeTask) {
        console.log(JSON.stringify({ active: false, activeTask: null, message: '当前无进行中的活跃任务' }, null, 2));
      } else {
        console.log(JSON.stringify({ active: true, activeTask }, null, 2));
      }
      return;
    }

    if (agent) {
      const { stringify } = await import('yaml');
      if (!activeTask) {
        console.log(
          stringify({
            agent_view: 'active_task_telemetry',
            status: 'idle',
            active_task: null,
            message: '当前无进行中的活跃任务',
          })
        );
      } else {
        console.log(
          stringify({
            agent_view: 'active_task_telemetry',
            status: 'active',
            active_task: {
              task_id: activeTask.taskId,
              title: activeTask.taskTitle,
              backlog_id: activeTask.backlogId,
              profile: activeTask.profile,
              level: activeTask.level,
              phase: activeTask.phase,
              started_at: activeTask.startedAt,
              duration_minutes: activeTask.durationMinutes,
              progress: {
                total_steps: activeTask.progress.totalSteps,
                passed_steps: activeTask.progress.passedSteps,
                current_step: activeTask.progress.currentStep,
                current_step_title: activeTask.progress.currentStepTitle || null,
                blocked_steps: activeTask.progress.blockedSteps,
                percent: `${activeTask.progress.percent}%`,
              },
              compliance: {
                score: activeTask.complianceScore,
                violations: activeTask.violations.map((v) => ({
                  rule_id: v.ruleId,
                  rule_name: v.ruleName,
                  severity: v.severity,
                  description: v.description,
                })),
              },
              diff: {
                files_changed: activeTask.filesChanged,
                lines_added: activeTask.linesAdded,
                lines_deleted: activeTask.linesDeleted,
                total_diff_lines: activeTask.totalDiffLines,
              },
              live_telemetry: {
                source: activeTask.realUsage?.source || 'unknown',
                total_tokens: activeTask.realUsage?.totalTokens || 0,
                input_tokens: activeTask.realUsage?.inputTokens || 0,
                output_tokens: activeTask.realUsage?.outputTokens || 0,
                cached_tokens: activeTask.realUsage?.cachedTokens || 0,
                cache_hit_ratio: (activeTask.realUsage?.cachedTokens || 0) > 0
                  ? `${parseFloat(((activeTask.realUsage!.cachedTokens! / (activeTask.realUsage!.totalTokens + activeTask.realUsage!.cachedTokens!)) * 100).toFixed(1))}%`
                  : '0%',
                cost_usd: activeTask.realUsage?.costUsd ?? null,
                tool_calls_count: activeTask.realUsage?.toolCallsCount || activeTask.sessionRecord?.toolCalls.total || 0,
                flapping_count: activeTask.sessionRecord?.flappingCount || 0,
                heavy_reads_count: activeTask.sessionRecord?.heavyReadsCount || 0,
                turns_count: activeTask.sessionRecord?.turnsCount || 1,
                model: activeTask.realUsage?.model || activeTask.sessionRecord?.model || 'unknown',
              },
              tool_attributions: (activeTask.toolAttributions || activeTask.realUsage?.toolAttributions || []).map((t) => ({
                name: t.name,
                count: t.count,
                tokens: t.totalTokens,
                percentage: `${t.percentage}%`,
                error_count: t.errorCount,
              })),
              tool_inefficiencies: (activeTask.toolInefficiencies || activeTask.realUsage?.toolInefficiencies || []).map((i) => ({
                type: i.type,
                severity: i.severity,
                tool: i.tool,
                description: i.description,
                tokens_wasted: i.tokensWasted,
              })),
            },
          })
        );
      }
      return;
    }

    console.log('\n🚀  DocPath 活跃任务实时遥测 (In-flight Telemetry)\n');
    if (!activeTask) {
      console.log('ℹ️   当前无进行中的活跃任务。\n');
      return;
    }

    const scoreIcon = activeTask.complianceScore >= 85 ? '🟢' : activeTask.complianceScore >= 70 ? '🟡' : '🔴';
    console.log('┌ 📋 任务基本信息 (Active Task Info) ────────────────────────┐');
    console.log(`│  任务标识:      [${activeTask.taskId}] ${activeTask.taskTitle}`.padEnd(58) + '│');
    const backlogStr = activeTask.backlogId ? ` (需求: ${activeTask.backlogId})` : '';
    const profileStr = activeTask.profile === 'quick' ? '⚡ quick' : `📦 standard (L${activeTask.level})`;
    console.log(`│  任务档位:      ${profileStr}${backlogStr}`.padEnd(58) + '│');
    console.log(`│  运行阶段:      ${activeTask.phase} (已运行: ${activeTask.durationMinutes} 分钟)`.padEnd(58) + '│');
    const stepInfo = activeTask.progress.currentStepTitle
      ? `${activeTask.progress.currentStep} (${activeTask.progress.currentStepTitle})`
      : activeTask.progress.currentStep;
    console.log(`│  步骤进度:      ${stepInfo} | ${activeTask.progress.passedSteps}/${activeTask.progress.totalSteps} 步 (${activeTask.progress.percent}%)`.padEnd(58) + '│');
    console.log(`│  代码变更:      +${activeTask.linesAdded} / -${activeTask.linesDeleted} 行 (${activeTask.filesChanged} 个文件, 共 ${activeTask.totalDiffLines} 行)`.padEnd(58) + '│');
    console.log('└───────────────────────────────────────────────────────────┘');

    console.log('┌ ⚡ 实时会话与合规状态 (In-flight Session & Compliance) ────┐');
    console.log(`│  实时合规评分:  ${scoreIcon} ${activeTask.complianceScore} / 100分`.padEnd(58) + '│');
    const real = activeTask.realUsage;
    if (real && real.totalTokens > 0) {
      const costStr = real.costUsd ? ` (~$${real.costUsd})` : '';
      console.log(`│  实时 Tokens:   ~${real.totalTokens.toLocaleString()} Tokens${costStr} (来源: ${real.source})`.padEnd(58) + '│');
      if (real.cachedTokens && real.cachedTokens > 0) {
        const liveHitRatio = parseFloat(((real.cachedTokens / (real.totalTokens + real.cachedTokens)) * 100).toFixed(1));
        console.log(`│  缓存复用率:    ⚡ ${liveHitRatio}% (已复用缓存 ${formatTokens(real.cachedTokens)} Tokens)`.padEnd(58) + '│');
      }
    } else {
      console.log(`│  实时 Tokens:   未探测到独立 Agent 遥测 (已降级)`.padEnd(58) + '│');
    }
    const toolCalls = real?.toolCallsCount || activeTask.sessionRecord?.toolCalls.total || 0;
    const flapping = activeTask.sessionRecord?.flappingCount || 0;
    const heavyReads = activeTask.sessionRecord?.heavyReadsCount || 0;
    console.log(`│  工具与异常:    ${toolCalls} 次调用 | ${flapping} 次翻转死循环 | ${heavyReads} 次大文件扫描`.padEnd(58) + '│');
    console.log('└───────────────────────────────────────────────────────────┘\n');

    const toolAttrs = activeTask.toolAttributions || activeTask.realUsage?.toolAttributions || activeTask.sessionRecord?.toolAttributions || [];
    if (toolAttrs.length > 0) {
      console.log('┌ 🛠️  真实工具调用与消耗剖析 (Tool-Level Telemetry Breakdown) ────────┐');
      console.log('│  ' + '工具名称'.padEnd(24) + '频次'.padEnd(8) + '错误'.padEnd(8) + '消耗 Tokens'.padEnd(16) + '占比'.padEnd(8) + '│');
      console.log('│  ' + '─'.repeat(58) + '│');
      for (const attr of toolAttrs.slice(0, 5)) {
        const nameStr = attr.name.padEnd(24);
        const countStr = `${attr.count}次`.padEnd(8);
        const errStr = `${attr.errorCount || 0}次`.padEnd(8);
        const tokStr = `~${attr.totalTokens.toLocaleString()}`.padEnd(16);
        const pctStr = `${attr.percentage}%`.padEnd(8);
        console.log(`│  ${nameStr}${countStr}${errStr}${tokStr}${pctStr}│`);
      }
      console.log('└───────────────────────────────────────────────────────────┘\n');
    }

    const ineffs = activeTask.toolInefficiencies || activeTask.realUsage?.toolInefficiencies || activeTask.sessionRecord?.toolInefficiencies || [];
    if (ineffs.length > 0) {
      console.log('┌ ⚠️  工具低效与上下文浪费诊断 (Tool Inefficiencies & Waste) ────────┐');
      for (const ineff of ineffs) {
        const icon = ineff.severity === 'high' ? '🔴' : ineff.severity === 'medium' ? '🟡' : '🔵';
        const wasted = `(浪费 ~${ineff.tokensWasted.toLocaleString()} Tokens)`;
        console.log(`│  ${icon} [${ineff.tool}] ${ineff.description}`.padEnd(58) + '│');
        console.log(`│     严重度: ${ineff.severity.toUpperCase()} | ${wasted}`.padEnd(58) + '│');
      }
      console.log('└───────────────────────────────────────────────────────────┘\n');
    }

    if (activeTask.violations.length > 0) {
      console.log('⚠️  在途合规风险警告 (In-flight Violations):');
      for (const v of activeTask.violations) {
        console.log(`  - [${v.ruleId}] ${v.ruleName} (${v.severity.toUpperCase()}): ${v.description}`);
      }
      console.log('');
    }
    return;
  }

  const summary = await aggregateMonitorMetrics(cwd, limit);
  const isCiOrStrict = strict || ci;
  const isGatePassed =
    summary.compliance.criticalViolationsCount === 0 &&
    summary.healthIndex >= threshold;

  // 1. JSON 输出
  if (json) {
    console.log(JSON.stringify({ ...summary, gatePassed: isGatePassed }, null, 2));
    if (isCiOrStrict && !isGatePassed) {
      process.exit(1);
    }
    return;
  }

  // 2. Agent 紧凑 YAML 视图
  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'monitor_health_telemetry',
        health_index: summary.healthIndex,
        gate_status: isGatePassed ? 'pass' : 'fail',
        active_task: summary.activeTask
          ? {
              task_id: summary.activeTask.taskId,
              title: summary.activeTask.taskTitle,
              profile: summary.activeTask.profile,
              current_step: summary.activeTask.progress.currentStep,
              progress_percent: `${summary.activeTask.progress.percent}%`,
              compliance_score: summary.activeTask.complianceScore,
              live_tokens: summary.activeTask.realUsage?.totalTokens || null,
              cached_tokens: summary.activeTask.realUsage?.cachedTokens || 0,
              cache_hit_ratio: (summary.activeTask.realUsage?.cachedTokens || 0) > 0
                ? `${parseFloat(((summary.activeTask.realUsage!.cachedTokens! / (summary.activeTask.realUsage!.totalTokens + summary.activeTask.realUsage!.cachedTokens!)) * 100).toFixed(1))}%`
                : '0%',
            }
          : null,
        compliance: {
          avg_score: summary.compliance.avgComplianceScore,
          total_violations: summary.compliance.totalViolations,
          violations_by_rule: summary.compliance.violationsByRule,
          critical_violations: summary.compliance.criticalViolationsCount,
          unhealthy_tasks: summary.compliance.unhealthyTasksCount,
        },
        drift_telemetry: {
          overall_protocol_inflation_rate: `${summary.drift.overallProtocolInflationRate >= 0 ? '+' : ''}${summary.drift.overallProtocolInflationRate}%`,
          quick: {
            baseline_protocol_tokens: summary.drift.quick.baselineProtocolTokens,
            recent_protocol_tokens: summary.drift.quick.recentProtocolTokens,
            inflation_rate: `${summary.drift.quick.protocolInflationRate >= 0 ? '+' : ''}${summary.drift.quick.protocolInflationRate}%`,
            baseline_real_tokens_median: summary.drift.quick.baselineRealTokensMedian,
            roi_tokens_per_line: summary.drift.quick.roiTokensPerLine,
          },
          standard: {
            baseline_protocol_tokens: summary.drift.standard.baselineProtocolTokens,
            recent_protocol_tokens: summary.drift.standard.recentProtocolTokens,
            inflation_rate: `${summary.drift.standard.protocolInflationRate >= 0 ? '+' : ''}${summary.drift.standard.protocolInflationRate}%`,
            baseline_real_tokens_median: summary.drift.standard.baselineRealTokensMedian,
            roi_tokens_per_line: summary.drift.standard.roiTokensPerLine,
          },
        },
        tool_attributions: (summary.globalToolAttributions || []).map((t) => ({
          name: t.name,
          count: t.count,
          tokens: t.totalTokens,
          percentage: `${t.percentage}%`,
          error_count: t.errorCount,
        })),
        tool_inefficiencies: (summary.globalToolInefficiencies || summary.toolInefficiencies || []).map((i) => ({
          type: i.type,
          severity: i.severity,
          tool: i.tool,
          description: i.description,
          tokens_wasted: i.tokensWasted,
        })),
        spike_alerts: summary.spikes.map((s) => ({
          task_id: s.taskId,
          title: s.taskTitle,
          profile: s.profile,
          real_tokens: s.realTokens,
          baseline_tokens: s.baselineTokens,
          spike_ratio: `${s.spikeRatio}x`,
          reason: s.reason,
        })),
        remediations: (summary.remediations || []).map((r) => ({
          id: r.id,
          severity: r.severity,
          title: r.title,
          reason: r.reason,
          recommended_command: r.recommendedCommand,
          actionable: r.actionable,
        })),
        real_usage: summary.realUsageSummary
          ? {
              tasks_with_real_usage: summary.realUsageSummary.tasksWithRealUsage,
              total_real_tokens: summary.realUsageSummary.totalRealTokens,
              total_cached_tokens: summary.realUsageSummary.totalCachedTokens,
              cached_tokens: summary.realUsageSummary.totalCachedTokens,
              cache_hit_ratio: `${summary.realUsageSummary.cacheHitRatio}%`,
              avg_real_tokens_per_task: summary.realUsageSummary.avgRealTokensPerTask,
              total_real_cost_usd: summary.realUsageSummary.totalRealCostUsd,
              avg_cost_per_task_usd: summary.realUsageSummary.avgCostPerTaskUsd,
              overall_roi_tokens_per_line: summary.realUsageSummary.overallRoiTokensPerLine,
            }
          : 'no_real_agent_telemetry',
        recent_tasks: summary.recentTasks.map((t) => ({
          task_id: t.taskId,
          title: t.taskTitle,
          profile: t.profile,
          compliance_score: t.complianceScore ?? 100,
          violations: (t.violations || t.sessionRecord?.violations || []).map((v) => v.ruleId),
          diff_lines: t.totalDiffLines,
          protocol_tokens: t.protocol?.totalInjectedTokens || 0,
          real_tokens: t.realUsage?.totalTokens || null,
        })),
      }),
    );
    if (isCiOrStrict && !isGatePassed) {
      process.exit(1);
    }
    return;
  }

  // 3. 人类交互视图 (Human-readable Dashboard)
  console.log('\n📈  DocPath 智能监控大盘 (Health & Token Telemetry)\n');

  if (summary.activeTask) {
    const at = summary.activeTask;
    const scoreIcon = at.complianceScore >= 85 ? '🟢' : at.complianceScore >= 70 ? '🟡' : '🔴';
    console.log('┌ 🚀 活跃任务实时遥测 (In-flight Active Task) ───────────────┐');
    console.log(`│  进行中任务:    [${at.taskId}] ${at.taskTitle}`.padEnd(58) + '│');
    const stepLabel = at.progress.currentStepTitle ? `${at.progress.currentStep} (${at.progress.currentStepTitle})` : at.progress.currentStep;
    console.log(`│  当前步骤/耗时: ${stepLabel} | 运行 ${at.durationMinutes}m (进度 ${at.progress.percent}%)`.padEnd(58) + '│');
    const tokCount = at.realUsage?.totalTokens ? `~${at.realUsage.totalTokens.toLocaleString()}` : '-';
    const cacheStr = at.realUsage?.cachedTokens && at.realUsage.cachedTokens > 0
      ? ` | ⚡ 缓存 ${formatTokens(at.realUsage.cachedTokens)}`
      : '';
    const tools = at.realUsage?.toolCallsCount || at.sessionRecord?.toolCalls.total || 0;
    const flp = at.sessionRecord?.flappingCount || 0;
    console.log(`│  实时消耗/工具: ${tokCount} Tokens${cacheStr} | ${tools} 工具调用 | ${flp} 翻转`.padEnd(58) + '│');
    const violCount = at.violations.length;
    const violText = violCount === 0 ? '无违规' : `${violCount} 项合规风险`;
    console.log(`│  实时合规状态:  ${scoreIcon} ${at.complianceScore}分 (${violText})`.padEnd(58) + '│');
    console.log('└───────────────────────────────────────────────────────────┘\n');
  }

  if (summary.totalTasks === 0) {
    console.log('ℹ️   暂无历史任务度量数据。当任务执行 `docpath step-pass --commit` 或 `docpath done` 收口时将自动采集。\n');
    return;
  }

  const healthIcon = summary.healthIndex >= 85 ? '🟢' : summary.healthIndex >= 70 ? '🟡' : '🔴';
  const healthLabel = summary.healthIndex >= 85 ? '健康' : summary.healthIndex >= 70 ? '注意' : '高危';

  console.log('┌ 🛡️  流程合规与健康度 (Process Compliance & Health Index) ──────┐');
  console.log(`│  全仓健康指数:  ${healthIcon} ${summary.healthIndex} / 100 (${healthLabel})`.padEnd(58) + '│');
  console.log(`│  合规审计任务:  ${summary.totalTasks} 个 (异常任务: ${summary.compliance.unhealthyTasksCount} 个, 严重违规: ${summary.compliance.criticalViolationsCount} 次)`.padEnd(58) + '│');
  const rMap = summary.compliance.violationsByRule;
  console.log(`│  规则违规分布:  CR-01:${rMap['CR-01'] || 0} | CR-02:${rMap['CR-02'] || 0} | CR-03:${rMap['CR-03'] || 0} | CR-04:${rMap['CR-04'] || 0} | CR-05:${rMap['CR-05'] || 0}`.padEnd(58) + '│');
  const sMap = summary.compliance.violationsBySeverity;
  console.log(`│  违规等级分布:  critical:${sMap.critical} | high:${sMap.high} | medium:${sMap.medium} | low:${sMap.low}`.padEnd(58) + '│');
  console.log('└───────────────────────────────────────────────────────────┘');

  console.log('┌ ⚡ Token 消耗与漂移监控 (Token Consumption & Drift Telemetry) ───┐');
  const stdDrift = summary.drift.standard;
  const qkDrift = summary.drift.quick;
  const stdInfSign = stdDrift.protocolInflationRate >= 0 ? '+' : '';
  const qkInfSign = qkDrift.protocolInflationRate >= 0 ? '+' : '';
  console.log(`│  Standard 协议体积: ~${stdDrift.recentProtocolTokens.toLocaleString()} Tokens (基线: ~${stdDrift.baselineProtocolTokens.toLocaleString()}, 膨胀率: ${stdInfSign}${stdDrift.protocolInflationRate}%)`.padEnd(58) + '│');
  console.log(`│  Quick 协议体积:    ~${qkDrift.recentProtocolTokens.toLocaleString()} Tokens (基线: ~${qkDrift.baselineProtocolTokens.toLocaleString()}, 膨胀率: ${qkInfSign}${qkDrift.protocolInflationRate}%)`.padEnd(58) + '│');
  if (summary.realUsageSummary) {
    const totalTokensFormatted = summary.realUsageSummary.totalRealTokens.toLocaleString();
    const costStr = summary.realUsageSummary.totalRealCostUsd > 0 ? ` (~$${summary.realUsageSummary.totalRealCostUsd})` : '';
    console.log(`│  全仓真实会话消耗:  ~${totalTokensFormatted} Tokens${costStr} (均 ${summary.realUsageSummary.avgRealTokensPerTask.toLocaleString()} / 任务)`.padEnd(58) + '│');
    if ((summary.realUsageSummary.cacheHitRatio || 0) > 0 || (summary.realUsageSummary.totalCachedTokens || 0) > 0) {
      console.log(`│  缓存复用与命中率:  ⚡ ${summary.realUsageSummary.cacheHitRatio}% (已复用缓存 ${formatTokens(summary.realUsageSummary.totalCachedTokens)} Tokens)`.padEnd(58) + '│');
    }
    console.log(`│  代码投产 ROI:      ~${summary.realUsageSummary.overallRoiTokensPerLine} Tokens / Diff 行`.padEnd(58) + '│');
  } else {
    console.log(`│  全仓真实会话消耗:  未挂载真实 Agent 遥测 (已降级)`.padEnd(58) + '│');
  }
  const spikeText = summary.spikes.length === 0
    ? '🟢 无异常突增'
    : `🚨 ${summary.spikes.length} 个任务异常突增 (>2.5x 基线)`;
  console.log(`│  突增告警 (Spikes): ${spikeText}`.padEnd(58) + '│');
  console.log('└───────────────────────────────────────────────────────────┘\n');

  const globalAttrs = summary.globalToolAttributions || [];
  if (globalAttrs.length > 0) {
    console.log('┌ 🛠️  真实工具调用与消耗剖析 (Tool-Level Telemetry Breakdown) ────────┐');
    console.log('│  ' + '工具名称'.padEnd(24) + '频次'.padEnd(8) + '错误'.padEnd(8) + '消耗 Tokens'.padEnd(16) + '占比'.padEnd(8) + '│');
    console.log('│  ' + '─'.repeat(58) + '│');
    for (const attr of globalAttrs.slice(0, 6)) {
      const nameStr = attr.name.padEnd(24);
      const countStr = `${attr.count}次`.padEnd(8);
      const errStr = `${attr.errorCount || 0}次`.padEnd(8);
      const tokStr = `~${attr.totalTokens.toLocaleString()}`.padEnd(16);
      const pctStr = `${attr.percentage}%`.padEnd(8);
      console.log(`│  ${nameStr}${countStr}${errStr}${tokStr}${pctStr}│`);
    }
    console.log('└───────────────────────────────────────────────────────────┘\n');
  }

  const globalIneffs = summary.globalToolInefficiencies || summary.toolInefficiencies || [];
  if (globalIneffs.length > 0) {
    console.log('┌ ⚠️  工具低效与上下文浪费诊断 (Tool Inefficiencies & Waste) ────────┐');
    for (const ineff of globalIneffs) {
      const icon = ineff.severity === 'high' ? '🔴' : ineff.severity === 'medium' ? '🟡' : '🔵';
      const wasted = `(浪费 ~${ineff.tokensWasted.toLocaleString()} Tokens)`;
      console.log(`│  ${icon} [${ineff.tool}] ${ineff.description}`.padEnd(58) + '│');
      console.log(`│     严重度: ${ineff.severity.toUpperCase()} | ${wasted}`.padEnd(58) + '│');
    }
    console.log('└───────────────────────────────────────────────────────────┘\n');
  }

  if (summary.spikes.length > 0) {
    console.log('🚨  Token 异常突增任务:');
    for (const spike of summary.spikes) {
      console.log(`  - 任务 [${spike.taskId}] "${spike.taskTitle}": 消耗 ~${spike.realTokens.toLocaleString()} Tokens (基线 ~${spike.baselineTokens.toLocaleString()}, 突增 ${spike.spikeRatio}x)`);
    }
    console.log('');
  }

  if (summary.remediations && summary.remediations.length > 0) {
    console.log('💡  智能治理与自愈建议 (Actionable Recommendations):');
    for (const rem of summary.remediations) {
      const sevIcon = rem.severity === 'critical' ? '🔴' : rem.severity === 'high' ? '🟠' : rem.severity === 'medium' ? '🟡' : '🔵';
      console.log(`  - [${rem.id}] ${sevIcon} ${rem.title} (${rem.severity.toUpperCase()})`);
      console.log(`    原因: ${rem.reason}`);
      console.log(`    建议: \`${rem.recommendedCommand}\``);
    }
    console.log('');
  }

  console.log(`📋  最近 ${summary.recentTasks.length} 个任务明细:\n`);
  console.log('  ' +
    '任务 ID'.padEnd(22) +
    '档位'.padEnd(10) +
    '合规分'.padEnd(10) +
    '违规项'.padEnd(16) +
    '代码变更'.padEnd(12) +
    '协议开销'.padEnd(14) +
    '真实 Tokens'.padEnd(14) +
    '标题'
  );
  console.log('  ' + '─'.repeat(110));

  for (const t of summary.recentTasks) {
    const idStr = (t.taskId.length > 20 ? t.taskId.slice(0, 18) + '..' : t.taskId).padEnd(22);
    const profileStr = (t.profile === 'quick' ? '⚡ quick' : '📦 std').padEnd(10);
    const score = t.complianceScore ?? 100;
    const scoreStr = `${score >= 85 ? '🟢' : score >= 70 ? '🟡' : '🔴'} ${score}分`.padEnd(10);
    const violations = (t.violations || t.sessionRecord?.violations || []).map((v) => v.ruleId);
    const violStr = (violations.length > 0 ? violations.join(',') : '无').padEnd(16);
    const diffStr = `+${t.linesAdded}/-${t.linesDeleted}`.padEnd(12);
    const protocolStr = `~${(t.protocol?.totalInjectedTokens || 0).toLocaleString()}`.padEnd(14);
    const realStr = t.realUsage?.totalTokens ? `~${t.realUsage.totalTokens.toLocaleString()}` : '-'.padEnd(14);
    const titleStr = t.taskTitle.slice(0, 24);

    console.log(`  ${idStr}${profileStr}${scoreStr}${violStr}${diffStr}${protocolStr}${realStr}${titleStr}`);
  }
  console.log('');

  if (isCiOrStrict) {
    if (!isGatePassed) {
      console.error(`❌  CI Gate 门禁未通过: 健康指数 ${summary.healthIndex} < 阈值 ${threshold} 或存在 ${summary.compliance.criticalViolationsCount} 项严重违规 (Critical Violations)。`);
      process.exit(1);
    } else {
      console.log(`✅  CI Gate 门禁通过: 健康指数 ${summary.healthIndex} >= ${threshold}，且无严重违规。`);
    }
  }
}
