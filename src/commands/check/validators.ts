import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { checkCommandEnv, runCheck, DEFAULT_CHECK_TIMEOUT_MS } from './runners.js';
import { readCurrentState, syncCurrentDocument, parsePlanTasks } from '../../utils/workspace.js';
import { validatePlanContent, validateSpecContent } from '../../utils/doc-parser.js';
import { detectActiveTaskFileDrift, detectActiveTaskIdentityDrift, formatPhantomMissingFiles, formatTaskIdentityDrift, readActiveTaskFile, syncActiveTaskFiles } from '../../utils/task-files.js';
import { validateDeliverables } from '../../utils/deliverables.js';
import { validateLifecycleDeliverables } from '../../utils/lifecycle.js';
import { resolveUiDesignRequirement, approvalState, hasUiImplementationIntent, shouldAdviseUiDesignOptIn } from '../../utils/ui-gate.js';
import { resolveMajorChangeGateStatus } from '../../utils/major-change.js';
import { readAgentFlow } from '../../utils/config.js';
import { detectPlanBreadcrumbDrift } from '../../utils/plan-sync.js';
import { readBreadcrumb } from '../../engine/breadcrumb.js';
import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  documentIndexStats,
  isProjectDocumentIndexStale,
  readProjectDocumentIndex,
} from '../../utils/document-index.js';
import { resolveRulePaths, type RuleName } from '../../utils/rules.js';
import { gitSyncOptional } from '../../utils/git-run.js';
import { readFile, stat } from 'fs/promises';
import { select, isCancel } from '@clack/prompts';
import { refreshProjectDocumentIndex } from '../docs.js';
import { diagnoseDocumentHealth } from '../../utils/docs-doctor.js';
import type { CheckOptions, CheckResult, TaskPlanProgress } from './types.js';
import {
  formatValidationFailure,
  formatTaskFileDrift,
  formatSyncedTaskFiles,
  warningResult,
  contextFailureResult,
} from './formatters.js';

export async function promptTaskFileDriftFix(): Promise<'canonical' | 'current' | 'merge' | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;

  const choice = await select({
    message: '检测到 active task 文件漂移，选择修复方式',
    options: [
      { value: 'canonical', label: '使用任务目录覆盖 current' },
      { value: 'merge', label: '尝试三方合并 (3-way merge)' },
      { value: 'current', label: '使用 current 回写任务目录' },
      { value: 'skip', label: '暂不修复，仅报告失败' },
    ],
  });

  if (isCancel(choice) || choice === 'skip') return undefined;
  return choice as 'canonical' | 'current' | 'merge' | undefined;
}

export async function checkMajorDecisionGate(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const state = await readCurrentState(cwd);
  if ((state?.level || 0) < 2) return [];
  const agentFlow = await readAgentFlow(cwd);
  const gate = await resolveMajorChangeGateStatus(cwd, docpathDir, state?.task_id, agentFlow);
  if (gate.signals.length === 0) return [];

  // R-334: agent_flow 下工作流内部路径信号降级为咨询 — check 黄不红
  if (gate.downgraded) {
    return [{
      name: '重大决策确认检查',
      passed: true,
      output: gate.output,
      category: 'plan',
      severity: 'warning',
    }];
  }

  let passed = gate.confirmed;
  let output = gate.output;

  const isTty = process.stdin.isTTY && process.stdout.isTTY;
  if (!passed && isTty && !options.nonInteractive) {
    const choice = await select({
      message: '检测到重大变更，是否立即批准并继续？',
      options: [
        { value: 'approve_cli', label: '是，通过 CLI 确认 (Approved by user in CLI)' },
        { value: 'approve_review', label: '是，确认已完成设计评审 (Confirmed after design review)' },
        { value: 'custom', label: '手打输入其他审批原因...' },
        { value: 'skip', label: '否，不批准（中断检查）' },
      ],
    });

    if (choice && choice !== 'skip' && !isCancel(choice)) {
      let reason = 'Approved by user in CLI';
      if (choice === 'approve_review') {
        reason = 'Confirmed after design review';
      } else if (choice === 'custom') {
        const { text } = await import('@clack/prompts');
        const typed = await text({
          message: '请输入审批原因:',
          placeholder: '例如: Confirmed with team',
        });
        if (typed && typeof typed === 'string' && typed.trim() && !isCancel(typed)) {
          reason = typed.trim();
        } else {
          reason = '';
        }
      }

      if (reason) {
        // S3 阶段回写逻辑预留: 我们将在 S3 步骤中实现具体的回写函数 writeMajorChangeConfirmation
        const { writeMajorChangeConfirmation } = await import('./evidence.js');
        try {
          await writeMajorChangeConfirmation(docpathDir, state?.task_id, reason);
          passed = true;
          output = `已通过交互式 CLI 批准重大变更: ${reason}`;
          console.log(`\n✅  重大变更确认成功！已自动写入规约档案: "${reason}"\n`);
        } catch (e) {
          output = `自动回写规约失败: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }
  }

  return [{
    name: '重大决策确认检查',
    passed,
    output,
    category: 'plan',
  }];
}

export function isTerminalVerificationTask(task: { id: string; title: string; done: boolean }): boolean {
  return /验证门禁|质量门禁|check\/review\/journal|docpath check\/review\/journal/i.test(task.title);
}

/**
 * R-334: 已认领但未完成的计划步骤 —— 最新 breadcrumb 状态为 in_progress/blocked 的步骤。
 * 与 plan.md 的 checklist 无关（checklist 只区分 done/pending），breadcrumb 记录"被启动过"。
 */
export async function claimedPlanStepIds(
  cwd: string,
  planTasks: Array<{ id: string; title: string; done: boolean }>,
): Promise<string[]> {
  const breadcrumb = await readBreadcrumb(cwd);
  const ids = new Set(planTasks.map((task) => task.id));
  // 最新状态优先：同一 step 可能先 in_progress 后 done，只取最后一条。
  const latest = new Map<string, string>();
  for (const entry of breadcrumb.entries) {
    if (!ids.has(entry.step)) continue;
    if (entry.status === 'done') {
      latest.set(entry.step, 'done');
    } else if (!latest.has(entry.step)) {
      latest.set(entry.step, entry.status);
    }
  }
  return Array.from(latest.entries())
    .filter(([, status]) => status === 'in_progress' || status === 'blocked')
    .map(([step]) => step)
    .sort();
}

export function effectivePlanProgress(planTasks: Array<{ id: string; title: string; done: boolean }>): {
  doneCount: number;
  totalCount: number;
  waivedTerminalVerification: string[];
} {
  const unfinished = planTasks.filter((task) => !task.done);
  const firstUnfinishedIndex = planTasks.findIndex((task) => !task.done);
  const canWaiveTerminalVerification =
    unfinished.length > 0 &&
    firstUnfinishedIndex >= 0 &&
    firstUnfinishedIndex === planTasks.length - unfinished.length &&
    unfinished.every(isTerminalVerificationTask);
  const waivedTerminalVerification = canWaiveTerminalVerification ? unfinished.map((task) => task.id) : [];
  return {
    doneCount: planTasks.filter((task) => task.done).length + waivedTerminalVerification.length,
    totalCount: planTasks.length,
    waivedTerminalVerification,
  };
}

/**
 * 只读的身份类门禁判定（R-305 入口阶段 2.5）。
 *
 * 只覆盖「不可自愈」的身份失败：spec/plan 声明的 task_id 与 state 不一致，
 * 以及 current/canonical 全缺的幽灵任务。这两类无论编译/测试跑多久都注定
 * 失败，且不会被后续同步逻辑治愈 —— 因此在昂贵的 runner 之前 fail-loud，
 * 避免为注定失败的 check 付全量套件成本。
 *
 * 可自愈的 missing-current / content-mismatch 走三方合并或交互式 prompt
 * （有写副作用与人工介入），不属于本函数范围，保持原位执行。
 *
 * 纯只读：可安全地在 runner 之前调用。
 */
export async function detectFatalTaskIdentityResults(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  if ((workflowState?.level || 0) < 2 || !workflowState?.task_id) return [];
  if (workflowState.phase === 'idle' || workflowState.phase === 'completed') return [];

  const identityDrifts = await detectActiveTaskIdentityDrift(docpathDir, workflowState.task_id);
  if (identityDrifts.length > 0) {
    return [{
      name: '任务身份一致性检查',
      passed: false,
      output: formatTaskIdentityDrift(identityDrifts),
      category: 'plan',
    }];
  }

  const drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);
  const phantomDrifts = drifts.filter((drift) => drift.reason === 'phantom-task');
  if (phantomDrifts.length > 0) {
    return [{
      name: '任务身份一致性检查',
      passed: false,
      output: [
        'PHANTOM TASK DRIFT DETECTED:',
        `  state.task_id: ${workflowState.task_id}`,
        `  phase: ${workflowState.phase}`,
        `  ${formatPhantomMissingFiles(phantomDrifts)}`,
        '  常见成因: 任务在另一分支完成并归档，但本地 gitignored 的 state.json 仍停在该任务。',
        '修复建议（需明确用户意图，不要用 agent step 机械修复）:',
        '  - 若该任务已在别处完成/归档: docpath task abort 清理陈旧状态，回到 idle。',
        '  - 若需在本 checkout 继续: 从 git/归档恢复 canonical 任务目录后再同步。',
        '  - 若这其实是新需求: capture/promote 新 backlog 绑定新 task_id。',
      ].join('\n'),
      category: 'plan',
    }];
  }

  return [];
}

export async function checkTaskFileDrift(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  if ((workflowState?.level || 0) < 2 || !workflowState?.task_id) return [];
  if (workflowState.phase === 'idle' || workflowState.phase === 'completed') return [];

  // 不可自愈的身份失败已在入口阶段 2.5 提前 fail-loud；此处回放同一判定，
  // 保证 --only-harness 等绕过前置的路径输出不丢失（单一真源，无重复分支）。
  const fatalIdentity = await detectFatalTaskIdentityResults(cwd, docpathDir);
  if (fatalIdentity.length > 0) return fatalIdentity;

  let drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);

  let driftOutput = drifts.length === 0 ? 'current 与 canonical 任务文件一致' : formatTaskFileDrift(drifts);
  const fixSource = drifts.length > 0
    ? options.fixDrift ?? await promptTaskFileDriftFix()
    : undefined;
  if (drifts.length > 0 && fixSource) {
    if (fixSource === 'merge') {
      const { writeActiveTaskFile } = await import('../../utils/task-files.js');
      const { tryThreeWayMerge } = await import('../../utils/structured-heal.js');
      const { syncCurrentDocument } = await import('../../utils/workspace.js');
      let hasConflict = false;
      const mergedFiles: string[] = [];
      const conflictFiles: string[] = [];

      for (const drift of drifts) {
        if (drift.reason === 'content-mismatch') {
          const res = await tryThreeWayMerge(drift.currentPath, drift.canonicalPath, drift.file);
          // 写入合并后的内容（不论是否有冲突，均写入，以便用户或 Agent 处理冲突标记）
          await writeActiveTaskFile(docpathDir, workflowState.task_id, drift.file, res.mergedContent);
          if (res.conflict) {
            hasConflict = true;
            conflictFiles.push(drift.file);
          } else {
            mergedFiles.push(drift.file);
          }
        }
      }

      await syncCurrentDocument(cwd);
      drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);

      if (hasConflict) {
        return [{
          name: '任务文件 current/canonical 漂移检查',
          passed: false,
          output: `三方合并已执行但存在冲突，冲突文件: ${conflictFiles.join(', ')}\n请手工解决冲突标记 (<<<<<<<) 并重新运行 check。`,
          category: 'plan',
        }];
      } else {
        const mode = options.fixDrift ? '自动' : '交互式';
        console.log(`🔧  已通过${mode}三方合并同步 active task 文件: ${mergedFiles.join(', ')}`);
        driftOutput = drifts.length === 0
          ? `已成功通过三方合并同步: ${mergedFiles.join(', ')}`
          : `三方合并已完成部分，仍有漂移: ${formatTaskFileDrift(drifts)}`;
      }
    } else {
      const synced = await syncActiveTaskFiles(docpathDir, workflowState.task_id, fixSource);
      await syncCurrentDocument(cwd);
      const mode = options.fixDrift ? '自动同步' : '交互式同步';
      console.log(`🔧  已${mode} active task 文件 (${fixSource}): ${synced.map((item) => item.file).join(', ')}`);
      drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);
      driftOutput = drifts.length === 0
        ? formatSyncedTaskFiles(synced)
        : `${formatSyncedTaskFiles(synced)}\n${formatTaskFileDrift(drifts)}`;
    }
  }

  return [{
    name: '任务文件 current/canonical 漂移检查',
    passed: drifts.length === 0,
    output: driftOutput,
    category: 'plan',
  }];
}

export async function validateTaskDocuments(cwd: string, docpathDir: string, options: CheckOptions): Promise<{ results: CheckResult[]; progress: TaskPlanProgress }> {
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const workflowState = await readCurrentState(cwd);
  const shouldValidateTaskDocs = (workflowState?.level || 0) >= 2;
  const results: CheckResult[] = [];
  const progress: TaskPlanProgress = { planDoneCount: 0, planTotalCount: 0 };

  if (shouldValidateTaskDocs && existsSync(specPath)) {
    const specContent = await readActiveTaskFile(docpathDir, workflowState?.task_id, 'spec.md');
    const validation = validateSpecContent(specContent);
    results.push({
      name: 'spec.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${specPath}` : formatValidationFailure(specPath, validation.issues),
      category: 'plan',
    });
  }

  results.push(...await checkMajorDecisionGate(cwd, docpathDir, options));

  const planContent = await readActiveTaskFile(docpathDir, workflowState?.task_id, 'plan.md');
  if (!planContent.trim()) return { results, progress };

  if (shouldValidateTaskDocs) {
    const validation = validatePlanContent(planContent);
    results.push({
      name: 'plan.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${planPath}` : formatValidationFailure(planPath, validation.issues),
      category: 'plan',
    });
  }

  const planTasks = parsePlanTasks(planContent);
  const effectiveProgress = effectivePlanProgress(planTasks);
  progress.planDoneCount = effectiveProgress.doneCount;
  progress.planTotalCount = effectiveProgress.totalCount;
  if (progress.planTotalCount > 0) {
    // R-334: agent_flow 下完成度改认领语义——已认领步骤全部 done 即绿（防跳步保留），
    // 未认领步骤不阻塞中间 check；agent done/closeout 仍强制 100%，见 done 命令。
    const agentFlow = await readAgentFlow(cwd);
    let passed = progress.planDoneCount === progress.planTotalCount;
    let output = passed
      ? effectiveProgress.waivedTerminalVerification.length > 0
        ? `terminal verification step 由 check/review/journal 生命周期门禁覆盖: ${effectiveProgress.waivedTerminalVerification.join(', ')}`
        : '所有子任务已完成'
      : `还有 ${progress.planTotalCount - progress.planDoneCount} 个子任务未完成`;
    if (!passed && agentFlow) {
      const claimedUnfinished = await claimedPlanStepIds(cwd, planTasks);
      const state = await readCurrentState(cwd);
      const isExecuting = state?.phase === 'executing';
      if (claimedUnfinished.length === 0 && progress.planDoneCount > 0) {
        passed = true;
        output = `agent_flow: 已认领子任务全部完成 (${progress.planDoneCount}/${progress.planTotalCount})，未认领步骤不阻塞中间 check`;
      } else if (claimedUnfinished.length > 0) {
        const breadcrumb = await readBreadcrumb(cwd);
        const hasBlocked = breadcrumb.entries.some(e => claimedUnfinished.includes(e.step) && e.status === 'blocked');
        if (isExecuting && !hasBlocked) {
          passed = true;
          output = `开发执行中: 子任务 ${claimedUnfinished.join(', ')} 正在执行，代码/编译/测试质量门禁通过 (${progress.planDoneCount}/${progress.planTotalCount})`;
        } else {
          output = `还有已认领但未完成的子任务: ${claimedUnfinished.join(', ')}`;
        }
      }
    }
    results.push({
      name: `子任务完成度 (${progress.planDoneCount}/${progress.planTotalCount})`,
      passed,
      output,
      category: 'plan',
      ...(agentFlow && passed && progress.planDoneCount < progress.planTotalCount ? { severity: 'warning' as const } : {}),
    });
  }

  return { results, progress };
}

export async function syncCurrentChecklistView(cwd: string): Promise<CheckResult[]> {
  await syncCurrentDocument(cwd);
  return [];
}

export function productUiChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.split('\n')
      .map((line) => line.trim().slice(3).trim())
      .filter(Boolean)
      .filter((file) => {
        if (/^(templates|\.codex|\.docpath)\//.test(file)) return false;
        return /\.(tsx|jsx|css|scss)$/.test(file);
      });
  } catch {
    return [];
  }
}

export async function checkUiUxDesignGate(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  const taskId = workflowState?.task_id;
  const title = `${workflowState?.task_title || ''} ${taskId || ''}`;

  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const analysisPath = join(docpathDir, 'tasks', 'current', 'analysis.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const haystack = [title];
  if (existsSync(specPath)) haystack.push(await readActiveTaskFile(docpathDir, taskId, 'spec.md'));
  if (existsSync(planPath)) haystack.push(await readActiveTaskFile(docpathDir, taskId, 'plan.md'));
  for (const file of [analysisPath]) {
    if (existsSync(file)) {
      try { haystack.push(await readFile(file, 'utf-8')); } catch { /* ignore */ }
    }
  }

  const text = haystack.join('\n');
  const requirement = await resolveUiDesignRequirement(cwd);
  if (requirement !== 'required') {
    if (!await shouldAdviseUiDesignOptIn(cwd)) return [];
    return [{
      name: 'UI/UX Design Opt-in Advisory',
      passed: true,
      severity: 'warning',
      output: '检测到 UI/前端相关描述，但未显式开启 UI 设计流程；check 不会要求 UI/UX 设计证据包。如需设计审批，请先在 spec 中将 UI 设计门禁显式标记为 required。',
      category: 'analysis',
    }];
  }

  const uiBriefPath = join(docpathDir, 'tasks', 'current', 'ui-brief.md');
  const approvalPath = join(docpathDir, 'tasks', 'current', 'design-approval.md');
  const results: CheckResult[] = [];

  const changedUiFiles = productUiChangedFiles(cwd);
  const approvalRequired = hasUiImplementationIntent(text) || changedUiFiles.length > 0;
  if (!approvalRequired) return results;

  const approvalMissing: string[] = [];
  const approvalWeak: string[] = [];
  if (!existsSync(uiBriefPath)) approvalMissing.push('ui-brief.md');
  else {
    const brief = (await readFile(uiBriefPath, 'utf-8')).trim();
    for (const signal of ['Screen Contract', 'Flow Contract', 'Layout Contract', 'Component Contract', 'State Contract', 'Visual Contract', 'Generation Contract', 'Acceptance Contract']) {
      if (!brief.includes(signal)) approvalWeak.push(`ui-brief.md 缺少 ${signal}`);
    }
  }

  if (!existsSync(approvalPath)) approvalMissing.push('design-approval.md');
  else {
    const approval = (await readFile(approvalPath, 'utf-8')).trim();
    const state = approvalState(approval);
    if (state !== 'approved') approvalWeak.push(`design-approval.md 状态不是 approved（当前: ${state}）`);
    if (!/approved[_ -]?at|批准时间|Approved at/i.test(approval)) approvalWeak.push('design-approval.md 缺少批准时间');
    if (!/source|批准来源|Approval source/i.test(approval)) approvalWeak.push('design-approval.md 缺少批准来源');
  }

  const approvalPassed = approvalMissing.length === 0 && approvalWeak.length === 0;
  results.push({
    name: 'UI/UX Design Approval Gate',
    passed: approvalPassed,
    output: approvalPassed
      ? 'UI/UX 实现已具备 ui-brief 与 approved design-approval'
      : [
          changedUiFiles.length ? `检测到产品 UI 改动: ${changedUiFiles.slice(0, 8).join(', ')}${changedUiFiles.length > 8 ? ` ... +${changedUiFiles.length - 8}` : ''}` : '',
          hasUiImplementationIntent(text) ? '检测到 plan 或 spec 中包含 UI implementation / 实现意图' : '',
          approvalMissing.length ? `缺少文件: ${approvalMissing.join(', ')}` : '',
          ...approvalWeak,
          '修复建议:',
          '  - 先运行: docpath write-design --kind brief --template',
          '  - 补全高密度 UI 蓝图后运行: docpath write-design --kind brief --stdin',
          '  - 用户确认具体 UI 蓝图后运行: docpath write-design --kind approval --stdin',
          '  - design-approval.md frontmatter 必须包含 approval.state: approved',
          '  - 用户同意采用流程不等于批准具体设计方案。',
        ].filter(Boolean).join('\n'),
    category: 'analysis',
  });

  return results;
}

export async function checkPlanBreadcrumbDrift(cwd: string): Promise<CheckResult[]> {
  const drift = await detectPlanBreadcrumbDrift(cwd);
  if (drift.planDoneWithoutBreadcrumb.length === 0 && drift.breadcrumbDoneWithoutPlan.length === 0) return [];

  const driftLines = [
    'DRIFT DETECTED:',
    ...drift.planDoneWithoutBreadcrumb.map((step) =>
      `  [plan-done-no-breadcrumb] ${step} marked done in plan.md but no breadcrumb evidence`,
    ),
    ...drift.breadcrumbDoneWithoutPlan.map((step) =>
      `  [breadcrumb-done-no-plan] ${step} done in breadcrumb but plan.md still unchecked`,
    ),
    '修复建议:',
    ...drift.planDoneWithoutBreadcrumb.map((step) =>
      `  - 若步骤尚未真正完成，运行: docpath go --step ${step}`,
    ),
    ...drift.breadcrumbDoneWithoutPlan.map((step) =>
      `  - 若步骤已完成但 plan 未同步，运行: docpath agent step --step ${step} --status done`,
    ),
  ];

  return [{
    name: 'Plan/Breadcrumb 漂移检查',
    passed: false,
    output: driftLines.join('\n'),
    category: 'plan',
  }];
}

export async function checkDeliverablesIndex(cwd: string): Promise<CheckResult[]> {
  const issues = await validateDeliverables(cwd);
  const lifecycleIssues = await validateLifecycleDeliverables(cwd);
  const lifecycleErrors = lifecycleIssues.filter((issue) => issue.severity === 'error');
  const lifecycleWarnings = lifecycleIssues.filter((issue) => issue.severity === 'warning');
  const results: CheckResult[] = [];
  if (issues.length > 0) {
    results.push({
      name: 'Deliverables 必填章节校验',
      passed: false,
      output: [
        '以下 deliverables 缺少必填章节:',
        ...issues.map((issue) => `  - ${issue.path} (${issue.template}): ${issue.missing_sections.join(', ')}`),
      ].join('\n'),
      category: 'plan',
    });
  }
  if (lifecycleErrors.length > 0) {
    results.push({
      name: 'Lifecycle deliverables 校验',
      passed: false,
      output: [
        '以下 lifecycle deliverables 缺失或不完整:',
        ...lifecycleErrors.map((issue) => `  - ${issue.path} (${issue.stage_id}): ${issue.message}`),
      ].join('\n'),
      category: 'plan',
    });
  }
  if (lifecycleWarnings.length > 0) {
    results.push(warningResult(
      'Lifecycle sources 声明提醒',
      [
        '以下 regulated lifecycle 阶段尚未声明 sources（默认不阻断）:',
        ...lifecycleWarnings.map((issue) => `  - ${issue.path} (${issue.stage_id}): ${issue.message}`),
      ].join('\n'),
    ));
  }
  return results;
}

export async function checkContextIndexHealth(docpathDir: string, currentTaskId: string | undefined): Promise<CheckResult[]> {
  const indexPath = join(docpathDir, 'docs-index.json');
  if (!existsSync(indexPath)) {
    return [warningResult(
      'docs-index 缺失',
      '未找到 .docpath/docs-index.json。修复建议: 运行 `docpath docs scan` 生成索引，避免 Agent 回退为全量文档搜索。',
    )];
  }

  try {
    const index = await readProjectDocumentIndex(docpathDir, currentTaskId);
    if (!index) {
      return [warningResult('docs-index 缺失', '未找到可读取的 docs-index。修复建议: 运行 `docpath docs scan`。')];
    }

    const stats = documentIndexStats(index.entries, { currentTaskId });
    const results: CheckResult[] = [{
      name: '上下文预算估算',
      passed: true,
      output: `default_read 估算: ~${stats.defaultReadTokens} / ${DEFAULT_CONTEXT_TOKEN_BUDGET} tokens；索引总量: ${stats.total} docs / ~${stats.estimatedTokens} tokens`,
      category: 'context',
    }];

    if (stats.defaultReadTokens > DEFAULT_CONTEXT_TOKEN_BUDGET) {
      results.push(warningResult(
        '默认上下文预算超限',
        [
          `default_read 估算 ~${stats.defaultReadTokens} tokens，超过 MVP 预算 ${DEFAULT_CONTEXT_TOKEN_BUDGET}。`,
          '修复建议:',
          '  - 运行 `docpath docs scan` 刷新索引字段',
          '  - 将归档、模板、大日志标记为 default_read=false',
          '  - 将规则沉淀到 .docpath/rules/* 并清理低信号经验',
        ].join('\n'),
      ));
    }

    if (await isProjectDocumentIndexStale(docpathDir, index.entries, currentTaskId)) {
      try {
        const refreshed = await refreshProjectDocumentIndex(docpathDir);
        results.push({
          name: 'docs-index 已自动刷新',
          passed: true,
          output: `检测到 docs-index 陈旧，已自动运行索引刷新（${refreshed.entries.length} docs）。`,
          category: 'context',
        });
      } catch (refreshError) {
        results.push(warningResult(
          'docs-index 可能陈旧',
          `检测到 .docpath 下存在比 docs-index 更新的 Markdown，但自动刷新失败。修复建议: 运行 \`docpath docs scan\`。\n${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
        ));
      }
    }

    return results;
  } catch (err) {
    return [contextFailureResult(
      'docs-index 结构损坏',
      `无法解析 .docpath/docs-index.json。修复建议: 运行 \`docpath docs scan\` 重新生成。\n${err instanceof Error ? err.message : String(err)}`,
    )];
  }
}

export async function checkCurrentTaskContextFiles(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const activeState = await readCurrentState(cwd);
  const hasActiveTask = Boolean(activeState?.task_id)
    && activeState?.phase !== 'idle'
    && activeState?.phase !== 'completed';
  if (!hasActiveTask) {
    return [{
      name: '当前任务上下文文件完整性',
      passed: true,
      output: '无活跃任务（idle/completed），跳过当前任务上下文文件检查',
      category: 'context',
    }];
  }

  const currentDir = join(docpathDir, 'tasks', 'current');
  const hasSpec = existsSync(join(currentDir, 'spec.md')) || existsSync(join(currentDir, 'spec.json'));
  const hasPlan = existsSync(join(currentDir, 'plan.md')) || existsSync(join(currentDir, 'plan.json'));

  if (hasSpec && hasPlan) {
    return [{
      name: '当前任务上下文文件完整性',
      passed: true,
      output: 'tasks/current spec 与 plan 均存在（支持 Markdown 与 JSON 真源）',
      category: 'context',
    }];
  }

  const workflowState = await readCurrentState(cwd);
  const archivedDir = workflowState?.task_id ? join(docpathDir, 'tasks', 'done', workflowState.task_id) : null;
  const archivedHasSpec = archivedDir && (existsSync(join(archivedDir, 'spec.md')) || existsSync(join(archivedDir, 'spec.json')));
  const archivedHasPlan = archivedDir && (existsSync(join(archivedDir, 'plan.md')) || existsSync(join(archivedDir, 'plan.json')));
  if (workflowState?.phase === 'completed' && workflowState.gate === 'review_pass' && archivedHasSpec && archivedHasPlan) {
    return [{
      name: '当前任务上下文文件完整性',
      passed: true,
      output: `任务已归档，使用 tasks/done/${workflowState.task_id} spec 与 plan 作为完成态上下文`,
      category: 'context',
    }];
  }

  const missing: string[] = [];
  if (!hasSpec) missing.push(join(currentDir, 'spec.md (或 spec.json)'));
  if (!hasPlan) missing.push(join(currentDir, 'plan.md (或 plan.json)'));

  return [contextFailureResult(
    '当前任务上下文文件缺失',
    [
      '缺少当前任务必要文件:',
      ...missing.map((path) => `  - ${path}`),
      '修复建议: 回到 drafting/planning 阶段补齐 spec/plan，或运行 active task file 同步命令修复漂移。',
    ].join('\n'),
  )];
}

export async function checkRuleTruthSources(docpathDir: string): Promise<CheckResult[]> {
  const paths = resolveRulePaths(docpathDir);
  const results: CheckResult[] = [];

  for (const rule of paths.allRules) {
    const name = rule.name;
    const preferredPath = join(paths.rulesDir, `${name}.md`);
    const legacyPath = join(paths.legacySpecDir, `${name}.md`);
    const hasPreferred = existsSync(preferredPath);
    const hasLegacy = existsSync(legacyPath);
    if (!hasPreferred && !hasLegacy) continue;

    if (hasPreferred && hasLegacy) {
      const [preferredContent, legacyContent, preferredStat, legacyStat] = await Promise.all([
        readFile(preferredPath, 'utf-8').catch(() => ''),
        readFile(legacyPath, 'utf-8').catch(() => ''),
        stat(preferredPath).catch(() => null),
        stat(legacyPath).catch(() => null),
      ]);

      if (!preferredContent.trim() && legacyContent.trim()) {
        results.push(contextFailureResult(
          `规则真源冲突: ${name}`,
          `.docpath/rules/${name}.md 为空但 legacy .docpath/spec/${name}.md 仍有内容。修复建议: 迁移高信号规则到 .docpath/rules/${name}.md，legacy 只作兼容回退。`,
        ));
        continue;
      }

      if (preferredStat && legacyStat && legacyStat.mtimeMs > preferredStat.mtimeMs + 1000) {
        results.push(contextFailureResult(
          `规则真源冲突: ${name}`,
          `.docpath/spec/${name}.md 比 preferred .docpath/rules/${name}.md 更新，存在双真源风险。修复建议: 将有效变更迁移到 .docpath/rules/${name}.md，避免继续写 legacy 规则。`,
        ));
        continue;
      }
    }

    if (hasPreferred) {
      const content = await readFile(preferredPath, 'utf-8').catch(() => '');
      const lines = content.split('\n').length;
      if (lines > 200) {
        results.push({
          name: `规则预算预警: ${name}`,
          passed: true,
          output: `⚠️ .docpath/rules/${name}.md 已达 ${lines} 行（建议运行 docpath learn groom 精炼）`,
          category: 'context',
        });
        continue;
      }
    }

    results.push({
      name: `规则真源: ${name}`,
      passed: true,
      output: `.docpath/rules/${name}.md 为 preferred${hasLegacy ? '；legacy .docpath/spec 仅作兼容回退' : ''}`,
      category: 'context',
    });
  }

  return results;
}

function shouldCheckProjectStandards(cwd: string, _docpathDir: string): boolean {
  return [
    join(cwd, 'docs', 'requirements.md'),
    join(cwd, 'requirements.md'),
  ].some((path) => existsSync(path));
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

function normalizeDisplayPath(cwd: string, fullPath: string): string {
  return fullPath.startsWith(`${cwd}/`) ? fullPath.slice(cwd.length + 1) : fullPath;
}

function standardsArtifactCandidates(cwd: string, docpathDir: string): Record<string, string[]> {
  return {
    'requirements.md': [
      join(cwd, 'docs', 'requirements.md'),
      join(cwd, 'requirements.md'),
      join(docpathDir, 'requirements.md'),
    ],
    'architecture.md': [
      join(docpathDir, 'rules', 'architecture.md'),
      join(cwd, 'docs', 'architecture.md'),
      join(cwd, 'architecture.md'),
      join(docpathDir, 'project-architecture.md'),
    ],
  };
}

function draftSignals(content: string): string[] {
  const head = content.split('\n').slice(0, 120).join('\n');
  const signals: Array<[RegExp, string]> = [
    [/雏形|草稿|讨论稿|待重写|待补.*重写|prototype|draft|inferred/i, 'contains draft/prototype/inferred marker'],
    [/实际为.*但|误将|误判|不准确/i, 'contains stale-domain correction marker'],
  ];
  return signals
    .filter(([pattern]) => pattern.test(head))
    .map(([, label]) => label);
}

function artifactSpecificIssues(name: string, content: string): string[] {
  const issues: string[] = [];
  if (name === 'requirements.md' && !/已拍板|拍板状态|approved|approval|confirmed|user_confirmed/i.test(content)) {
    issues.push('requirements approval status not found');
  }
  if (name === 'architecture.md' && !/ADR|架构决策|模块|module|依赖|dependency/i.test(content)) {
    issues.push('architecture decision/module boundary content not found');
  }
  return issues;
}

export async function checkProjectStandardsPackage(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  if (!shouldCheckProjectStandards(cwd, docpathDir)) return [];

  const candidates = standardsArtifactCandidates(cwd, docpathDir);
  const missing: string[] = [];
  const weak: string[] = [];
  const found: string[] = [];

  for (const [name, paths] of Object.entries(candidates)) {
    const path = firstExistingPath(paths);
    if (!path) {
      missing.push(`${name} (${paths.map((candidate) => normalizeDisplayPath(cwd, candidate)).join(' | ')})`);
      continue;
    }

    found.push(`${name}: ${normalizeDisplayPath(cwd, path)}`);
    const content = await readFile(path, 'utf-8').catch(() => '');
    const issues = [
      ...draftSignals(content),
      ...artifactSpecificIssues(name, content),
    ];
    if (issues.length > 0) {
      weak.push(`${name}: ${normalizeDisplayPath(cwd, path)} — ${Array.from(new Set(issues)).join('; ')}`);
    }
  }

  const passed = missing.length === 0 && weak.length === 0;
  return [{
    name: 'Project standards package gate',
    passed,
    output: passed
      ? [
          'Required project standards are present and frozen:',
          ...found.map((item) => `  - ${item}`),
          'Optional artifacts remain complexity-based: open-questions.md, decisions/*.md, style.md.',
          'No phase-backlog.md document is required; backlog quality belongs to structured backlog items.',
        ].join('\n')
      : [
          'Project-intake development requires a frozen minimal standards package.',
          missing.length ? 'Missing required artifacts:' : '',
          ...missing.map((item) => `  - ${item}`),
          weak.length ? 'Artifacts that still look draft/unapproved:' : '',
          ...weak.map((item) => `  - ${item}`),
          'Required minimum: requirements.md and architecture.md.',
          'Optional by complexity only: open-questions.md, decisions/*.md, style.md.',
          'Do not rely on standalone checklist/handoff documents for gates; machine-enforced gates belong in DocPath checks.',
          'Do not proceed from inferred architecture or draft standards.',
        ].filter(Boolean).join('\n'),
    category: 'analysis',
  }];
}

const LIVING_DOC_CHECK_MAPPINGS: Array<{ pattern: RegExp; doc: string; title: string }> = [
  { pattern: /(?:src|tests)\/.*worktree/i, doc: 'docs/features/worktree-workflow.md', title: 'Worktree 并行机制' },
  { pattern: /(?:src|tests)\/.*(?:agent|context-injection|token-budget)/i, doc: 'docs/design/agent-integration.md', title: 'Agent 集成与上下文协议' },
  { pattern: /(?:src|tests)\/.*(?:session)/i, doc: 'docs/design/session-isolation-mvp.md', title: 'Session 隔离机制' },
  { pattern: /(?:src|tests)\/.*(?:error-codes|error-helpers)/i, doc: 'docs/error-codes.md', title: '错误码字典' },
  { pattern: /(?:src|tests)\/.*(?:transitions|policy|workflow-profile)/i, doc: 'docs/design/state-machine-correctness-analysis.md', title: '状态机与门禁策略' },
  { pattern: /(?:src|tests)\/.*(?:breadcrumb)/i, doc: 'docs/architecture/breadcrumb-task-level-architecture.md', title: 'Breadcrumb 架构' },
  { pattern: /(?:src|tests)\/.*(?:learn|lesson-candidates)/i, doc: 'docs/features/knowledge-accumulation.md', title: '经验沉淀与学习流' },
];

export async function checkLivingDocsHealth(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const projectRoot = dirname(resolve(docpathDir));
  const docsReadmePath = join(projectRoot, 'docs', 'README.md');
  if (!existsSync(docsReadmePath)) return [];

  const results: CheckResult[] = [];

  try {
    const report = await diagnoseDocumentHealth(cwd);
    if (!report.healthy) {
      const topIssues = report.issues
        .slice(0, 5)
        .map((i) => `  - [${i.type}] ${i.file}: ${i.message}`)
        .join('\n');
      results.push({
        name: 'Living docs integrity gate',
        passed: false,
        output: `活文档体检发现 ${report.issues.length} 处待治理项（断链/未索引/Backlog异常）:\n${topIssues}\n请运行 docpath docs lint 查看完整明细，或 docpath docs fix 一键自愈。`,
        category: 'context',
        severity: 'warning',
      });
    } else {
      results.push({
        name: 'Living docs integrity gate',
        passed: true,
        output: `活文档生态健康（${report.scannedCount} 篇文档，${report.indexedCount} 篇有效索引，0 处断链）`,
        category: 'context',
      });
    }

    // 检查代码变更与活文档同步
    const gitStatus = gitSyncOptional(cwd, ['status', '--porcelain']);
    if (gitStatus) {
      const lines = gitStatus.split('\n').filter(Boolean);
      const hasDocChanges = lines.some((l) => /\s+docs\//.test(l));
      if (!hasDocChanges) {
        const changedFiles = lines
          .map((l) => l.slice(3).trim())
          .filter((f) => /^(?:src|lib|package\.json)/.test(f));

        if (changedFiles.length > 0) {
          const suggestedDocs = new Set<string>();
          for (const file of changedFiles) {
            for (const mapping of LIVING_DOC_CHECK_MAPPINGS) {
              if (mapping.pattern.test(file)) {
                suggestedDocs.add(`- ${mapping.doc} (${mapping.title})`);
              }
            }
          }

          if (suggestedDocs.size > 0) {
            results.push({
              name: 'Living docs sync hint',
              passed: true,
              output: `本次变更修改了核心模块代码，建议确认是否需同步更新活文档:\n${[...suggestedDocs].map((d) => `  ${d}`).join('\n')}`,
              category: 'context',
            });
          }
        }
      }
    }

    return results;
  } catch {
    return results;
  }
}

export async function checkContextHealth(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  if ((workflowState?.level || 0) < 2) return [];
  return [
    ...await checkCurrentTaskContextFiles(cwd, docpathDir),
    ...await checkContextIndexHealth(docpathDir, workflowState?.task_id),
    ...await checkRuleTruthSources(docpathDir),
    ...await checkProjectStandardsPackage(cwd, docpathDir),
    ...await checkLivingDocsHealth(cwd, docpathDir),
  ];
}

export async function runTaskDocumentChecks(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const driftResults = await checkTaskFileDrift(cwd, docpathDir, options);
  results.push(...driftResults);
  if (driftResults.some((result) => !result.passed)) return results;
  const { results: documentResults } = await validateTaskDocuments(cwd, docpathDir, options);
  results.push(...documentResults);
  results.push(...await checkUiUxDesignGate(cwd, docpathDir));
  results.push(...await syncCurrentChecklistView(cwd));
  results.push(...await checkPlanBreadcrumbDrift(cwd));
  results.push(...await checkDeliverablesIndex(cwd));
  results.push(...await checkContextHealth(cwd, docpathDir));
  return results;
}
