import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gitSyncOptional } from './git-run.js';
import { spawnSync } from 'child_process';
import { readTraceEntries, TraceEntry } from './trace.js';

/**
 * R-329 仪式成本度量（纯只读观测层，无行为变更）。
 *
 * 三指标定义：
 * 1. 仪式密度   = 任务 breadcrumb 事件数 ÷ 最终 diff 触及文件数
 * 2. 弹回率     = blocked 事件数 ÷ 总事件数
 * 3. 门禁时延占比 = check/review 门禁命令耗时 ÷ 任务遥测时间跨度
 *    （需要 trace 遥测数据；未开启时降级为「门禁事件占比」代理指标）
 *
 * 数据源约束：仅使用现有 breadcrumb.jsonl、git 历史/工作区 diff 与
 * 已有 trace.jsonl 遥测，不引入任何新状态文件。
 */

export interface BreadcrumbEvent {
  taskId: string;
  step: string;
  status: string;
  context?: string;
  timestamp: string;
}

export interface CeremonyTaskMetrics {
  taskId: string;
  profile: 'quick' | 'standard';
  totalEvents: number;
  blockedEvents: number;
  /** 弹回率 = blocked / total；无事件时为 null */
  blockedRatio: number | null;
  /** 门禁事件占比（breadcrumb 代理：check/review 步骤事件 ÷ 总事件） */
  gateEventShare: number | null;
  /** 仪式密度 = 事件数 ÷ 触及文件数；无法确定 diff 文件时为 null */
  ceremonyDensity: number | null;
  filesTouched: number | null;
  /** 门禁时延占比 = 门禁命令耗时和 ÷ 该任务遥测时间跨度；无遥测时为 null */
  gateLatencyShare: number | null;
  gateLatencyMs: number | null;
  telemetrySpanMs: number | null;
}

const GATE_CMDS = new Set(['check', 'review']);

export function parseBreadcrumbEvents(raw: string): BreadcrumbEvent[] {
  const events: BreadcrumbEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.taskId === 'string' && typeof parsed.step === 'string') {
        events.push({
          taskId: parsed.taskId,
          step: parsed.step,
          status: String(parsed.status ?? ''),
          context: typeof parsed.context === 'string' ? parsed.context : undefined,
          timestamp: String(parsed.timestamp ?? ''),
        });
      }
    } catch {
      // 忽略无法解析的行（部分写入/损坏行不应让观测层崩溃）
    }
  }
  return events;
}

export function isGateEvent(event: BreadcrumbEvent): boolean {
  return GATE_CMDS.has(event.step);
}

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function isQuickTask(taskId: string): boolean {
  return taskId.includes('-quick-');
}

/**
 * 解析 `git log --all --name-only --pretty=format:'@@%H %s'` 输出。
 * 每个提交以 '@@<hash> <subject>' 行开始（taskId 从 subject 提取），
 * 其后直到下一个 '@@' 行都是该提交触及的文件行。
 */
export function parseGitLogSegments(stdout: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  let currentIds: string[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@@')) {
      // 提交边界：从 subject 中提取 taskId，重置当前归属
      currentIds = extractTaskIds(trimmed.slice(2));
      continue;
    }
    if (!trimmed || currentIds.length === 0) continue;
    for (const id of currentIds) {
      let files = map.get(id);
      if (!files) {
        files = new Set<string>();
        map.set(id, files);
      }
      files.add(trimmed);
    }
  }
  return map;
}

const TASK_ID_PATTERN = /T-\d{8}-[a-z0-9-]+/g;

export function extractTaskIds(text: string): string[] {
  const matches = text.match(TASK_ID_PATTERN);
  return matches ? [...new Set(matches)] : [];
}

/**
 * 工作区版本：当前未提交任务的 diff 文件（staged + unstaged + untracked）。
 */
export function collectWorkingTreeFiles(cwd: string): Set<string> {
  const files = new Set<string>();
  if (!existsSync(join(cwd, '.git'))) return files;
  const run = (args: string[]): string[] => {
    const out = gitSyncOptional(cwd, args);
    if (out === null) return [];
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  };
  for (const f of run(['diff', '--name-only', 'HEAD'])) files.add(f);
  for (const line of run(['status', '--porcelain'])) {
    // porcelain 格式：XY <path>（含重命名 "R  old -> new"）
    const path = line.slice(3).split(' -> ').pop();
    if (path) files.add(path);
  }
  return files;
}

function gateLatencyFromTrace(entries: TraceEntry[], taskId: string): {
  share: number | null;
  latencyMs: number | null;
  spanMs: number | null;
} {
  const taskEntries = entries.filter((e) => e.taskId === taskId);
  if (taskEntries.length < 2) return { share: null, latencyMs: null, spanMs: null };
  const times = taskEntries
    .map((e) => new Date(e.ts).getTime())
    .filter((n) => Number.isFinite(n));
  if (times.length < 2) return { share: null, latencyMs: null, spanMs: null };
  const spanMs = Math.max(...times) - Math.min(...times);
  const gateLatencyMs = taskEntries
    .filter((e) => GATE_CMDS.has(e.cmd))
    .reduce((sum, e) => sum + (Number.isFinite(e.durationMs) ? e.durationMs : 0), 0);
  const share = spanMs > 0 ? gateLatencyMs / spanMs : null;
  return {
    share: share === null ? null : Math.min(share, 1),
    latencyMs: gateLatencyMs,
    spanMs,
  };
}

export function computeTaskMetrics(
  taskId: string,
  events: BreadcrumbEvent[],
  filesTouched: number | null,
  traceEntries: TraceEntry[],
): CeremonyTaskMetrics {
  const totalEvents = events.length;
  const blockedEvents = events.filter((e) => e.status === 'blocked').length;
  const gateEvents = events.filter(isGateEvent).length;
  const latency = gateLatencyFromTrace(traceEntries, taskId);
  return {
    taskId,
    profile: isQuickTask(taskId) ? 'quick' : 'standard',
    totalEvents,
    blockedEvents,
    blockedRatio: totalEvents > 0 ? blockedEvents / totalEvents : null,
    gateEventShare: totalEvents > 0 ? gateEvents / totalEvents : null,
    ceremonyDensity:
      totalEvents > 0 && filesTouched !== null && filesTouched > 0
        ? totalEvents / filesTouched
        : null,
    filesTouched,
    gateLatencyShare: latency.share,
    gateLatencyMs: latency.latencyMs,
    telemetrySpanMs: latency.spanMs,
  };
}

export interface CeremonyAggregate {
  profile: 'quick' | 'standard';
  taskCount: number;
  medianEvents: number | null;
  medianBlockedRatio: number | null;
  medianCeremonyDensity: number | null;
  medianGateEventShare: number | null;
}

export interface CeremonyReport {
  current: CeremonyTaskMetrics | null;
  archived: CeremonyTaskMetrics[];
  aggregates: CeremonyAggregate[];
  topBlocked: CeremonyTaskMetrics[];
  telemetryEnabled: boolean;
  notes: string[];
}

function collectArchivedTasks(docpathDir: string): { taskId: string; events: BreadcrumbEvent[] }[] {
  const doneDir = join(docpathDir, 'tasks', 'done');
  if (!existsSync(doneDir)) return [];
  const result: { taskId: string; events: BreadcrumbEvent[] }[] = [];
  for (const entry of readdirSync(doneDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const breadcrumbPath = join(doneDir, entry.name, 'breadcrumb.jsonl');
    if (!existsSync(breadcrumbPath)) continue;
    try {
      const events = parseBreadcrumbEvents(readFileSync(breadcrumbPath, 'utf-8'));
      if (events.length === 0) continue;
      result.push({ taskId: events[0].taskId || entry.name, events });
    } catch {
      // 单个任务目录损坏不影响整体报告
    }
  }
  return result;
}

export async function buildCeremonyReport(cwd: string): Promise<CeremonyReport> {
  const { resolveDocpathDir } = await import('./file.js');
  const docpathDir = await resolveDocpathDir(cwd);
  const notes: string[] = [];

  let traceEntries: TraceEntry[] = [];
  try {
    traceEntries = await readTraceEntries(cwd);
  } catch {
    notes.push('trace 遥测不可读，门禁时延占比将以 null 呈现');
  }
  const telemetryEnabled = traceEntries.length > 0;
  if (!telemetryEnabled) {
    notes.push('trace 遥测未开启或为空：门禁时延占比不可用，仅提供门禁事件占比（breadcrumb 代理）');
  }

  // git 历史 taskId → 文件集合（单次调用）
  let gitFileMap = new Map<string, Set<string>>();
  try {
    const res = spawnSync(
      'git',
      ['log', '--all', '--name-only', '--pretty=format:@@%H %s'],
      { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (res.status === 0 && typeof res.stdout === 'string') {
      gitFileMap = parseGitLogSegments(res.stdout);
    }
  } catch {
    notes.push('git 历史不可读：仪式密度仅对工作区任务可用');
  }

  // 当前任务
  let current: CeremonyTaskMetrics | null = null;
  const currentBreadcrumbPath = join(docpathDir, 'tasks', 'current', 'breadcrumb.jsonl');
  if (existsSync(currentBreadcrumbPath)) {
    try {
      const events = parseBreadcrumbEvents(readFileSync(currentBreadcrumbPath, 'utf-8'));
      if (events.length > 0) {
        const taskId = events[0].taskId;
        const committed = gitFileMap.get(taskId) ?? new Set<string>();
        const files = new Set<string>([...committed, ...collectWorkingTreeFiles(cwd)]);
        current = computeTaskMetrics(
          taskId,
          events,
          files.size > 0 ? files.size : null,
          traceEntries,
        );
      }
    } catch {
      notes.push('当前任务 breadcrumb 不可读');
    }
  }

  // 归档任务
  const archived: CeremonyTaskMetrics[] = [];
  for (const { taskId, events } of collectArchivedTasks(docpathDir)) {
    const files = gitFileMap.get(taskId);
    archived.push(
      computeTaskMetrics(
        taskId,
        events,
        files && files.size > 0 ? files.size : null,
        traceEntries,
      ),
    );
  }

  // 分组聚合（quick / standard 中位数）
  const aggregates: CeremonyAggregate[] = (['quick', 'standard'] as const).map((profile) => {
    const group = archived.filter((t) => t.profile === profile);
    return {
      profile,
      taskCount: group.length,
      medianEvents: median(group.map((t) => t.totalEvents)),
      medianBlockedRatio: median(
        group.map((t) => t.blockedRatio).filter((v): v is number => v !== null),
      ),
      medianCeremonyDensity: median(
        group.map((t) => t.ceremonyDensity).filter((v): v is number => v !== null),
      ),
      medianGateEventShare: median(
        group.map((t) => t.gateEventShare).filter((v): v is number => v !== null),
      ),
    };
  });

  const topBlocked = archived
    .filter((t) => (t.blockedRatio ?? 0) > 0)
    .sort((a, b) => (b.blockedRatio ?? 0) - (a.blockedRatio ?? 0))
    .slice(0, 3);

  return { current, archived, aggregates, topBlocked, telemetryEnabled, notes };
}

const percent = (v: number | null): string =>
  v === null ? '—' : `${(v * 100).toFixed(0)}%`;

export function renderCeremonyHuman(report: CeremonyReport): string[] {
  const lines: string[] = [];
  lines.push('🧮 仪式成本报告（R-329 观测层，只读）');
  if (report.current) {
    const c = report.current;
    const density =
      c.ceremonyDensity === null ? '—' : `${c.ceremonyDensity.toFixed(1)} evt/文件`;
    lines.push(
      `   当前任务: ${c.taskId} [${c.profile}]`,
      `   事件数 ${c.totalEvents} | 弹回率 ${percent(c.blockedRatio)} | 仪式密度 ${density} | 门禁事件占比 ${percent(c.gateEventShare)} | 门禁时延占比 ${percent(c.gateLatencyShare)}`,
    );
  } else {
    lines.push('   当前任务: 无进行中任务的 breadcrumb');
  }

  lines.push('');
  lines.push('   归档任务聚合（中位数）:');
  lines.push(
    `   ${'档位'.padEnd(9)} ${'任务数'.padStart(4)} ${'事件数'.padStart(6)} ${'弹回率'.padStart(6)} ${'密度'.padStart(10)} ${'门禁事件'.padStart(7)}`,
  );
  for (const agg of report.aggregates) {
    const density =
      agg.medianCeremonyDensity === null
        ? '—'
        : `${agg.medianCeremonyDensity.toFixed(1)}`;
    lines.push(
      `   ${agg.profile.padEnd(9)} ${String(agg.taskCount).padStart(4)} ${String(agg.medianEvents ?? '—').padStart(6)} ${percent(agg.medianBlockedRatio).padStart(6)} ${density.padStart(10)} ${percent(agg.medianGateEventShare).padStart(7)}`,
    );
  }

  if (report.topBlocked.length > 0) {
    lines.push('');
    lines.push('   弹回率最高的任务（门禁摩擦热点）:');
    for (const t of report.topBlocked) {
      lines.push(
        `   ${percent(t.blockedRatio)} ${t.blockedEvents}/${t.totalEvents}  ${t.taskId}`,
      );
    }
  }

  for (const note of report.notes) {
    lines.push(`   ℹ️ ${note}`);
  }
  return lines;
}
