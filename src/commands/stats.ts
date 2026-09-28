/**
 * docpath:stats — 任务级效能与 Token 投入产出看板 (Layer 3 Commands)
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  aggregateTaskMetrics,
  type TaskMetricsOptions,
  type TaskMetricsSummary,
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
        avg_cycle_time_minutes: summary.avgDurationMinutes,
        avg_first_time_pass_rate: `${summary.avgFirstTimePassRate}%`,
        avg_tokens_per_task: summary.avgTokensPerTask,
        tokens_per_line_of_code: summary.avgTokensPerLine,
        profile_distribution: {
          quick: summary.quickCount,
          standard: summary.standardCount,
        },
        recent_tasks: summary.recentTasks.map((t) => ({
          task_id: t.taskId,
          title: t.taskTitle,
          profile: t.profile,
          duration_min: t.durationMinutes,
          pass_rate: `${t.firstTimePassRate}%`,
          diff: `+${t.linesAdded}/-${t.linesDeleted}`,
          tokens: t.estimatedContextTokens,
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
  const tokenFormatted = summary.avgTokensPerTask.toLocaleString();

  console.log('┌ 📊 核心效能基线 ──────────────────────────────────────────┐');
  console.log(`│  累计交付任务:  ${summary.totalTasks.toString().padEnd(4)} 个 (${summary.quickCount} quick / ${summary.standardCount} standard)`.padEnd(58) + '│');
  console.log(`│  平均交付耗时:  ${summary.avgDurationMinutes} 分钟 / 任务`.padEnd(58) + '│');
  console.log(`│  门禁首次通过率: ${passIcon} ${summary.avgFirstTimePassRate}%`.padEnd(58) + '│');
  console.log(`│  平均上下文消耗: ~${tokenFormatted} Tokens / 任务`.padEnd(58) + '│');
  console.log(`│  代码投入产出比: ~${summary.avgTokensPerLine} Tokens / 行代码 (共产出 ${summary.totalLinesChanged} 行)`.padEnd(58) + '│');
  console.log('└───────────────────────────────────────────────────────────┘\n');

  console.log(`📋  最近 ${summary.recentTasks.length} 个任务明细:\n`);
  console.log('  ' +
    '任务 ID'.padEnd(26) +
    '档位'.padEnd(10) +
    '耗时'.padEnd(10) +
    '通过率'.padEnd(10) +
    '代码变更'.padEnd(14) +
    '估算 Token'.padEnd(14) +
    '标题'
  );
  console.log('  ' + '─'.repeat(100));

  for (const t of summary.recentTasks) {
    const idStr = (t.taskId.length > 24 ? t.taskId.slice(0, 22) + '..' : t.taskId).padEnd(26);
    const profileStr = (t.profile === 'quick' ? '⚡ quick' : '📦 standard').padEnd(10);
    const durationStr = `${t.durationMinutes}m`.padEnd(10);
    const passStr = `${t.firstTimePassRate}%`.padEnd(10);
    const diffStr = `+${t.linesAdded}/-${t.linesDeleted}`.padEnd(14);
    const tokenStr = `~${(t.estimatedContextTokens || 0).toLocaleString()}`.padEnd(14);
    const titleStr = t.taskTitle.slice(0, 32);

    console.log(`  ${idStr}${profileStr}${durationStr}${passStr}${diffStr}${tokenStr}${titleStr}`);
  }
  console.log('');
}
