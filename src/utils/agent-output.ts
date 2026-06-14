/**
 * Agent YAML output — 机器可读状态摘要
 *
 * 给 stats --agent 和 context --agent 共用。
 * 输出 state/next_action/recommended_command/required_context/must_update/exit_criteria。
 */

import { stringify } from 'yaml';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { parsePlanTasks, readCurrentMd, readOptionalFile } from './workspace.js';
import { readBreadcrumb, type BreadcrumbEntry, type BreadcrumbSummary } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { detectPlanBreadcrumbDrift, resolveEffectivePlanTasks, type PlanBreadcrumbDrift } from './plan-sync.js';
import { readActiveTaskFile } from './task-files.js';
import { listBacklogItems, type BacklogItem } from '../engine/backlog.js';
import { handleStalePendingDoneWarning, readPendingDone } from './pending-done.js';
import { readRuleFile, ruleDisplayPaths } from './rules.js';
import { buildInstallDoctorReport, isInstallTarget, type InstallDoctorReport } from '../commands/install.js';
import { readHybridContextIndexSummary, readHybridContextIndexTrunk, readHybridContextIndexLeaves, type HybridContextIndexSummary, type HybridContextIndexEntry } from './context-index.js';
import { readGitCloseoutSummary, type GitCloseoutSummary } from './git-closeout.js';

export interface AgentOutput {
  /** 当前状态 (state machine state) */
  state: string;
  /** 复杂度级别 */
  level: number | null;
  /** 任务标识 */
  task_id: string;
  /** 任务标题 */
  task_title: string;
  /** 当前阶段 */
  phase: string;
  /** 当前门禁状态 */
  gate: string;
  /** 下一步动作 (自然语言) */
  next_action: string;
  /** 推荐的 docpath 命令 */
  recommended_command: string;
  /** 快速修复建议（检测到常见错误时提供） */
  quick_fix?: string;
  /** 需要读取的上下文文件列表 */
  required_context: string[];
  /** required_context 的机器友好别名 */
  required_files: string[];
  /** 需要更新的文件列表 */
  must_update: string[];
  /** 退出标准 (任务完成条件) */
  exit_criteria: string;
  /** 面包屑进度 */
  progress: {
    done: number;
    total: number;
    in_progress: number;
    blocked: number;
  };
  /** plan/breadcrumb 漂移摘要 */
  drift_summary: string | null;
  /** plan/breadcrumb 漂移明细 */
  drift_details: {
    plan_done_without_breadcrumb: string[];
    breadcrumb_done_without_plan: string[];
  };
  /** 待学习 lesson 候选摘要 */
  lesson_summary: {
    pending_count: number;
    pending_keys: string[];
  };
  /** 安装资产与 Agent 配置健康摘要 */
  install_health: {
    target: string;
    passed: boolean;
    errors: number;
    warnings: number;
    recommended_command: string | null;
    issue_ids: string[];
  } | null;
  /** 任务级 Hybrid Context Index 摘要；旧任务没有 index 时省略。 */
  context_index?: HybridContextIndexSummary;
  /** Hybrid Context Index trunk (稳定核心,优先展示) */
  context_index_trunk?: HybridContextIndexEntry[];
  /** 当前焦点 (根据 phase/gate 智能展开的内容) */
  current_focus?: {
    phase: string;
    detail: string;
  };
  /** Hybrid Context Index leaves 索引 (不展开,只列标题) */
  context_index_leaves?: Array<{ id: string; label: string; summary: string }>;
  /** 时间戳 */
  generated_at: string;
}

function selectCurrentFocus(
  phase: string,
  gate: string,
  context: AgentOutputContext,
): { phase: string; detail: string } | null {
  // 根据 phase/gate 智能选择当前需要展开的内容

  if (phase === 'executing') {
    // 执行阶段:展开 plan 当前步骤
    const openStep = context.planTasks.find(task => !task.done);
    if (openStep) {
      return {
        phase: 'executing',
        detail: `当前步骤: ${openStep.id} - ${openStep.title}\n进度: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成`,
      };
    }
    // 如果所有步骤完成,提示
    if (context.planTasks.length > 0) {
      return {
        phase: 'executing',
        detail: `所有计划步骤已完成 (${context.planTasks.length}/${context.planTasks.length})\n建议运行 check 门禁`,
      };
    }
  }

  if (phase === 'checking') {
    // 检查阶段:展开 last-check 结果
    if (context.lastCheckContent) {
      const lines = context.lastCheckContent.split('\n').slice(0, 15); // 前15行
      return {
        phase: 'checking',
        detail: lines.join('\n'),
      };
    }
  }

  if (phase === 'completed') {
    // 完成阶段:优先展开 lesson,否则展示完成摘要
    if (context.lessonSummary.pendingCount > 0) {
      return {
        phase: 'completed',
        detail: `待归档 lesson: ${context.lessonSummary.pendingCount} 条\nKeys: ${context.lessonSummary.pendingKeys.slice(0, 3).join(', ')}${context.lessonSummary.pendingKeys.length > 3 ? '...' : ''}`,
      };
    }
    // 没有 lesson 时,展示完成摘要
    return {
      phase: 'completed',
      detail: `任务已完成\n计划: ${context.planTasks.filter(t => t.done).length}/${context.planTasks.length} 完成\n门禁: ${gate}`,
    };
  }

  return null;
}

function summarizeDrift(drift: PlanBreadcrumbDrift): string | null {
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

function summarizeCurrentTaskBreadcrumbs(
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

function compareBacklogPriority(a: BacklogItem, b: BacklogItem): number {
  const priorityOrder = Number.parseInt(a.priority.slice(1), 10) - Number.parseInt(b.priority.slice(1), 10);
  if (priorityOrder !== 0) return priorityOrder;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

function backlogReadinessRank(item: BacklogItem): number {
  return ['raw', 'shaped', 'analyzed', 'confirmed'].indexOf(item.readiness);
}

function isExecutableBacklogItem(item: BacklogItem): boolean {
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

function quoteInline(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const GC_TASK_DIR_THRESHOLD = 20;

async function countHistoricalTaskDirs(docpathDir: string, activeTaskId?: string): Promise<number> {
  const tasksDir = join(docpathDir, 'tasks');
  if (!existsSync(tasksDir)) return 0;
  const entries = await readdir(tasksDir, { withFileTypes: true });
  return entries.filter((entry) =>
    entry.isDirectory()
    && /^T-\d{8}(?:-|$)/.test(entry.name)
    && entry.name !== activeTaskId
  ).length;
}

function hasLessonCandidates(content: string): boolean {
  if (!content.trim()) return false;
  return /^-\s*key:\s*\S+/m.test(content) && /^###\s+Lesson\s*$/m.test(content);
}

function normalizeLessonKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractExistingLessonMetaKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const regex = /^<!--\s+docpath:lesson-meta\s+(.+?)\s+-->$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) != null) {
    keys.add(normalizeLessonKeyPart(match[1]));
  }
  return keys;
}

function candidateLessonKeys(content: string): string[] {
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

function summarizeUnlearnedLessonCandidates(
  candidatesContent: string,
  styleContent: string,
  architectureContent: string,
): { pendingCount: number; pendingKeys: string[] } {
  const keys = candidateLessonKeys(candidatesContent);
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

type TddStateSnapshot = {
  phase?: string;
};

type AgentOutputContext = {
  docpathDir: string;
  state: Awaited<ReturnType<typeof readCurrentMd>>;
  lastCheckContent: string;
  hasSpec: boolean;
  planContent: string;
  planTasks: Array<{ id: string; title: string; done: boolean }>;
  bc: BreadcrumbSummary;
  drift: PlanBreadcrumbDrift;
  backlogItems: BacklogItem[];
  pendingDone: Awaited<ReturnType<typeof readPendingDone>>;
  tddState: TddStateSnapshot | null;
  historicalTaskDirCount: number;
  lessonSummary: { pendingCount: number; pendingKeys: string[] };
  hasIncompleteSpec: boolean;
  installHealth: InstallDoctorReport | null;
  gitCloseout: GitCloseoutSummary | null;
  contextIndex: HybridContextIndexSummary | null;
  contextIndexTrunk: HybridContextIndexEntry[] | null;
  contextIndexLeaves: HybridContextIndexEntry[] | null;
};

function parseTddState(raw: string): TddStateSnapshot | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as TddStateSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isIncompleteSpec(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return /待补充/.test(trimmed);
}

async function readInstallHealth(cwd: string, docpathDir: string): Promise<InstallDoctorReport | null> {
  const metaRaw = await readOptionalFile(join(docpathDir, '.install-meta.json'));
  let target = 'universal';
  try {
    const meta = metaRaw ? JSON.parse(metaRaw) as { target?: unknown } : null;
    if (isInstallTarget(meta?.target)) target = meta.target;
  } catch {
    // manifest 无法解析时仍交给 doctor 报告具体错误。
  }
  return buildInstallDoctorReport({ cwd, target });
}

/**
 * 推断下一步动作
 */
function inferNextAction(
  state: Awaited<ReturnType<typeof readCurrentMd>>,
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
  const firstOpenTask = planTasks.find((task) => !task.done);
  const allPlanDone = planTasks.length > 0 && planTasks.every((task) => task.done);
  const lastCheckFailed = /^\*\*结果\*\*:\s*❌\s*FAIL\s*$/m.test(lastCheckContent);
  const lastCheckPassed = /^\*\*结果\*\*:\s*✅\s*PASS\s*$/m.test(lastCheckContent);
  const hasPendingLessonCandidates = lessonSummary.pendingCount > 0;
  const globalRules = ruleDisplayPaths();

  // 默认值
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
      recommended_command: 'docpath debug reproduce',
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

  if (gate === 'check_fail' || currentState === 'check_fail' || lastCheckFailed) {
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

  const activeStep = [...bc.entries].reverse().find(e => e.status === 'in_progress');
  if (activeStep) {
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

  if (firstOpenTask) {
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

  if (allPlanDone && !lastCheckPassed && gate !== 'check_pass' && gate !== 'review_pass') {
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

  if (gate === 'check_pass' && currentState !== 'review_pass') {
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

  if (currentState === 'completed' || phase === 'completed') {
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
    if (hasPendingLessonCandidates) {
      const learnRequired = ['.docpath/workspace/current.md', '.docpath/workspace/lesson-candidates.md'];
      return {
        next_action: `检测到 ${lessonSummary.pendingCount} 条待固化 lesson 候选，建议先预览并沉淀为全局规范`,
        recommended_command: 'docpath learn --dry-run',
        required_context: learnRequired,
        required_files: learnRequired,
        must_update: globalRules,
        exit_criteria: '预览确认后运行 docpath learn，lesson 候选已合并或去重跳过',
      };
    }
    if (!acceptedBacklog && !proposedBacklog && historicalTaskDirCount > GC_TASK_DIR_THRESHOLD) {
      return {
        next_action: `检测到 ${historicalTaskDirCount} 个历史任务目录，建议先预览清理`,
        recommended_command: 'docpath gc',
        required_context: required,
        required_files: required,
        must_update: [],
        exit_criteria: '已预览历史任务目录清理候选；确认后可运行 docpath gc --force',
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

  if (gate === 'review_pass' || currentState === 'review_pass') {
    const required = ['.docpath/workspace/current.md', '.docpath/workspace/review.md', '.docpath/workspace/last-check.md'];
    return {
      next_action: '审查已通过，执行知识归档',
      recommended_command: 'docpath journal',
      required_context: required,
      required_files: required,
      must_update: ['.docpath/workspace/breadcrumb.md', '.docpath/workspace/decisions.md'],
      exit_criteria: '任务归档完成并进入 completed',
    };
  }

  switch (currentState) {
    case 'idle':
      if (acceptedBacklog) {
        next_action = `从 backlog 拉起下一项任务: ${acceptedBacklog.id} ${acceptedBacklog.title}`;
        recommended_command = `docpath backlog promote ${acceptedBacklog.id}`;
        required_context = ['.docpath/workspace/current.md', '.docpath/backlog/backlog.md'];
        exit_criteria = `${acceptedBacklog.id} 已 promote 成活跃任务`;
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
      } else if (hasPendingLessonCandidates) {
        next_action = `检测到 ${lessonSummary.pendingCount} 条待固化 lesson 候选，建议先预览并沉淀为全局规范`;
        recommended_command = 'docpath learn --dry-run';
        required_context = ['.docpath/workspace/current.md', '.docpath/workspace/lesson-candidates.md'];
        must_update = globalRules;
        exit_criteria = '预览确认后运行 docpath learn，lesson 候选已合并或去重跳过';
      } else {
        next_action = '当前无活跃任务，可先捕获 raw backlog；若需求已清晰，先 analyze/refine 再创建成熟条目';
        recommended_command = 'docpath backlog capture --title <title>';
        required_context = ['.docpath/workspace/current.md', ...globalRules];
        exit_criteria = '至少存在一条 raw backlog，或已完成 analyze/refine 后创建成熟 backlog';
      }
      break;
    case 'drafting':
      if (hasSpec && !hasIncompleteSpec) {
        next_action = 'spec 已就绪，生成执行计划';
        recommended_command = 'docpath plan';
        required_context = ['.docpath/workspace/current.md', '.docpath/tasks/current/spec.md'];
        exit_criteria = 'plan.md 已生成';
      } else if (hasSpec && hasIncompleteSpec) {
        next_action = '当前 spec 仍是骨架内容，请先补全需求背景、验收标准和范围边界';
        recommended_command = 'docpath brainstorm --dry-run';
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
      recommended_command = 'docpath go';
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

async function loadAgentOutputContext(cwd: string, docpathDir: string): Promise<AgentOutputContext> {
  const state = await readCurrentMd(cwd);
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const hasSpec = existsSync(join(docpathDir, 'tasks', 'current', 'spec.md'));
  const specContent = hasSpec ? await readActiveTaskFile(docpathDir, state?.task_id, 'spec.md') : '';
  const planContent = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
  const planTasks = await resolveEffectivePlanTasks(cwd);
  const rawBreadcrumb = await readBreadcrumb(cwd);
  const bc = summarizeCurrentTaskBreadcrumbs(rawBreadcrumb, state?.task_id || '');
  const drift = await detectPlanBreadcrumbDrift(cwd);
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
  const contextIndex = await readHybridContextIndexSummary(cwd);
  const contextIndexTrunk = await readHybridContextIndexTrunk(cwd);
  const contextIndexLeaves = await readHybridContextIndexLeaves(cwd);

  return {
    docpathDir,
    state,
    lastCheckContent,
    hasSpec,
    planContent,
    planTasks,
    bc,
    drift,
    backlogItems,
    pendingDone,
    tddState,
    historicalTaskDirCount,
    lessonSummary,
    hasIncompleteSpec: hasSpec ? isIncompleteSpec(specContent) : false,
    installHealth,
    gitCloseout,
    contextIndex,
    contextIndexTrunk,
    contextIndexLeaves,
  };
}

/**
 * 生成快速修复建议
 */
function generateQuickFix(context: AgentOutputContext): string | undefined {
  const { drift, state, planContent } = context;

  // 1. plan 缺少 checklist
  if (planContent && !planContent.includes('## Checklist')) {
    return 'docpath tasks sync --from current';
  }

  // 2. breadcrumb 漂移
  if (drift.breadcrumbDoneWithoutPlan.length > 0) {
    const firstStep = drift.breadcrumbDoneWithoutPlan[0];
    return `docpath agent step --step "${firstStep}" --status done`;
  }

  // 3. plan/canonical 不同步
  if (state?.gate === 'check_fail' && state.current_step?.includes('任务文件 current/canonical 漂移')) {
    return 'docpath tasks sync --from current';
  }

  return undefined;
}

function inferRouteFromContext(context: AgentOutputContext): ReturnType<typeof inferNextAction> {
  const { pendingDone, state } = context;
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
  );

  if (pendingDone && state?.phase === 'executing' && pendingDone.task_id === state.task_id) {
    const hasActiveOrOpenPlanWork = context.bc.inProgress > 0 || context.planTasks.some((task) => !task.done);
    if (hasActiveOrOpenPlanWork) {
      return {
        ...inferred,
        next_action: `${inferred.next_action}（检测到 pending-done 哨兵，完成当前步骤后再收尾）`,
        required_context: Array.from(new Set([...inferred.required_context, '.docpath/workspace/pending-done.md'])),
        required_files: Array.from(new Set([...inferred.required_files, '.docpath/workspace/pending-done.md'])),
      };
    }

    return {
      next_action: `检测到未收尾任务哨兵，请先完成当前任务: ${pendingDone.task_id}`,
      recommended_command: 'docpath agent done',
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
      exit_criteria: '运行 docpath agent done 并清理 pending-done 哨兵',
    };
  }

  return inferred;
}

/**
 * 生成 Agent YAML 输出
 */
export async function generateAgentOutput(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    // 无 .docpath 时返回最小状态
    return stringify({
      state: 'uninitialized',
      next_action: '运行 docpath init 初始化项目',
      recommended_command: 'docpath init',
      generated_at: new Date().toISOString(),
    });
  }

  const context = await loadAgentOutputContext(cwd, docpathDir);
  const inferred = inferRouteFromContext(context);
  const quickFix = generateQuickFix(context);

  const output: AgentOutput = {
    state: context.state?.state || 'unknown',
    level: context.state?.level ?? null,
    task_id: context.state?.task_id || '',
    task_title: context.state?.task_title || '',
    phase: context.state?.phase || '',
    gate: context.state?.gate || 'none',
    ...inferred,
    ...(quickFix ? { quick_fix: quickFix } : {}),
    required_context: [...inferred.required_context],
    required_files: [...inferred.required_files],
    must_update: [...inferred.must_update],
    progress: {
      done: context.planTasks.filter((task) => task.done).length,
      total: context.planTasks.length,
      in_progress: context.bc.inProgress,
      blocked: context.bc.blocked,
    },
    drift_summary: summarizeDrift(context.drift),
    drift_details: {
      plan_done_without_breadcrumb: [...context.drift.planDoneWithoutBreadcrumb],
      breadcrumb_done_without_plan: [...context.drift.breadcrumbDoneWithoutPlan],
    },
    lesson_summary: {
      pending_count: context.lessonSummary.pendingCount,
      pending_keys: [...context.lessonSummary.pendingKeys],
    },
    install_health: context.installHealth ? {
      target: context.installHealth.target,
      passed: context.installHealth.passed,
      errors: context.installHealth.errors,
      warnings: context.installHealth.warnings,
      recommended_command: context.installHealth.recommended_command,
      issue_ids: context.installHealth.issues.map((issue) => issue.id),
    } : null,
    ...(context.contextIndex ? { context_index: context.contextIndex } : {}),
    ...(context.contextIndexTrunk && context.contextIndexTrunk.length > 0 ? { context_index_trunk: context.contextIndexTrunk } : {}),
    ...(context.contextIndexLeaves && context.contextIndexLeaves.length > 0 ? {
      context_index_leaves: context.contextIndexLeaves.map(leaf => ({
        id: leaf.id,
        label: leaf.label,
        summary: leaf.summary.slice(0, 100), // 只保留前100字符作为索引
      })),
    } : {}),
    current_focus: selectCurrentFocus(context.state?.phase || '', context.state?.gate || '', context) || undefined,
    generated_at: new Date().toISOString(),
  };

  return stringify(output, { indent: 2 });
}
