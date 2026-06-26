import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  readTraceEntries,
  clearTrace,
  TraceEntry,
} from '../utils/trace.js';
import {
  analyzeSession,
  buildHealthReport,
  detectAnomalies,
  groupBySession,
} from '../utils/trace-analyzer.js';

interface TraceOptions {
  cwd: string;
  action?: 'show' | 'session' | 'health' | 'anomaly' | 'clear';
  session?: string;
  limit?: number;
  json?: boolean;
}

function progressBar(ratio: number, width: number = 20): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export async function traceCommand(opts: TraceOptions): Promise<void> {
  const cwd = opts.cwd;
  const action = opts.action || 'show';
  const limit = opts.limit || 50;

  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌ 未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  if (action === 'clear') {
    await clearTrace(cwd);
    console.log('🗑️ 追踪日志已清空。');
    return;
  }

  const entries = await readTraceEntries(cwd);
  if (entries.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log('💡 暂无追踪记录。请先设置 `DOCPATH_TRACE=1` 运行一些命令。');
    }
    return;
  }

  if (opts.json) {
    if (action === 'show') {
      console.log(JSON.stringify(entries.slice(-limit), null, 2));
    } else if (action === 'session') {
      const groups = groupBySession(entries);
      const targetSession = opts.session || Object.keys(groups).pop() || '';
      const sessionEntries = groups[targetSession] || [];
      console.log(JSON.stringify(analyzeSession(targetSession, sessionEntries), null, 2));
    } else if (action === 'health') {
      console.log(JSON.stringify(buildHealthReport(entries), null, 2));
    } else if (action === 'anomaly') {
      console.log(JSON.stringify(detectAnomalies(entries), null, 2));
    }
    return;
  }

  // 终端美化输出
  if (action === 'show') {
    console.log(`📋 最近调用流水（显示最近 ${limit} 条，共 ${entries.length} 条）\n`);
    const slice = entries.slice(-limit);
    for (const e of slice) {
      const tsStr = new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false });
      const statusLabel = `[${e.phase}/${e.gate}]`.padEnd(20);
      const cmdStr = `${e.cmd} ${e.args.join(' ')}`.slice(0, 50);
      const isFailed = e.exitCode !== 0;
      const statusIndicator = isFailed ? '⚠️ FAILED' : 'exit:0';
      const indicatorColor = isFailed ? '\x1b[31m' : '\x1b[32m';
      const resetColor = '\x1b[0m';
      console.log(
        `  ${tsStr}  ${statusLabel}  ${cmdStr.padEnd(50)} → ${indicatorColor}${statusIndicator}${resetColor}  ${e.durationMs}ms`
      );
    }
  } else if (action === 'session') {
    const groups = groupBySession(entries);
    const targetSession = opts.session || Object.keys(groups).pop() || '';
    const sessionEntries = groups[targetSession] || [];
    if (sessionEntries.length === 0) {
      console.log(`❌ 未找到 Session ID 为 "${targetSession}" 的记录。`);
      return;
    }

    const report = analyzeSession(targetSession, sessionEntries);

    console.log(`📊 Session 分析: ${report.sessionId}`);
    console.log(`   Agent: ${report.agent} | 时长: ${report.durationMinutes} 分钟 | 命令数: ${report.totalCommands} | 失败: ${report.failedCommands}`);
    console.log(`   访问的阶段: ${report.phasesVisited.join(' → ')}`);

    const scoreColor = report.complianceScore >= 80 ? '\x1b[32m' : report.complianceScore >= 60 ? '\x1b[33m' : '\x1b[31m';
    console.log(`\n   协议合规得分: ${scoreColor}${report.complianceScore}/100\x1b[0m`);
    
    if (report.deductions.length > 0) {
      console.log(`   ┌ 扣分项 ──────────────────────────────────────────────┐`);
      for (const d of report.deductions) {
        console.log(`   │  ${d.reason.padEnd(46)} -${d.score.toString().padEnd(2)} │`);
      }
      console.log(`   └──────────────────────────────────────────────────────┘`);
    } else {
      console.log('   ✅ 完美遵守协议，无扣分项！');
    }

    console.log(`\n   热点命令:`);
    for (const h of report.commandHotspots.slice(0, 5)) {
      console.log(`   ${h.cmd.padEnd(24)} ${progressBar(h.percentage / 100, 10)} ${h.count}次 (${h.percentage}%)`);
    }

    console.log(`\n   耗时分布:`);
    console.log(`   ${'命令'.padEnd(16)} ${'avg'.padStart(6)} ${'p95'.padStart(6)} ${'max'.padStart(6)}`);
    for (const l of report.latencyStats.slice(0, 5)) {
      console.log(`   ${l.cmd.padEnd(16)} ${(l.avg + 'ms').padStart(6)} ${(l.p95 + 'ms').padStart(6)} ${(l.max + 'ms').padStart(6)}`);
    }
  } else if (action === 'health') {
    const report = buildHealthReport(entries);
    console.log(`🏥 DocPath 工作流健康报告`);
    console.log(`   数据范围: 最近历史 | ${report.totalCommands} 条调用 | ${report.totalSessions} 个 session\n`);

    console.log(`   ┌ 健康指标 ────────────────────────────────────────────┐`);
    console.log(`   │  会话通过率  ${(report.successRate + '%').padEnd(8)} (未发生严重失败的命令比例)      │`);
    console.log(`   │  门禁通过率  ${(report.firstTimePassRate + '%').padEnd(8)} (check 命令首次通过率)           │`);
    console.log(`   │  平均会话长  ${(report.avgSessionMinutes + ' 分钟').padEnd(10)}                             │`);
    console.log(`   └──────────────────────────────────────────────────────┘`);

    console.log(`\n   ┌ 阶段耗时热力图（平均分钟） ──────────────────────────┐`);
    for (const p of report.phaseDurationPercentage.slice(0, 5)) {
      console.log(`   │  ${p.phase.padEnd(12)} ${progressBar(p.percentage / 100, 12)} ${p.minutes.toString().padStart(5)}m (${p.percentage}%)      │`);
    }
    console.log(`   └──────────────────────────────────────────────────────┘`);

    if (report.failureClusters.length > 0) {
      console.log(`\n   ┌ 失败前命令序列聚类（根因分析） ──────────────────────┐`);
      for (const f of report.failureClusters.slice(0, 3)) {
        console.log(`   │  序列: ${f.pattern.padEnd(45)} │`);
        console.log(`   │  占比: ${f.count} 次 (${f.percentage}%) | ${f.deduction.padEnd(26)} │`);
        console.log(`   │                                                      │`);
      }
      console.log(`   └──────────────────────────────────────────────────────┘`);
    }
  } else if (action === 'anomaly') {
    const anomalies = detectAnomalies(entries);
    console.log(`🚨 DocPath 异常检测报告`);
    console.log(`   分析 ${entries.length} 条追踪记录，共发现 ${anomalies.length} 个异常模式\n`);

    if (anomalies.length === 0) {
      console.log('   ✅ 未发现明显反模式或异常，Agent 表现良好！');
      return;
    }

    for (const a of anomalies) {
      const color = a.severity === 'HIGH' ? '\x1b[31m' : a.severity === 'MEDIUM' ? '\x1b[33m' : '\x1b[34m';
      console.log(`   [${color}${a.severity}\x1b[0m] ${a.message}`);
      console.log(`            证据: ${a.evidence}`);
      console.log(`            建议: ${a.recommendation}\n`);
    }
  }
}
