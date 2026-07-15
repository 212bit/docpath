import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentState, readOptionalFile } from '../workspace.js';
import { readBreadcrumb, type BreadcrumbEntry, type BreadcrumbSummary } from '../../engine/breadcrumb.js';
import { detectPlanBreadcrumbDrift, resolveEffectivePlanTasks, type PlanBreadcrumbDrift } from '../plan-sync.js';
import { canonicalTaskDir, currentTaskDir, detectActiveTaskIdentityDrift, readActiveStructuredSpecDocument, readActiveTaskFile, type TaskIdentityDrift } from '../task-files.js';
import { detectStructuredMarkdownHashDrift, formatStructuredMarkdownHashDrift, type StructuredMarkdownHashDrift, type StructuredTaskMarkdownFile } from '../structured-docs.js';
import { listBacklogItems, type BacklogItem } from '../../engine/backlog.js';
import { handleStalePendingDoneWarning, readPendingDone } from '../pending-done.js';
import { readRuleFile, ruleDisplayPaths } from '../rules.js';
import { buildInstallDoctorReport, isInstallTarget, type InstallDoctorReport } from '../install-core.js';
import { readHybridContextIndexSummary, readHybridContextIndexTrunk, readHybridContextIndexLeaves, type HybridContextIndexSummary, type HybridContextIndexEntry } from '../context-index.js';
import { readGitCloseoutSummary, type GitCloseoutSummary } from '../git-closeout.js';
import { resolveMajorChangeGateStatus, type MajorChangeGateStatus } from '../major-change.js';
import { readLastCheckMarkdown } from '../workspace-evidence.js';
import { isQuickProfile } from '../../engine/workflow-profile.js';
import type { StructuredSpecDocument } from '../structured-docs.js';
import { detectDirtyWorktree, type DirtyWorktreeReport } from '../git-dirty-guard.js';
import { classifyCandidateBlocks, lessonCandidateKey, parseCandidateBlocks } from '../lesson-candidates.js';

const SPEC_TRUTH_SYNC_ROUTE_HINT =
  'spec.json 真源已生成；如需细化 FR/AC，请使用 `docpath write-spec --stdin`，直接手改 spec.md 不会更新 spec.json 真源。';
export interface AgentOutput {
  agent_view: 'status' | 'next';
  state: string;
  level?: number | null;
  workflow_profile: string;
  gate_policy: {
    requires_spec: boolean;
    requires_plan: boolean;
    requires_check: boolean;
    requires_review: boolean;
    journal_mode: string;
  };
  task_id: string;
  task_title: string;
  backlog_id?: string | null;
  phase: string;
  gate: string;
  next_action: string;
  recommended_command: string;
  route_hint?: {
    next_action: string;
    recommended_command: string;
    exit_criteria: string;
  };
  quick_fix?: string;
  context_refs?: Array<{
    path: string;
    role: string;
    access: 'index_only' | 'read_if_needed';
    preferred_command?: string;
  }>;
  command_effects?: {
    updates: string[];
    update_mode: 'via_docpath_command';
    do_not_edit_directly: string[];
  };
  exit_criteria: string;
  progress: {
    done: number;
    total: number;
    in_progress: number;
    blocked: number;
  };
  drift_summary: string | null;
  drift_details?: {
    plan_done_without_breadcrumb: string[];
    breadcrumb_done_without_plan: string[];
  };
  identity_drift_summary?: string | null;
  identity_drift_details?: Array<{
    file: string;
    location: string;
    expected_task_id: string;
    declared_task_id: string;
    path: string;
  }>;
  lesson_summary: {
    pending_count: number;
    pending_keys?: string[];
  };
  install_health: {
    target?: string;
    adapters?: string[];
    current_agent?: string | null;
    passed: boolean;
    errors?: number;
    warnings?: number;
    issue_scope?: string;
    recommended_command?: string | null;
    issue_ids?: string[];
  } | null;
  context_index?: HybridContextIndexSummary;
  context_index_trunk?: HybridContextIndexEntry[];
  current_focus?: {
    phase: string;
    detail: string;
  };
  context_index_leaves?: Array<{ id: string; label: string; summary: string }>;
  generated_at: string;
}

export type TddStateSnapshot = {
  phase?: string;
};

export type AgentOutputContext = {
  docpathDir: string;
  state: Awaited<ReturnType<typeof readCurrentState>>;
  lastCheckContent: string;
  hasSpec: boolean;
  planContent: string;
  planTasks: Array<{ id: string; title: string; done: boolean }>;
  bc: BreadcrumbSummary;
  drift: PlanBreadcrumbDrift;
  identityDrifts: TaskIdentityDrift[];
  structuredMarkdownDrifts: StructuredMarkdownHashDrift[];
  backlogItems: BacklogItem[];
  pendingDone: Awaited<ReturnType<typeof readPendingDone>>;
  tddState: TddStateSnapshot | null;
  historicalTaskDirCount: number;
  lessonSummary: { pendingCount: number; pendingKeys: string[] };
  hasIncompleteSpec: boolean;
  installHealth: InstallDoctorReport | null;
  gitCloseout: GitCloseoutSummary | null;
  dirtyWorktree: DirtyWorktreeReport;
  majorChangeGate: MajorChangeGateStatus;
  structuredSpec: StructuredSpecDocument | null;
  contextIndex: HybridContextIndexSummary | null;
  contextIndexTrunk: HybridContextIndexEntry[] | null;
  contextIndexLeaves: HybridContextIndexEntry[] | null;
  specSummary: SpecSummary | null;
  recentDecisions: DecisionEntry[];
};

// ── Context Injection 类型 ──

export interface DecisionEntry {
  id: string;
  taskId: string;
  category: string;
  conclusion: string;
  createdAt: string;
}

export interface SpecSummary {
  title: string;
  requirements: string[];
}

// ── Context Injection 加载函数 ──

const DECISIONS_MAX_LINES = 50;
const DECISIONS_RECENT_COUNT = 5;

/**
 * 从 decisions.jsonl 读取最近 N 条决策记录。
 * 文件按追加顺序写入，尾部是最新记录。
 */
export async function loadRecentDecisions(docpathDir: string, count: number = DECISIONS_RECENT_COUNT): Promise<DecisionEntry[]> {
  const jsonlPath = join(docpathDir, 'workspace', 'decisions.jsonl');
  if (!existsSync(jsonlPath)) return [];

  try {
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const tail = lines.slice(-Math.min(lines.length, DECISIONS_MAX_LINES));
    const decisions: DecisionEntry[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.kind === 'decision' && parsed.id) {
          decisions.push({
            id: parsed.id,
            taskId: parsed.taskId || '',
            category: parsed.category || '',
            conclusion: parsed.decision || '',
            createdAt: parsed.createdAt || '',
          });
        }
      } catch {
        // skip malformed lines
      }
    }
    return decisions.slice(-count);
  } catch {
    return [];
  }
}

/**
 * 从 spec.md 提取 title 和功能需求列表。
 * 解析第一行 H1 为 title，匹配 `- [ ] FR-\d+:.*` 为需求。
 */
export function extractSpecSummary(specContent: string): SpecSummary | null {
  if (!specContent || !specContent.trim()) return null;

  const lines = specContent.split('\n');
  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : '';

  const frPattern = /^- \[ \] FR-\d+:(.*)/;
  const requirements: string[] = [];
  for (const line of lines) {
    const match = line.match(frPattern);
    if (match) {
      requirements.push(match[1].trim());
      if (requirements.length >= 5) break;
    }
  }

  if (!title && requirements.length === 0) return null;

  return { title, requirements };
}

export function selectCurrentFocus(
  phase: string,
  gate: string,
  context: AgentOutputContext,
): { phase: string; detail: string } | null {
  if (phase === 'executing') {
    const openStep = context.planTasks.find(task => !task.done);
    if (openStep) {
      return {
        phase: 'executing',
        detail: `当前步骤: ${openStep.id} - ${openStep.title}\n进度: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成`,
      };
    }
    if (context.planTasks.length > 0) {
      return {
        phase: 'executing',
        detail: `所有计划步骤已完成 (${context.planTasks.length}/${context.planTasks.length})\n建议运行 check 门禁`,
      };
    }
  }

  if (phase === 'checking') {
    if (context.lastCheckContent) {
      const lines = context.lastCheckContent.split('\n').slice(0, 15);
      return {
        phase: 'checking',
        detail: lines.join('\n'),
      };
    }
  }

  if (phase === 'completed') {
    if (context.lessonSummary.pendingCount > 0) {
      return {
        phase: 'completed',
        detail: `待归档 lesson: ${context.lessonSummary.pendingCount} 条\nKeys: ${context.lessonSummary.pendingKeys.slice(0, 3).join(', ')}${context.lessonSummary.pendingKeys.length > 3 ? '...' : ''}`,
      };
    }
    return {
      phase: 'completed',
      detail: `任务已完成\n计划: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成\n门禁: ${gate}`,
    };
  }

  return null;
}

export function summarizeDrift(drift: PlanBreadcrumbDrift): string | null {
  const messages = [
    drift.planDoneWithoutBreadcrumb.length > 0
      ? `plan 已完成但缺少 breadcrumb: ${drift.planDoneWithoutBreadcrumb.join(', ')}`
      : '',
    drift.breadcrumbDoneWithoutPlan.length > 0
      ? `breadcrumb done 但 plan 未勾选: ${drift.breadcrumbDoneWithoutPlan.join(', ')}`
      : '',
  ].filter(Boolean);
  return messages.length > 0 ? messages.join('; ') : null;
}

export function summarizeCurrentTaskBreadcrumbs(
  bc: BreadcrumbSummary,
  taskId: string,
): BreadcrumbSummary {
  if (!taskId) {
    return {
      total: 0,
      done: 0,
      inProgress: 0,
      blocked: 0,
      latest: null,
      entries: [],
    };
  }

  const latestByStep = new Map<string, BreadcrumbEntry>();
  for (const entry of bc.entries) {
    if (entry.taskId !== taskId) continue;
    latestByStep.set(entry.step, entry);
  }

  const entries = Array.from(latestByStep.values()).sort((a, b) =>
    (a.timestamp || '').localeCompare(b.timestamp || '')
  );
  const done = entries.filter((e) => e.status === 'done').length;
  const inProgress = entries.filter((e) => e.status === 'in_progress').length;
  const blocked = entries.filter((e) => e.status === 'blocked').length;

  return {
    total: entries.length,
    done,
    inProgress,
    blocked,
    latest: entries.length > 0 ? entries[entries.length - 1] : null,
    entries,
  };
}

export function compareBacklogPriority(a: BacklogItem, b: BacklogItem): number {
  const priorityOrder = Number.parseInt(a.priority.slice(1), 10) - Number.parseInt(b.priority.slice(1), 10);
  if (priorityOrder !== 0) return priorityOrder;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

export function backlogReadinessRank(item: BacklogItem): number {
  return ['raw', 'shaped', 'analyzed', 'confirmed'].indexOf(item.readiness);
}

export function isExecutableBacklogItem(item: BacklogItem): boolean {
  if (item.level >= 3) {
    return backlogReadinessRank(item) >= backlogReadinessRank({ ...item, readiness: 'confirmed' })
      && Boolean(item.evidence.user_confirmed)
      && Boolean(item.evidence.decision_brief);
  }
  if (item.level >= 2) {
    return backlogReadinessRank(item) >= backlogReadinessRank({ ...item, readiness: 'analyzed' })
      && Boolean(item.evidence.analysis || item.evidence.spec || item.readiness === 'confirmed');
  }
  return item.readiness !== 'raw';
}

export function quoteInline(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export const GC_TASK_DIR_THRESHOLD = 20;

export async function countHistoricalTaskDirs(docpathDir: string, activeTaskId?: string): Promise<number> {
  const tasksDir = join(docpathDir, 'tasks');
  if (!existsSync(tasksDir)) return 0;
  const entries = await readdir(tasksDir, { withFileTypes: true });
  return entries.filter((entry) =>
    entry.isDirectory()
    && /^T-\d{8}(?:-|$)/.test(entry.name)
    && entry.name !== activeTaskId
  ).length;
}

export function hasLessonCandidates(content: string): boolean {
  if (!content.trim()) return false;
  return /^-\s*key:\s*\S+/m.test(content) && /^###\s+Lesson\s*$/m.test(content);
}

export function normalizeLessonKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function extractExistingLessonMetaKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const regex = /^<!--\s+docpath:lesson-meta\s+(.+?)\s+-->$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) != null) {
    keys.add(normalizeLessonKeyPart(match[1]));
  }
  return keys;
}

export function candidateLessonKeys(content: string): string[] {
  if (!hasLessonCandidates(content)) return [];
  const keys: string[] = [];
  const blocks = content.split(/^##\s+/m).filter((block) => block.trim());

  for (const block of blocks) {
    const keyword = block.match(/^- key:\s*(.+)$/m)?.[1]?.trim();
    if (!keyword) continue;
    const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim() || '';
    const typeValue = block.match(/^- type:\s*(.+)$/m)?.[1]?.trim() || 'best-practice';
    const targetValue = block.match(/^- target:\s*(.+)$/m)?.[1]?.trim() || 'style';
    const source = block.match(/^- source:\s*(.+)$/m)?.[1]?.trim() || 'lesson-candidates';
    const type = targetValue === 'architecture' || typeValue === 'architecture' ? 'architecture' : typeValue;
    const target = targetValue === 'architecture' || type === 'architecture' ? 'architecture' : 'style';
    keys.push(normalizeLessonKeyPart([type, target, keyword, source, taskId].join(':').slice(0, 180)));
  }

  return keys;
}

export function isLowValueWorkflowLessonBlock(block: string): boolean {
  const description = block.match(/^### Lesson\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim() || '';
  return /推荐保留本次任务的执行经验/u.test(description)
    || /完成\s*\d+\s*\/\s*\d+\s*步/u.test(description)
    || /阻塞\s*\d+\s*步/u.test(description);
}

export function summarizeUnlearnedLessonCandidates(
  candidatesContent: string,
  styleContent: string,
  architectureContent: string,
): { pendingCount: number; pendingKeys: string[] } {
  const keys = classifyCandidateBlocks(parseCandidateBlocks(candidatesContent))
    .filter((classification) => classification.action === 'keep')
    .map((classification) => lessonCandidateKey(classification.block));
  if (keys.length === 0) return { pendingCount: 0, pendingKeys: [] };
  const learned = new Set([
    ...extractExistingLessonMetaKeys(styleContent),
    ...extractExistingLessonMetaKeys(architectureContent),
  ]);
  const pendingKeys = keys.filter((key) => !learned.has(key));
  return {
    pendingCount: pendingKeys.length,
    pendingKeys,
  };
}

export function parseTddState(raw: string): TddStateSnapshot | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as TddStateSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function detectActiveStructuredMarkdownDrifts(
  docpathDir: string,
  taskId: string | undefined,
): Promise<StructuredMarkdownHashDrift[]> {
  const dirs = [
    ...(taskId ? [canonicalTaskDir(docpathDir, taskId)] : []),
    currentTaskDir(docpathDir),
  ];
  const seen = new Set<string>();
  const drifts: StructuredMarkdownHashDrift[] = [];
  for (const dir of dirs) {
    for (const file of ['spec.md', 'plan.md'] as StructuredTaskMarkdownFile[]) {
      const drift = await detectStructuredMarkdownHashDrift(dir, file);
      if (!drift) continue;
      const key = `${drift.markdownPath}:${drift.jsonPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drifts.push(drift);
    }
  }
  return drifts;
}

export function isIncompleteSpec(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return /待补充/.test(trimmed);
}

export async function readInstallHealth(cwd: string, docpathDir: string): Promise<InstallDoctorReport | null> {
  const metaRaw = await readOptionalFile(join(docpathDir, '.install-meta.json'));
  let target = 'universal';
  try {
    const meta = metaRaw ? JSON.parse(metaRaw) as { target?: unknown } : null;
    if (isInstallTarget(meta?.target)) target = meta.target;
  } catch {
  }
  return buildInstallDoctorReport({ cwd, target });
}

export function hasHealthRegressionWarning(installHealth: InstallDoctorReport | null | undefined): boolean {
  if (!installHealth) return false;
  return installHealth.passed === false
    || (installHealth.errors ?? 0) > 0
    || (installHealth.warnings ?? 0) > 0;
}

function buildLearnRoute(
  lessonSummary: { pendingCount: number; pendingKeys: string[] },
  hasHealthWarning: boolean,
  globalRules: string[],
): {
  next_action: string;
  recommended_command: string;
  required_context: string[];
  required_files: string[];
  must_update: string[];
  exit_criteria: string;
} {
  const learnRequired = ['.docpath/workspace/current.md', '.docpath/workspace/lesson-candidates.md'];
  const warningHint = hasHealthWarning
    ? '，且存在 install/health 或 regression 告警'
    : '';
  return {
    next_action: `检测到 ${lessonSummary.pendingCount} 条待固化 lesson 候选${warningHint}，建议先预览并沉淀为全局规范`,
    recommended_command: 'docpath learn --dry-run',
    required_context: learnRequired,
    required_files: learnRequired,
    must_update: globalRules,
    exit_criteria: '预览确认后运行 docpath learn，lesson 候选已合并或去重跳过',
  };
}

export function inferNextAction(
  state: Awaited<ReturnType<typeof readCurrentState>>,
  bc: BreadcrumbSummary,
  planTasks: Array<{ id: string; title: string; done: boolean }>,
  lastCheckContent: string,
  drift: PlanBreadcrumbDrift,
  hasSpec: boolean,
  backlogItems: BacklogItem[],
  tddState: TddStateSnapshot | null,
  historicalTaskDirCount: number,
  lessonSummary: { pendingCount: number; pendingKeys: string[] },
  hasIncompleteSpec: boolean,
  gitCloseout: GitCloseoutSummary | null,
  dirtyWorktree: DirtyWorktreeReport,
  hasHealthWarning: boolean = false,
  promotedBacklogId: string | null = null,
): {
  next_action: string;
  recommended_command: string;
  required_context: string[];
  required_files: string[];
  must_update: string[];
  exit_criteria: string;
} {
  const currentState = state?.state || 'unknown';
  const phase = state?.phase || '';
  const gate = state?.gate || 'none';
  const quickProfile = isQuickProfile(state?.workflow_profile);
  const firstOpenTask = planTasks.find((task) => !task.done);
  const allPlanDone = planTasks.length > 0 && planTasks.every((task) => task.done);
  const lastCheckFailed = /^\*\*结果\*\*:\s*❌\s*FAIL\s*$/m.test(lastCheckContent);
  const lastCheckPassed = /^\*\*结果\*\*:\s*✅\s*PASS\s*$/m.test(lastCheckContent);
  const hasPendingLessonCandidates = lessonSummary.pendingCount > 0;
  const globalRules = ruleDisplayPaths();
  const isCompleted = currentState === 'completed';
  const backlogOriginId = state?.backlog_id || promotedBacklogId;
  const isIdleOrCompleted = currentState === 'idle'
    || isCompleted
    || phase === 'idle';

  if (dirtyWorktree.isGitRepo && dirtyWorktree.dirty && isIdleOrCompleted) {
    const required = ['.docpath/workspace/current.md'];
    return {
      next_action: `当前 Git worktree 有 ${dirtyWorktree.files.length} 个未提交变更，先完成 git closeout 或创建隔离 worktree 后再启动新任务`,
      recommended_command: 'docpath changes --agent',
      required_context: required,
      required_files: required,
      must_update: [],
      exit_criteria: 'docpath changes --agent 已确认提交范围；新开发使用 docpath worktree create <slug> 隔离',
    };
  }

  let next_action = '评估当前任务状态';
  let recommended_command = 'docpath context';
  let required_context = ['.docpath/workspace/current.md'];
  let must_update: string[] = [];
  let exit_criteria = '任务目标完成';
  const acceptedBacklog = [...backlogItems]
    .filter((item) => item.status === 'accepted')
    .filter(isExecutableBacklogItem)
    .sort(compareBacklogPriority)[0];
  const immatureAcceptedBacklog = [...backlogItems]
    .filter((item) => item.status === 'accepted')
    .filter((item) => !isExecutableBacklogItem(item))
    .sort(compareBacklogPriority)[0];
  const proposedBacklog = [...backlogItems]
    .filter((item) => item.status === 'proposed')
    .sort(compareBacklogPriority)[0];

  if (!isCompleted && phase === 'reviewing' && (gate === 'review_pass' || gate === 'review_skipped')) {
    const reviewSkipped = gate === 'review_skipped';
    const required = reviewSkipped
      ? ['.docpath/workspace/current.md', '.docpath/workspace/last-check.md']
      : ['.docpath/workspace/current.md', '.docpath/workspace/review.md', '.docpath/workspace/last-check.md'];
    return {
      next_action: reviewSkipped
        ? '审查已按工作流策略跳过，执行知识归档'
        : '审查已通过，执行知识归档',
      recommended_command: 'docpath journal',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/decisions.md'],
      exit_criteria: '任务归档完成并进入 completed',
    };
  }

  if (drift.planDoneWithoutBreadcrumb.length > 0 || drift.breadcrumbDoneWithoutPlan.length > 0) {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'];
    const detail = [
      drift.planDoneWithoutBreadcrumb.length > 0
        ? `plan 已完成但缺少 breadcrumb: ${drift.planDoneWithoutBreadcrumb.join(', ')}`
        : '',
      drift.breadcrumbDoneWithoutPlan.length > 0
        ? `breadcrumb done 但 plan 未勾选: ${drift.breadcrumbDoneWithoutPlan.join(', ')}`
        : '',
    ].filter(Boolean).join('; ');
    return {
      next_action: `修正 plan/breadcrumb 漂移: ${detail}`,
      recommended_command: 'docpath check',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: 'plan checklist 与 breadcrumb done 记录一致',
    };
  }

  if (bc.blocked > 0) {
    const blocked = bc.entries.find(e => e.status === 'blocked');
    return {
      next_action: `处理阻塞步骤: ${blocked?.step || 'unknown'}`,
      recommended_command: blocked?.step ? `docpath recover ${blocked.step}` : 'docpath debug reproduce',
      required_context: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/workspace/last-check.md',
      ],
      required_files: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/workspace/last-check.md',
      ],
      must_update: ['.docpath/workspace/breadcrumb.md'],
      exit_criteria: '阻塞项有复现、定位或修复记录',
    };
  }

  const activeCheckFailure = gate === 'check_fail'
    || currentState === 'check_fail'
    || (phase === 'checking' && lastCheckFailed);
  if (activeCheckFailure) {
    if (tddState?.phase === 'check') {
      const required = [
        '.docpath/workspace/current.md',
        '.docpath/workspace/last-check.md',
        '.docpath/workspace/tdd-state.json',
      ];
      return {
        next_action: '质量检查失败，先修复失败项后回到 TDD 循环推进',
        recommended_command: 'docpath tdd next',
        required_context: required,
        required_files: required,
        must_update: ['.docpath/workspace/last-check.md', '.docpath/workspace/tdd-state.json'],
        exit_criteria: '修复失败项后重新通过 check，并推进 TDD 到下一阶段',
      };
    }
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/last-check.md', '.docpath/workspace/breadcrumb.md'];
    return {
      next_action: '修复质量检查失败项',
      recommended_command: 'docpath debug reproduce',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/last-check.md'],
      exit_criteria: '重新运行 docpath check 并通过',
    };
  }

  if (quickProfile && currentState !== 'completed' && phase !== 'completed') {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/quick.md'];
    if (gate === 'check_pass' || lastCheckPassed) {
      return {
        next_action: 'quick 任务已通过检查，执行压缩收口',
        recommended_command: 'docpath done',
        required_context: [...required, '.docpath/workspace/last-check.md'],
        required_files: [...required, '.docpath/workspace/last-check.md'],
        must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/decisions.md'],
        exit_criteria: 'quick 任务完成，review skip 由 quick profile 记录为审计证据',
      };
    }
    return {
      next_action: '执行 quick 任务改动并进行压缩收口',
      recommended_command: 'docpath done',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/last-check.md', '.docpath/workspace/breadcrumb.md', '.docpath/workspace/decisions.md'],
      exit_criteria: 'docpath done 已运行 check，并按 quick profile 跳过 full review 后完成',
    };
  }

  const activeStep = [...bc.entries].reverse().find(e => e.status === 'in_progress');
  if (!isCompleted && activeStep) {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: `完成进行中的步骤: ${activeStep.step}`,
      recommended_command: `docpath agent step --step ${activeStep.step} --status done`,
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: `${activeStep.step} 已完成并记录 breadcrumb`,
    };
  }

  if (!isCompleted && firstOpenTask) {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: `执行下一个未完成步骤: ${firstOpenTask.id} ${firstOpenTask.title}`,
      recommended_command: `docpath go --step ${firstOpenTask.id}`,
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md'],
      exit_criteria: `${firstOpenTask.id} 已完成并勾选 plan checklist`,
    };
  }

  if (!isCompleted && allPlanDone && !lastCheckPassed && gate !== 'check_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: '计划已完成，运行质量检查',
      recommended_command: 'docpath check',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/last-check.md', '.docpath/workspace/breadcrumb.md'],
      exit_criteria: 'last-check.md 显示 PASS',
    };
  }

  if (!isCompleted && gate === 'check_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/last-check.md'];
    return {
      next_action: '质量检查已通过，执行审查',
      recommended_command: 'docpath review',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/review.md', '.docpath/workspace/breadcrumb.md'],
      exit_criteria: '审查通过并记录 review 证据',
    };
  }

  if (isCompleted) {
    const required = ['.docpath/workspace/current.md'];
    if (gitCloseout?.needs_closeout) {
      return {
        next_action: '任务已完成，先运行 git closeout 只读检查',
        recommended_command: 'docpath changes --agent',
        required_context: required,
        required_files: required,
        must_update: [],
        exit_criteria: 'docpath changes --agent 已确认提交范围、canonical ignored evidence 与门禁证据',
      };
    }
    if (acceptedBacklog) {
      return {
        next_action: `从 backlog 拉起下一项任务: ${acceptedBacklog.id} ${acceptedBacklog.title}`,
        recommended_command: `docpath backlog promote ${acceptedBacklog.id}`,
        required_context: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        required_files: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        must_update: [],
        exit_criteria: `${acceptedBacklog.id} 已 promote 成活跃任务`,
      };
    }
    if (hasPendingLessonCandidates) {
      return buildLearnRoute(lessonSummary, hasHealthWarning, globalRules);
    }
    if (immatureAcceptedBacklog) {
      return {
        next_action: `backlog 条目尚未达到可执行成熟度: ${immatureAcceptedBacklog.id} ${immatureAcceptedBacklog.title}`,
        recommended_command: `docpath backlog edit ${immatureAcceptedBacklog.id} --readiness analyzed --evidence-analysis <path>`,
        required_context: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        required_files: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        must_update: [],
        exit_criteria: `${immatureAcceptedBacklog.id} 已补齐 readiness/evidence 后再 promote`,
      };
    }
    if (proposedBacklog) {
      if (!isExecutableBacklogItem(proposedBacklog)) {
        return {
          next_action: `先分析 backlog 条目再接收: ${proposedBacklog.id} ${proposedBacklog.title}`,
          recommended_command: `docpath brainstorm --dry-run --input ${quoteInline(proposedBacklog.title)}`,
          required_context: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
          required_files: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
          must_update: ['.docpath/backlog/'],
          exit_criteria: `${proposedBacklog.id} 已完成 dry-run 分析并通过 backlog edit 补齐 readiness/evidence 后再 accept`,
        };
      }
      return {
        next_action: `先接收 backlog 条目: ${proposedBacklog.id} ${proposedBacklog.title}`,
        recommended_command: `docpath backlog accept ${proposedBacklog.id}`,
        required_context: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        required_files: ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'],
        must_update: [],
        exit_criteria: `${proposedBacklog.id} 已进入 accepted`,
      };
    }
    if (!acceptedBacklog && !proposedBacklog && historicalTaskDirCount > GC_TASK_DIR_THRESHOLD) {
      return {
        next_action: `检测到 ${historicalTaskDirCount} 个历史任务目录，建议预览 workspace cleanup 与历史任务归档候选`,
        recommended_command: 'docpath gc',
        required_context: required,
        required_files: required,
        must_update: [],
        exit_criteria: '已预览 workspace cleanup 与历史任务归档候选；确认后可运行 docpath gc --force',
      };
    }
    return {
      next_action: '任务已完成，可捕获新想法；若需求已经清晰，再运行 analyze/refine 后创建可执行 backlog',
      recommended_command: 'docpath backlog capture --title <title>',
      required_context: required,
      required_files: required,
      must_update: [],
      exit_criteria: '已捕获 raw backlog 条目，或已完成 analyze/refine 后创建成熟 backlog',
    };
  }

  switch (currentState) {
    case 'idle':
      if (acceptedBacklog) {
        next_action = `从 backlog 拉起下一项任务: ${acceptedBacklog.id} ${acceptedBacklog.title}`;
        recommended_command = `docpath backlog promote ${acceptedBacklog.id}`;
        required_context = ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'];
        exit_criteria = `${acceptedBacklog.id} 已 promote 成活跃任务`;
      } else if (hasPendingLessonCandidates) {
        const learnRoute = buildLearnRoute(lessonSummary, hasHealthWarning, globalRules);
        next_action = learnRoute.next_action;
        recommended_command = learnRoute.recommended_command;
        required_context = learnRoute.required_context;
        must_update = learnRoute.must_update;
        exit_criteria = learnRoute.exit_criteria;
      } else if (immatureAcceptedBacklog) {
        next_action = `backlog 条目尚未达到可执行成熟度: ${immatureAcceptedBacklog.id} ${immatureAcceptedBacklog.title}`;
        recommended_command = `docpath backlog edit ${immatureAcceptedBacklog.id} --readiness analyzed --evidence-analysis <path>`;
        required_context = ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'];
        exit_criteria = `${immatureAcceptedBacklog.id} 已补齐 readiness/evidence 后再 promote`;
      } else if (proposedBacklog) {
        if (!isExecutableBacklogItem(proposedBacklog)) {
          next_action = `先分析 backlog 条目再接收: ${proposedBacklog.id} ${proposedBacklog.title}`;
          recommended_command = `docpath brainstorm --dry-run --input ${quoteInline(proposedBacklog.title)}`;
          required_context = ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'];
          must_update = ['.docpath/backlog/'];
          exit_criteria = `${proposedBacklog.id} 已完成 dry-run 分析并通过 backlog edit 补齐 readiness/evidence 后再 accept`;
          break;
        }
        next_action = `先接收 backlog 条目: ${proposedBacklog.id} ${proposedBacklog.title}`;
        recommended_command = `docpath backlog accept ${proposedBacklog.id}`;
        required_context = ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'];
        exit_criteria = `${proposedBacklog.id} 已进入 accepted`;
      } else {
        next_action = '当前无活跃任务，可先捕获 raw backlog；若需求已清晰，先 analyze/refine 再创建成熟条目';
        recommended_command = 'docpath backlog capture --title <title>';
        required_context = ['.docpath/workspace/current.md', ...globalRules];
        exit_criteria = '至少存在一条 raw backlog，或已完成 analyze/refine 后创建成熟 backlog';
      }
      break;
    case 'drafting':
      if (hasSpec && !hasIncompleteSpec) {
        next_action = backlogOriginId
          ? `spec 已就绪，生成执行计划。${SPEC_TRUTH_SYNC_ROUTE_HINT}`
          : 'spec 已就绪，生成执行计划';
        recommended_command = 'docpath plan';
        required_context = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md'];
        exit_criteria = 'plan.md 已生成';
      } else if (hasSpec && hasIncompleteSpec) {
        // 感知 backlog origin：如果任务源自 promote，推荐 --from-backlog 模式
        if (backlogOriginId) {
          next_action = `当前 spec 来自 backlog promote，请基于已有证据深化需求（而非从零澄清）。${SPEC_TRUTH_SYNC_ROUTE_HINT}`;
          recommended_command = `docpath brainstorm --from-backlog ${backlogOriginId}`;
        } else {
          next_action = '当前 spec 仍是骨架内容，请先补全需求背景、验收标准和范围边界';
          recommended_command = 'docpath brainstorm --dry-run';
        }
        required_context = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md', ...globalRules];
        must_update = ['.docpath/tasks/current/spec.md'];
        exit_criteria = 'spec.md 不再包含“待补充”，并明确需求、范围和验收';
      } else {
        next_action = '完成需求澄清后写入 spec';
        recommended_command = 'docpath write-spec';
        required_context = ['.docpath/workspace/current.md', ...globalRules];
        exit_criteria = 'spec.md 已写入';
      }
      break;
    case 'planning_done':
      next_action = '计划已就绪，执行第一个子任务';
      recommended_command = 'docpath go --step S1';
      required_context = [
        '.docpath/workspace/current.md',
        '.docpath/tasks/current/plan.md',
      ];
      exit_criteria = '第一步执行完成并记录 breadcrumb';
      break;
    case 'executing':
      next_action = `继续执行阶段: ${phase}`;
      recommended_command = 'docpath breadcrumb add';
      required_context = [
        '.docpath/workspace/current.md',
        '.docpath/workspace/breadcrumb.md',
        '.docpath/tasks/current/plan.md',
      ];
      must_update = ['.docpath/workspace/breadcrumb.md'];
      if (bc.blocked > 0) {
        next_action = `处理 ${bc.blocked} 个阻塞项后继续: ${phase}`;
      }
      exit_criteria = 'plan.md 中所有步骤标记完成';
      break;
    case 'reviewing':
      next_action = '执行代码/设计审查';
      recommended_command = 'docpath breadcrumb add';
      exit_criteria = '审查通过，无未解决的问题';
      break;
    default:
      next_action = '运行 docpath status 评估当前状态';
      recommended_command = 'docpath status';
  }

  return { next_action, recommended_command, required_context, required_files: required_context, must_update, exit_criteria };
}

export type RouteSummary = ReturnType<typeof inferNextAction>;

export const GENERATED_VIEW_PATHS = new Set([
  '.docpath/workspace/current.md',
  '.docpath/workspace/breadcrumb.md',
  '.docpath/tasks/current/plan.md',
  '.docpath/docs-index.json',
]);

export function routeStepTopic(command: string): string | null {
  const goMatch = command.match(/\bdocpath\s+go\s+--step\s+("?)([^"\s]+)\1/);
  if (goMatch?.[2]) return goMatch[2];
  const agentStepMatch = command.match(/\bdocpath\s+agent\s+step\s+--step\s+("?)([^"\s]+)\1/);
  if (agentStepMatch?.[2]) return agentStepMatch[2];
  return null;
}

export function contextRole(path: string): string {
  if (path.endsWith('/current.md')) return 'rendered_state_view';
  if (path.endsWith('/breadcrumb.md')) return 'rendered_progress_view';
  if (path.endsWith('/spec.md')) return 'task_spec';
  if (path.endsWith('/plan.md')) return 'task_plan';
  if (path.endsWith('/last-check.md')) return 'quality_gate_evidence';
  if (path.endsWith('/review.md')) return 'review_evidence';
  if (path.endsWith('/pending-done.md')) return 'pending_done_sentinel';
  if (path.includes('/backlog/')) return 'backlog_index';
  return 'context_reference';
}

export function contextAccess(path: string): 'index_only' | 'read_if_needed' {
  return GENERATED_VIEW_PATHS.has(path) ? 'index_only' : 'read_if_needed';
}

export function contextPreferredCommand(path: string, topic: string | null): string | undefined {
  if (topic && (path.endsWith('/plan.md') || path.endsWith('/spec.md'))) {
    return `docpath reveal --topic ${topic} --level 1`;
  }
  if (path.endsWith('/breadcrumb.md')) return 'docpath reveal --topic breadcrumb --level 1';
  if (path.endsWith('/current.md')) return 'docpath next --agent';
  if (path.endsWith('/last-check.md')) return 'docpath reveal --topic check --level 1';
  if (path.includes('/backlog/')) return 'docpath backlog list --agent';
  return undefined;
}

export function buildContextRefs(route: RouteSummary): AgentOutput['context_refs'] {
  const topic = routeStepTopic(route.recommended_command);
  return Array.from(new Set(route.required_context)).map((path) => {
    const ref: NonNullable<AgentOutput['context_refs']>[number] = {
      path,
      role: contextRole(path),
      access: contextAccess(path),
    };
    const preferred = contextPreferredCommand(path, topic);
    if (preferred) ref.preferred_command = preferred;
    return ref;
  });
}

export function shouldAvoidDirectEdit(path: string): boolean {
  return path.startsWith('.docpath/workspace/')
    || path.startsWith('.docpath/tasks/current/')
    || path === '.docpath/backlog/'
    || path.startsWith('.docpath/backlog/');
}

export function buildCommandEffects(route: RouteSummary): AgentOutput['command_effects'] {
  const updates = Array.from(new Set(route.must_update));
  return {
    updates,
    update_mode: 'via_docpath_command',
    do_not_edit_directly: updates.filter(shouldAvoidDirectEdit),
  };
}

export async function loadAgentOutputContext(cwd: string, docpathDir: string): Promise<AgentOutputContext> {
  const state = await readCurrentState(cwd);
  const lastCheckContent = await readLastCheckMarkdown(docpathDir);
  const hasSpec = existsSync(join(docpathDir, 'tasks', 'current', 'spec.md'));
  const specContent = hasSpec ? await readActiveTaskFile(docpathDir, state?.task_id, 'spec.md') : '';
  const planContent = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
  const planTasks = await resolveEffectivePlanTasks(cwd);
  const rawBreadcrumb = await readBreadcrumb(cwd);
  const bc = summarizeCurrentTaskBreadcrumbs(rawBreadcrumb, state?.task_id || '');
  const drift = await detectPlanBreadcrumbDrift(cwd);
  const identityDrifts = await detectActiveTaskIdentityDrift(docpathDir, state?.task_id || undefined);
  const structuredMarkdownDrifts = await detectActiveStructuredMarkdownDrifts(docpathDir, state?.task_id || undefined);
  const backlogItems = await listBacklogItems(cwd);
  const pendingDone = await handleStalePendingDoneWarning(cwd, state, await readPendingDone(cwd));
  const tddState = parseTddState(await readOptionalFile(join(docpathDir, 'workspace', 'tdd-state.json')));
  const historicalTaskDirCount = await countHistoricalTaskDirs(docpathDir, state?.task_id || undefined);
  const lessonSummary = summarizeUnlearnedLessonCandidates(
    await readOptionalFile(join(docpathDir, 'workspace', 'lesson-candidates.md')),
    (await readRuleFile(docpathDir, 'style')).content,
    (await readRuleFile(docpathDir, 'architecture')).content,
  );
  const installHealth = await readInstallHealth(cwd, docpathDir);
  const gitCloseout = (state?.state === 'completed' || state?.phase === 'completed')
    ? await readGitCloseoutSummary(cwd, docpathDir, state?.task_id || undefined)
    : null;
  const dirtyWorktree = detectDirtyWorktree(cwd);
  const majorChangeGate = await resolveMajorChangeGateStatus(cwd, docpathDir, state?.task_id || undefined);
  let structuredSpec: StructuredSpecDocument | null = null;
  try {
    structuredSpec = await readActiveStructuredSpecDocument(docpathDir, state?.task_id || undefined);
  } catch {
    structuredSpec = null;
  }
  const contextIndex = await readHybridContextIndexSummary(cwd);
  const contextIndexTrunk = await readHybridContextIndexTrunk(cwd);
  const contextIndexLeaves = await readHybridContextIndexLeaves(cwd);
  const [recentDecisions] = await Promise.all([
    loadRecentDecisions(docpathDir),
  ]);
  const specSummary = specContent ? extractSpecSummary(specContent) : null;

  return {
    docpathDir,
    state,
    lastCheckContent,
    hasSpec,
    planContent,
    planTasks,
    bc,
    drift,
    identityDrifts,
    structuredMarkdownDrifts,
    backlogItems,
    pendingDone,
    tddState,
    historicalTaskDirCount,
    lessonSummary,
    hasIncompleteSpec: hasSpec ? isIncompleteSpec(specContent) : false,
    installHealth,
    gitCloseout,
    dirtyWorktree,
    majorChangeGate,
    structuredSpec,
    contextIndex,
    contextIndexTrunk,
    contextIndexLeaves,
    specSummary,
    recentDecisions,
  };
}

export function generateQuickFix(context: AgentOutputContext): string | undefined {
  const { drift, state, planContent } = context;

  if (context.identityDrifts.length > 0) {
    return 'docpath tasks drift';
  }

  if (planContent && !planContent.includes('## Checklist')) {
    return 'docpath tasks sync --from current';
  }

  if (drift.breadcrumbDoneWithoutPlan.length > 0) {
    const firstStep = drift.breadcrumbDoneWithoutPlan[0];
    return `docpath agent step --step "${firstStep}" --status done`;
  }

  if (state?.gate === 'check_fail' && state.current_step?.includes('任务文件 current/canonical 漂移')) {
    return 'docpath tasks sync --from current';
  }

  return undefined;
}

export function inferRouteFromContext(context: AgentOutputContext): RouteSummary {
  const { pendingDone, state } = context;
  if (context.identityDrifts.length > 0) {
    const required = [
      '.docpath/workspace/state.json',
      '.docpath/tasks/current/spec.md',
      ...(state?.task_id ? [`.docpath/tasks/${state.task_id}/spec.md`] : []),
    ];
    return {
      next_action: '检测到 task identity drift：state.task_id 与 spec H1 声明的 task id 不一致，先恢复任务身份再继续',
      recommended_command: 'docpath tasks drift',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/tasks/current/spec.md', ...(state?.task_id ? [`.docpath/tasks/${state.task_id}/spec.md`] : [])],
      exit_criteria: 'state.task_id、current spec 与 canonical spec 声明同一个 task id；旧 breadcrumb 不再与新 plan 混用',
    };
  }

  if (context.structuredMarkdownDrifts.length > 0) {
    const first = context.structuredMarkdownDrifts[0];
    const command = first.file === 'plan.md' ? 'docpath write-plan --stdin' : 'docpath write-spec --stdin';
    const required = Array.from(new Set(context.structuredMarkdownDrifts.flatMap((drift) => [
      drift.markdownPath.replace(`${context.docpathDir}/`, '.docpath/'),
      drift.jsonPath.replace(`${context.docpathDir}/`, '.docpath/'),
    ])));
    return {
      next_action: `检测到 ${first.file} 与 ${first.file.replace('.md', '.json')} 机器真理源不同步：${formatStructuredMarkdownHashDrift(first).split('\n')[0]}`,
      recommended_command: command,
      required_context: required,
      required_files: required,
      must_update: required.filter((path) => path.endsWith('.md') || path.endsWith('.json')),
      exit_criteria: 'Markdown 与 JSON source.content_sha256 一致；后续 next/status 不再使用过期机器真理源',
    };
  }

  const inferred = inferNextAction(
    state,
    context.bc,
    context.planTasks,
    context.lastCheckContent,
    context.drift,
    context.hasSpec,
    context.backlogItems,
    context.tddState,
    context.historicalTaskDirCount,
    context.lessonSummary,
    context.hasIncompleteSpec,
    context.gitCloseout,
    context.dirtyWorktree,
    hasHealthRegressionWarning(context.installHealth),
    context.structuredSpec?.backlog_id || null,
  );

  const hasDrift = context.drift.planDoneWithoutBreadcrumb.length > 0 || context.drift.breadcrumbDoneWithoutPlan.length > 0;
  const isTroubleshooting = hasDrift
    || inferred.recommended_command.startsWith('docpath debug')
    || inferred.recommended_command.startsWith('docpath recover')
    || inferred.recommended_command.startsWith('docpath tdd')
    || (state?.gate === 'check_fail');

  if (shouldRouteToMajorChangeGate(context, inferred.recommended_command)) {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md'];
    return {
      next_action: '重大变更门禁未完成，先补齐 spec Decision Brief 和用户确认',
      recommended_command: 'docpath write-spec',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/tasks/current/spec.md'],
      exit_criteria: 'spec.md 的重大变更门禁已勾选“是，需要用户确认”，Decision Brief 已填写，用户确认已记录',
    };
  }

  if (!pendingDone && state?.phase === 'executing' && state.task_id && !isQuickProfile(state.workflow_profile) && !isTroubleshooting) {
    const required = ['.docpath/workspace/current.md', '.docpath/tasks/current/plan.md'];
    return {
      next_action: '开始或恢复任务执行，运行 agent enter 初始化会话',
      recommended_command: 'docpath agent enter',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/pending-done.md', '.docpath/workspace/breadcrumb.md'],
      exit_criteria: '已运行 docpath agent enter 并生成 pending-done 哨兵',
    };
  }

  if (pendingDone && state?.phase === 'executing' && pendingDone.task_id === state.task_id) {
    const hasActiveOrOpenPlanWork = context.bc.inProgress > 0 || context.planTasks.some((task) => !task.done);

    if (hasActiveOrOpenPlanWork || isTroubleshooting) {
      return {
        ...inferred,
        next_action: `${inferred.next_action}（检测到 pending-done 哨兵，完成当前步骤后再收尾）`,
        required_context: Array.from(new Set([...inferred.required_context, '.docpath/workspace/pending-done.md'])),
        required_files: Array.from(new Set([...inferred.required_files, '.docpath/workspace/pending-done.md'])),
      };
    }

    return {
      next_action: `检测到未收尾任务哨兵，请先完成当前任务: ${pendingDone.task_id}`,
      recommended_command: 'docpath done',
      required_context: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/pending-done.md',
        '.docpath/tasks/current/plan.md',
      ],
      required_files: [
        '.docpath/workspace/current.md',
        '.docpath/workspace/pending-done.md',
        '.docpath/tasks/current/plan.md',
      ],
      must_update: ['.docpath/workspace/breadcrumb.md'],
      exit_criteria: '运行 docpath done 并清理 pending-done 哨兵',
    };
  }

  return inferred;
}

export function shouldRouteToMajorChangeGate(context: AgentOutputContext, recommendedCommand: string): boolean {
  if (context.majorChangeGate.confirmed || context.majorChangeGate.signals.length === 0) return false;
  const phase = context.state?.phase || '';
  if (phase === 'completed' || phase === 'reviewing') return false;
  if (/^docpath (?:plan|go|agent step|agent enter)\b/.test(recommendedCommand)) return true;
  return ['drafting', 'planning', 'executing', 'checking'].includes(phase);
}
