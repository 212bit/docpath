/**
 * docpath:stats — 任务级效能与 Token 投入产出看板 (Layer 3 Commands)
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  aggregateTaskMetrics,
  type TaskMetricsOptions,
} from '../utils/task-metrics.js';

export async function statsCommand(options: TaskMetricsOptions): Promise<void> {
  const { cwd, limit = 10, agent = false, json = false } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  const summary = await aggregateTaskMetrics(cwd, limit);

  // 1. 结构化 JSON 输出
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // 2. Agent 紧凑视图
  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'task_efficiency_overview',
        total_tasks: summary.totalTasks,
        engineering_metrics: {
          avg_cycle_time_minutes: summary.avgDurationMinutes,
          avg_first_time_pass_rate: `${summary.avgFirstTimePassRate}%`,
          avg_velocity_lines_per_min: summary.avgSpeedLinesPerMinute,
          total_lines_changed: summary.totalLinesChanged,
        },
        protocol_overhead: {
          avg_injected_tokens_per_task: summary.avgProtocolTokensPerTask,
        },
        real_agent_usage: summary.realUsageSummary || 'no_harness_telemetry_detected',
        profile_distribution: {
          quick: summary.quickCount,
          standard: summary.standardCount,
        },
        recent_tasks: summary.recentTasks.map((t) => ({
          task_id: t.taskId,
          title: t.taskTitle,
          profile: t.profile,
          duration_min: t.durationMinutes,
          turns: t.engineering?.turnCount || 1,
          retries: t.engineering?.retryCount || 0,
          pass_rate: `${t.firstTimePassRate}%`,
          diff: `+${t.linesAdded}/-${t.linesDeleted}`,
          protocol_tokens: t.protocol?.totalInjectedTokens || 0,
          real_tokens: t.realUsage?.totalTokens || null,
        })),
      }),
    );
    return;
  }

  // 3. 人类交互视图 (Human-readable Dashboard)
  console.log('\n📈  DocPath 任务效能与 Token 投入产出看板\n');

  if (summary.totalTasks === 0) {
    console.log('ℹ️   暂无历史任务度量数据。当任务执行 `docpath step-pass --commit` 或 `docpath done` 收口时将自动采集。\n');
    return;
  }

  const passIcon = summary.avgFirstTimePassRate >= 80 ? '🟢' : summary.avgFirstTimePassRate >= 60 ? '🟡' : '🔴';

  console.log('┌ 🛠️  客观工程效能基线 (Engineering Baseline) ────────────────┐');
  console.log(`│  累计交付任务:  ${summary.totalTasks.toString().padEnd(4)} 个 (${summary.quickCount} quick / ${summary.standardCount} standard)`.padEnd(58) + '│');
  console.log(`│  平均交付耗时:  ${summary.avgDurationMinutes} 分钟 / 任务`.padEnd(58) + '│');
  console.log(`│  门禁首次通过率: ${passIcon} ${summary.avgFirstTimePassRate}%`.padEnd(58) + '│');
  console.log(`│  代码交付流速:  ~${summary.avgSpeedLinesPerMinute} 行代码 / 分钟 (累计 ${summary.totalLinesChanged} 行)`.padEnd(58) + '│');
  console.log('└───────────────────────────────────────────────────────────┘');

  console.log('┌ ⚡ Token 与协议开销透视 (Token & Protocol Telemetry) ────────┐');
  console.log(`│  DocPath 协议注入: ~${summary.avgProtocolTokensPerTask.toLocaleString()} Tokens / 任务 (Spec/Plan/Rules)`.padEnd(58) + '│');
  if (summary.realUsageSummary) {
    const realTokFormatted = summary.realUsageSummary.avgRealTokensPerTask.toLocaleString();
    const costStr = summary.realUsageSummary.totalRealCostUsd > 0 ? ` (~$${summary.realUsageSummary.totalRealCostUsd})` : '';
    console.log(`│  真实会话消耗:     ~${realTokFormatted} Tokens / 任务${costStr}`.padEnd(58) + '│');
  } else {
    console.log(`│  真实会话消耗:     未挂载 Harness 真实探针 (已降级)`.padEnd(58) + '│');
  }
  console.log('└───────────────────────────────────────────────────────────┘\n');

  console.log(`📋  最近 ${summary.recentTasks.length} 个任务明细:\n`);
  console.log('  ' +
    '任务 ID'.padEnd(24) +
    '档位'.padEnd(10) +
    '耗时'.padEnd(8) +
    '轮次'.padEnd(8) +
    '返工'.padEnd(8) +
    '代码变更'.padEnd(12) +
    '协议开销'.padEnd(14) +
    '真实 Tokens'.padEnd(14) +
    '标题'
  );
  console.log('  ' + '─'.repeat(110));

  for (const t of summary.recentTasks) {
    const idStr = (t.taskId.length > 22 ? t.taskId.slice(0, 20) + '..' : t.taskId).padEnd(24);
    const profileStr = (t.profile === 'quick' ? '⚡ quick' : '📦 standard').padEnd(10);
    const durationStr = `${t.durationMinutes}m`.padEnd(8);
    const turnsStr = `${t.engineering?.turnCount || 1}`.padEnd(8);
    const retryStr = `${t.engineering?.retryCount || 0}`.padEnd(8);
    const diffStr = `+${t.linesAdded}/-${t.linesDeleted}`.padEnd(12);
    const protocolStr = `~${(t.protocol?.totalInjectedTokens || 0).toLocaleString()}`.padEnd(14);
    const realStr = t.realUsage?.totalTokens ? `~${t.realUsage.totalTokens.toLocaleString()}` : '-'.padEnd(14);
    const titleStr = t.taskTitle.slice(0, 26);

    console.log(`  ${idStr}${profileStr}${durationStr}${turnsStr}${retryStr}${diffStr}${protocolStr}${realStr}${titleStr}`);
  }
  console.log('');
}
