import { TraceEntry } from './trace.js';

export interface AnomalyRecord {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  ruleId: string;
  message: string;
  evidence: string;
  recommendation: string;
}

export interface SessionReport {
  sessionId: string;
  agent: string;
  durationMinutes: number;
  totalCommands: number;
  failedCommands: number;
  complianceScore: number;
  deductions: { reason: string; score: number }[];
  commandHotspots: { cmd: string; count: number; percentage: number }[];
  latencyStats: { cmd: string; avg: number; p95: number; max: number }[];
  phasesVisited: string[];
}

export interface HealthReport {
  totalSessions: number;
  totalCommands: number;
  successRate: number;
  firstTimePassRate: number;
  avgSessionMinutes: number;
  phaseDurationPercentage: { phase: string; percentage: number; minutes: number }[];
  failureClusters: { pattern: string; count: number; percentage: number; deduction: string }[];
}

/**
 * 协议合规评分和扣分分析
 */
export function computeCompliance(entries: TraceEntry[]): {
  score: number;
  deductions: { reason: string; score: number }[];
} {
  let score = 100;
  const deductions: { reason: string; score: number }[] = [];

  if (entries.length === 0) {
    return { score, deductions };
  }

  // 规则 1: 缺少 agent enter 直接运行 go --step / start 等
  const hasAgentEnter = entries.some(e => e.cmd === 'agent' && e.args.includes('enter'));
  const hasExecutionCommand = entries.some(e => ['go', 'start', 'step'].includes(e.cmd.split(' ')[0]));
  if (hasExecutionCommand && !hasAgentEnter) {
    deductions.push({ reason: '❌ 未检测到 agent enter（直接开始执行子任务/go）', score: 15 });
    score -= 15;
  }

  // 规则 2: next 循环迷路
  // 检查在同一个 phase 中是否连续出现多次 next --agent
  let maxConsecutiveNext = 0;
  let currentConsecutiveNext = 0;
  let lastPhase = '';
  for (const entry of entries) {
    const isNextCmd = entry.cmd === 'next' && entry.args.includes('--agent');
    if (isNextCmd) {
      if (entry.phase === lastPhase) {
        currentConsecutiveNext++;
      } else {
        currentConsecutiveNext = 1;
      }
      maxConsecutiveNext = Math.max(maxConsecutiveNext, currentConsecutiveNext);
    } else {
      currentConsecutiveNext = 0;
    }
    lastPhase = entry.phase;
  }
  if (maxConsecutiveNext >= 3) {
    const penalty = Math.min(25, (maxConsecutiveNext - 2) * 5);
    deductions.push({
      reason: `⚠️ 同阶段内连续调用 next --agent 共 ${maxConsecutiveNext} 次（存在迷路反模式）`,
      score: penalty
    });
    score -= penalty;
  }

  // 规则 3: 绕过 quality check 强行 done
  // 检查最后几次命令里，是否有 check 失败后没有运行 recover，却直接调用了 agent done / done
  let checkFailedIndex = -1;
  let recoverIndex = -1;
  let doneIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.cmd === 'check' && entry.exitCode !== 0) {
      checkFailedIndex = i;
    }
    if (entry.cmd === 'recover' || (entry.cmd === 'agent' && entry.args.includes('step') && entry.args.includes('done'))) {
      recoverIndex = i;
    }
    if (entry.cmd === 'done' || (entry.cmd === 'agent' && entry.args.includes('done'))) {
      doneIndex = i;
    }
  }
  if (checkFailedIndex !== -1 && doneIndex > checkFailedIndex && recoverIndex < checkFailedIndex) {
    deductions.push({ reason: '❌ 门禁 check 失败后，未调用 recover 即强行发起 done', score: 20 });
    score -= 20;
  }

  // 保证分数在 0-100 之间
  score = Math.max(0, score);
  return { score, deductions };
}

/**
 * 异常模式检测
 */
export function detectAnomalies(entries: TraceEntry[]): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (entries.length === 0) return anomalies;

  // 1. 同 phase 连续调用 next 异常检测
  const sessionGroups = groupBySession(entries);
  for (const [sessionId, sessionEntries] of Object.entries(sessionGroups)) {
    let consecutiveNext = 0;
    let nextEntries: TraceEntry[] = [];
    let lastPhase = '';

    for (const entry of sessionEntries) {
      const isNext = entry.cmd === 'next' && entry.args.includes('--agent');
      if (isNext) {
        if (entry.phase === lastPhase) {
          consecutiveNext++;
          nextEntries.push(entry);
        } else {
          consecutiveNext = 1;
          nextEntries = [entry];
        }
      } else {
        if (consecutiveNext >= 3) {
          anomalies.push({
            severity: 'HIGH',
            ruleId: 'loop-next',
            message: `Session "${sessionId}" 连续调用 next --agent 达 ${consecutiveNext} 次`,
            evidence: `Phase: ${lastPhase}, 开始时间: ${nextEntries[0].ts}`,
            recommendation: '提示 Agent 目前卡在某个状态无法前进。请检查当前工作流状态 (`docpath status`)，必要时执行 `docpath recover` 或重试。'
          });
        }
        consecutiveNext = 0;
        nextEntries = [];
      }
      lastPhase = entry.phase;
    }
    // 结尾结算
    if (consecutiveNext >= 3) {
      anomalies.push({
        severity: 'HIGH',
        ruleId: 'loop-next',
        message: `Session "${sessionId}" 连续调用 next --agent 达 ${consecutiveNext} 次`,
        evidence: `Phase: ${lastPhase}, 开始时间: ${nextEntries[0].ts}`,
        recommendation: '提示 Agent 目前卡在某个状态无法前进。请检查当前工作流状态 (`docpath status`)，必要时执行 `docpath recover` 或重试。'
      });
    }

    // 2. skip-enter 规则
    const hasEnter = sessionEntries.some(e => e.cmd === 'agent' && e.args.includes('enter'));
    const firstExecution = sessionEntries.find(e => ['go', 'start', 'step'].includes(e.cmd.split(' ')[0]));
    if (firstExecution && !hasEnter) {
      anomalies.push({
        severity: 'HIGH',
        ruleId: 'skip-enter',
        message: `Session "${sessionId}" 跳过了 agent enter 直接执行了 "${firstExecution.cmd}"`,
        evidence: `首次执行指令: "${firstExecution.cmd} ${firstExecution.args.join(' ')}" 在 ${firstExecution.ts}`,
        recommendation: '检查 Agent 协议规范。要求在开始具体子任务前，先通过 `docpath agent enter` 进入状态。'
      });
    }

    // 3. quick-misuse 规则: 检查 quick 命令内容是否偏大 (包含复杂关键词)
    const quickCmds = sessionEntries.filter(e => e.cmd === 'quick');
    for (const q of quickCmds) {
      const titleArg = q.args.find(arg => !arg.startsWith('-'));
      if (titleArg) {
        const titleLower = titleArg.toLowerCase();
        const complexKeywords = ['migrate', 'architecture', 'refactor', 'database', 'restructure', 'api'];
        const matched = complexKeywords.filter(k => titleLower.includes(k));
        if (matched.length > 0) {
          anomalies.push({
            severity: 'MEDIUM',
            ruleId: 'quick-misuse',
            message: `使用了 quick 快速提交进行复杂度较高的操作: "${titleArg}"`,
            evidence: `命令: docpath ${q.cmd} ${q.args.join(' ')}, 匹配词: ${matched.join(', ')}`,
            recommendation: '对于涉及系统架构、模块重构、数据库迁移等动作，必须走完整的 spec/plan 协议流程，避免使用 quick。'
          });
        }
      }
    }
  }

  return anomalies;
}

/**
 * 组装单个 Session 报告
 */
export function analyzeSession(sessionId: string, sessionEntries: TraceEntry[]): SessionReport {
  const sorted = [...sessionEntries].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const agent = sorted[0]?.agent || 'unknown';

  let durationMinutes = 0;
  if (sorted.length >= 2) {
    const start = new Date(sorted[0].ts).getTime();
    const end = new Date(sorted[sorted.length - 1].ts).getTime();
    durationMinutes = parseFloat(((end - start) / 60000).toFixed(1));
  }

  const totalCommands = sorted.length;
  const failedCommands = sorted.filter(e => e.exitCode !== 0).length;

  const { score: complianceScore, deductions } = computeCompliance(sorted);

  // 热点统计
  const counts: Record<string, number> = {};
  for (const e of sorted) {
    const fullCmd = `${e.cmd} ${e.args.filter(a => a.startsWith('-')).join(' ')}`.trim();
    counts[fullCmd] = (counts[fullCmd] || 0) + 1;
  }
  const commandHotspots = Object.entries(counts)
    .map(([cmd, count]) => ({
      cmd,
      count,
      percentage: parseFloat(((count / totalCommands) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count);

  // 耗时统计
  const latencies: Record<string, number[]> = {};
  for (const e of sorted) {
    const cmdBase = e.cmd;
    if (!latencies[cmdBase]) latencies[cmdBase] = [];
    latencies[cmdBase].push(e.durationMs);
  }
  const latencyStats = Object.entries(latencies).map(([cmd, list]) => {
    const sum = list.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / list.length);
    const sortedList = [...list].sort((a, b) => a - b);
    const p95 = sortedList[Math.floor(sortedList.length * 0.95)] || sortedList[sortedList.length - 1];
    const max = sortedList[sortedList.length - 1];
    return { cmd, avg, p95, max };
  }).sort((a, b) => b.avg - a.avg);

  const phasesVisited = Array.from(new Set(sorted.map(e => e.phase).filter(Boolean)));

  return {
    sessionId,
    agent,
    durationMinutes,
    totalCommands,
    failedCommands,
    complianceScore,
    deductions,
    commandHotspots,
    latencyStats,
    phasesVisited
  };
}

/**
 * 组装跨 Session 健康报告与失败聚类
 */
export function buildHealthReport(allEntries: TraceEntry[]): HealthReport {
  const sessionGroups = groupBySession(allEntries);
  const sessions = Object.entries(sessionGroups).map(([id, list]) => analyzeSession(id, list));

  const totalSessions = sessions.length;
  const totalCommands = allEntries.length;
  const failedCommands = allEntries.filter(e => e.exitCode !== 0).length;
  const successRate = totalSessions > 0 ? parseFloat(((1 - failedCommands / totalCommands) * 100).toFixed(1)) : 100;

  // 首次成功率：计算 check 命令第一次通过的比例
  let checkSessionsCount = 0;
  let firstCheckSuccessCount = 0;
  for (const entries of Object.values(sessionGroups)) {
    const checks = entries.filter(e => e.cmd === 'check');
    if (checks.length > 0) {
      checkSessionsCount++;
      if (checks[0].exitCode === 0) {
        firstCheckSuccessCount++;
      }
    }
  }
  const firstTimePassRate = checkSessionsCount > 0 ? parseFloat(((firstCheckSuccessCount / checkSessionsCount) * 100).toFixed(1)) : 100;

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const avgSessionMinutes = totalSessions > 0 ? parseFloat((totalMinutes / totalSessions).toFixed(1)) : 0;

  // 阶段时间计算（粗略估算每个 phase 占据的时间百分比）
  const phaseTimes: Record<string, number> = {};
  for (const entries of Object.values(sessionGroups)) {
    const sorted = [...entries].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const diffMs = new Date(next.ts).getTime() - new Date(cur.ts).getTime();
      // 如果间隔时间大于 10 分钟，我们认为是人机交互停顿，截断为 1 分钟计算
      const effectiveMs = diffMs > 600000 ? 60000 : diffMs;
      phaseTimes[cur.phase] = (phaseTimes[cur.phase] || 0) + effectiveMs;
    }
  }
  const totalPhaseMs = Object.values(phaseTimes).reduce((a, b) => a + b, 0);
  const phaseDurationPercentage = Object.entries(phaseTimes).map(([phase, ms]) => {
    const minutes = parseFloat((ms / 60000).toFixed(1));
    const percentage = totalPhaseMs > 0 ? parseFloat(((ms / totalPhaseMs) * 100).toFixed(1)) : 0;
    return { phase, percentage, minutes };
  }).sort((a, b) => b.percentage - a.percentage);

  // 失败前序列聚类
  // 查找失败的命令，并截取其前置 2 条命令组成序列，如 "go -> agent_step -> check (Failed)"
  const failureSequences: Record<string, number> = {};
  let totalFailures = 0;

  for (const entries of Object.values(sessionGroups)) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].exitCode !== 0) {
        totalFailures++;
        const prev1 = entries[i - 1] ? entries[i - 1].cmd : 'START';
        const prev2 = entries[i - 2] ? entries[i - 2].cmd : 'START';
        const key = `${prev2} → ${prev1} → ❌${entries[i].cmd}`;
        failureSequences[key] = (failureSequences[key] || 0) + 1;
      }
    }
  }

  const failureClusters = Object.entries(failureSequences).map(([pattern, count]) => {
    const percentage = totalFailures > 0 ? parseFloat(((count / totalFailures) * 100).toFixed(1)) : 0;
    let deduction = '可能原因：正常开发流程中的断点校验';
    if (pattern.includes('next → next → ❌')) {
      deduction = '可能原因：Agent 陷入 next 环无法退出，强行停止或触发异常';
    } else if (pattern.includes('check →')) {
      deduction = '可能原因：在没有稳定代码的情况下，过早触发了自动化质量门禁';
    }
    return { pattern, count, percentage, deduction };
  }).sort((a, b) => b.count - a.count);

  return {
    totalSessions,
    totalCommands,
    successRate,
    firstTimePassRate,
    avgSessionMinutes,
    phaseDurationPercentage,
    failureClusters
  };
}

/**
 * 按 Session 分组
 */
export function groupBySession(entries: TraceEntry[]): Record<string, TraceEntry[]> {
  const groups: Record<string, TraceEntry[]> = {};
  for (const e of entries) {
    if (!groups[e.session]) {
      groups[e.session] = [];
    }
    groups[e.session].push(e);
  }
  return groups;
}
