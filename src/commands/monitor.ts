/**
 * docpath:monitor — 流程合规审计与 Token 消耗漂移监控统一看板 (Layer 3 Commands)
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  aggregateMonitorMetrics,
  type MonitorOptions,
} from '../utils/task-metrics.js';

export async function monitorCommand(options: MonitorOptions): Promise<void> {
  const {
    cwd,
    limit = 10,
    agent = false,
    json = false,
    strict = false,
    ci = false,
    threshold = 70,
  } = options;

  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
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
        spike_alerts: summary.spikes.map((s) => ({
          task_id: s.taskId,
          title: s.taskTitle,
          profile: s.profile,
          real_tokens: s.realTokens,
          baseline_tokens: s.baselineTokens,
          spike_ratio: `${s.spikeRatio}x`,
          reason: s.reason,
        })),
        real_usage: summary.realUsageSummary || 'no_real_agent_telemetry',
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
    console.log(`│  代码投产 ROI:      ~${summary.realUsageSummary.overallRoiTokensPerLine} Tokens / Diff 行`.padEnd(58) + '│');
  } else {
    console.log(`│  全仓真实会话消耗:  未挂载真实 Agent 遥测 (已降级)`.padEnd(58) + '│');
  }
  const spikeText = summary.spikes.length === 0
    ? '🟢 无异常突增'
    : `🚨 ${summary.spikes.length} 个任务异常突增 (>2.5x 基线)`;
  console.log(`│  突增告警 (Spikes): ${spikeText}`.padEnd(58) + '│');
  console.log('└───────────────────────────────────────────────────────────┘\n');

  if (summary.spikes.length > 0) {
    console.log('🚨  Token 异常突增任务:');
    for (const spike of summary.spikes) {
      console.log(`  - 任务 [${spike.taskId}] "${spike.taskTitle}": 消耗 ~${spike.realTokens.toLocaleString()} Tokens (基线 ~${spike.baselineTokens.toLocaleString()}, 突增 ${spike.spikeRatio}x)`);
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
