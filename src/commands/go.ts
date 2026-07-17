/**
 * docpath:go — 按 plan.md 逐个执行子任务
 *
 * 读取 .docpath/tasks/current/plan.md，解析子任务列表，
 * 找到下一个未完成的子任务，输出执行上下文供 Claude Code Agent 消费。
 *
 * Level 0-1: 直接输出子任务描述 + 验收条件
 * Level 2+: 输出结构化上下文 (含 breadcrumb 历史 + 依赖图)
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentState, resolveBoundTaskId, writeCurrentState } from '../utils/workspace.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';
import { parsePlanSteps, type PlanStep } from '../utils/doc-parser.js';
import { markPlanStep, type PlanStepStatus } from '../utils/plan-sync.js';
import { runCommand } from './runtime.js';
import { resolveUiDesignRequirement, missingDesignArtifacts, shouldAdviseUiDesignOptIn } from '../utils/ui-gate.js';
import { readActiveStructuredSpecDocument, readActiveTaskFile } from '../utils/task-files.js';
import { acquireExecutionLease, releaseExecutionLease, resolveSessionContext, touchSession } from '../utils/session.js';
import { assertMajorChangeGateReady } from '../utils/major-change.js';
import { emitNextHint } from '../utils/next-hint.js';
import { assertNoNonDocPathChangesForExecutionStart } from '../utils/git-dirty-guard.js';
import { exitWithError } from '../utils/error-helpers.js';
import { assertWorktreeContract } from './worktree.js';
import { resolveEffectiveWorkflowProfile } from '../engine/workflow-profile.js';
import { assertNoDriftLock, refreshAgentSnapshot } from '../hooks/bridge.js';

interface GoOptions {
  cwd: string;
  /** 指定子任务编号 (e.g. S1)，不指定则自动找下一个 */
  step?: string;
  /** 收尾状态；不传时表示进入执行态 */
  status?: 'done' | 'skipped' | 'blocked';
  /** 仅输出上下文，不更新状态 */
  dryRun?: boolean;
  /** agent/session 标识 */
  session?: string;
}

interface GoContext {
  docpathDir: string;
  planPath: string;
  specPath: string;
}

async function resolveGoContext(cwd: string): Promise<GoContext> {
  const docpathDir = await resolveDocpathDir(cwd);
  const tasksDir = join(docpathDir, 'tasks', 'current');
  if (!existsSync(docpathDir)) {
    exitWithError('NO_DOCPATH_DIR');
  }

  return {
    docpathDir,
    planPath: join(tasksDir, 'plan.md'),
    specPath: join(tasksDir, 'spec.md'),
  };
}

async function readSpecFields(specPath: string): Promise<Record<string, string>> {
  const extraFields: Record<string, string> = {};
  if (!existsSync(specPath)) return extraFields;

  const specContent = await readFile(specPath, 'utf-8');
  const idMatch = specContent.match(/^#\s+(T-\S+)/m);
  if (idMatch) {
    extraFields.task_id = idMatch[1];
  }
  const titleMatch = specContent.match(/^#\s+T-\S+\s*[-—:]\s*(.+)/m);
  if (titleMatch) {
    extraFields.task_title = titleMatch[1].trim();
  }
  return extraFields;
}

async function readPlanSteps(docpathDir: string, taskId: string | undefined): Promise<PlanStep[]> {
  const planContent = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
  if (!planContent.trim()) {
    exitWithError('MISSING_PLAN');
  }

  const tasks = parsePlanSteps(planContent);
  if (tasks.length === 0) {
    exitWithError('MISSING_PLAN', {
      detail: 'plan.md 中未找到子任务。格式须为 `### S1: 名称` 或 `- [ ] 任务`'
    });
  }
  return tasks;
}

function selectTargetStep(
  tasks: PlanStep[],
  step: string | undefined,
  status: GoOptions['status'],
  currentStep?: string,
): PlanStep | undefined {
  const normalizedStep = step?.trim();
  const implicitStep = status ? currentStep : undefined;
  return normalizedStep
    ? tasks.find(t => t.id.toLowerCase() === normalizedStep.toLowerCase())
    : implicitStep
      ? tasks.find(t => t.id.toLowerCase() === implicitStep.toLowerCase())
      : tasks.find(t => !t.done);
}

async function renderExecutionContext(cwd: string, tasks: PlanStep[], target: PlanStep, level: number): Promise<void> {
  // Level 0-1: 简单输出
  // Level 2+: 结构化上下文 + breadcrumb 历史
  console.log('\n🚀  执行子任务\n');
  console.log(`📌  子任务: ${target.id} — ${target.name}`);
  console.log(`📋  描述: ${target.description}`);
  console.log(`✅  验收: ${target.acceptance}`);
  console.log(`🔗  依赖: ${target.dependencies}`);
  console.log(`📊  当前级别: Level ${level}\n`);

  if (level >= 2) {
    // 输出 breadcrumb 历史摘要
    const breadcrumb = await readBreadcrumb(cwd);
    if (breadcrumb.entries.length > 0) {
      console.log('─── 执行历史 ───');
      for (const entry of breadcrumb.entries.slice(-5)) {
        const emoji = entry.status === 'done' ? '✅' : entry.status === 'in_progress' ? '🔄' : '🚫';
        console.log(`  ${emoji} ${entry.step}: ${entry.context}`);
      }
      console.log('');
    }

    // 输出剩余任务概览
    const remaining = tasks.filter(t => !t.done);
    console.log(`─── 进度: ${tasks.length - remaining.length}/${tasks.length} 完成 ───`);
    for (const t of tasks) {
      const mark = t.done ? '✅' : t.id === target.id ? '👉' : '⬜';
      console.log(`  ${mark} ${t.id}: ${t.name}`);
    }
    console.log('');
  }
}

async function finalizeStep(
  cwd: string,
  target: PlanStep,
  status: NonNullable<GoOptions['status']>,
  taskId: string,
  sessionId: string,
): Promise<void> {
  await runCommand({
    cwd,
    action: 'end',
    step: target.id,
    status,
    note: `go-status: ${target.id} -> ${status}`,
    session: sessionId,
    releaseLease: false,
  });

  const syncStatus: PlanStepStatus = status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'blocked';
  const sync = await markPlanStep(cwd, target.id, syncStatus);
  if (!sync.updated) {
    console.warn(`⚠️  plan checklist 未同步: ${sync.reason}`);
  }
  await refreshAgentSnapshot(cwd);
  await releaseExecutionLease(cwd, {
    sessionId,
    taskId,
    step: target.id,
    command: 'go status',
  });

  console.log(`✅  已记录步骤状态: ${target.id} -> ${status}`);
  await emitNextHint(cwd);
}

async function startStep(
  cwd: string,
  target: PlanStep,
  taskId: string,
  extraFields: Record<string, string>,
  sessionId: string,
): Promise<void> {
  await acquireExecutionLease(cwd, {
    sessionId,
    taskId,
    step: target.id,
    command: 'go start',
  });

  await writeBreadcrumb(cwd, {
    taskId,
    step: target.id,
    status: 'in_progress',
    context: `开始执行: ${target.name}`,
    sessionId,
  });

  // 更新 current.md：phase 表示工作流阶段，current_step 表示正在执行的子任务
  await transitionWorkflow(cwd, 'step.started', {
    currentStep: target.id,
    taskId: extraFields.task_id,
    taskTitle: extraFields.task_title,
  });

  console.log('─── Claude Code 指令 ───');
  console.log('请执行子任务 ' + target.id + '，完成后运行 `docpath agent step --step ' + target.id + ' --status done` 记录完成，再用 `docpath next --agent` 查看后续路由。');
  console.log('💡 提示：开始执行任务。请在开发中随时在 spec.md 中补充 decision_brief，确保决策被即时固化。');
  await emitNextHint(cwd);
}

export async function goCommand(options: GoOptions): Promise<void> {
  const { cwd, step, status, dryRun } = options;
  await assertWorktreeContract(cwd);
  const session = resolveSessionContext(options.session);
  const { docpathDir, specPath } = await resolveGoContext(cwd);
  const extraFields = await readSpecFields(specPath);
  let current = await readCurrentState(cwd);
  if (current?.phase === 'completed') {
    throw new Error(
      `docpath go: 当前任务已处于 completed 状态，无法使用 go 推进或修改子任务。\n` +
      `    如果是新工作，请运行 docpath next --agent 或 docpath backlog promote <id> 推进新任务。`
    );
  }
  const tasks = await readPlanSteps(docpathDir, current?.task_id);
  const target = selectTargetStep(tasks, step, status, current?.current_step);
  if (!target) {
    if (tasks.every(t => t.done)) {
      console.log('🎉  所有子任务已完成！运行 `docpath:check` 进行质量检查。\n');
      return;
    }
    const normalizedStep = step?.trim();
    const implicitStep = status ? current?.current_step : undefined;
    console.error(`❌  未找到子任务: ${normalizedStep || implicitStep || '(自动选择失败)'}`);
    process.exit(1);
  }

  if (dryRun) {
    await renderExecutionContext(cwd, tasks, target, current?.level || 0);
    console.log('📝  [dry-run] 仅预览，不更新状态\n');
    return;
  }

  // 硬门禁：执行/收尾前必须有已绑定的 task_id。
  // 缺失时 fail-loud，而不是静默兜底成 unknown/runtime —— 否则会在「无任务」
  // 状态下跑完整个生命周期，导致 state.json 与代码漂移（详见 breadcrumb 漂移根因）。
  // 与 agent step/done 共用 resolveBoundTaskId，保证「已绑定」的判定标准一致。
  const resolvedTaskId = await resolveBoundTaskId(cwd);
  if (!resolvedTaskId) {
    console.error('❌  无法解析 task_id：当前没有已绑定的任务。');
    console.error('    go 不会在「无任务」状态下推进，以免 state.json 与代码漂移。');
    console.error('    请先创建任务：`docpath brainstorm` / `docpath refine` / `docpath write-spec`，');
    console.error('    确保 .docpath/tasks/current/spec.md 存在且首行为 `# T-<date>-<slug> - <标题>`，再运行 `docpath plan` 与 `docpath go`。');
    process.exit(1);
  }
  await assertNoDriftLock(cwd, 'docpath go');
  let structuredSpec: Awaited<ReturnType<typeof readActiveStructuredSpecDocument>> = null;
  if (!status) {
    structuredSpec = await readActiveStructuredSpecDocument(docpathDir, resolvedTaskId);
  }
  if (!status && current) {
    const profileResolution = resolveEffectiveWorkflowProfile({
      profile: current.workflow_profile,
      level: current.level,
      majorChangeRequired: structuredSpec?.major_change_gate?.required,
      majorChangeTypes: structuredSpec?.major_change_gate?.types,
      uiGateRequired: structuredSpec?.ui_gate?.state === 'required',
    });
    if (profileResolution.upgraded) {
      console.log(`⚠️  已自动将工作流 Profile 从 "${profileResolution.storedProfile}" 升级为 "${profileResolution.effectiveProfile}"`);
      profileResolution.reasons.forEach((reason) => console.log(`   - ${reason}`));
      current = {
        ...current,
        workflow_profile: profileResolution.effectiveProfile,
        level: Math.max(current.level, 2),
        updated_at: new Date().toISOString(),
      };
      await writeCurrentState(cwd, current);
    }
  }
  await assertMajorChangeGateReady(cwd, docpathDir, resolvedTaskId, 'go');
  if (!status) {
    assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
      taskId: resolvedTaskId,
      backlogId: current?.backlog_id ?? structuredSpec?.backlog_id,
      step: target.id,
    });
  }
  const uiRequirement = !status ? await resolveUiDesignRequirement(cwd) : 'exempt';
  const uiOptInAdvisory = !status && uiRequirement !== 'required'
    ? await shouldAdviseUiDesignOptIn(cwd)
    : false;
  if (uiOptInAdvisory) {
    console.log('⚠️  检测到 UI/前端相关描述，但未显式开启 UI 设计流程；go 将继续执行。');
    console.log('    如需设计审批，请先在 spec 的 UI 设计门禁中显式勾选 required；写入 ui-brief/design-approval 只是证据，不会单独开启门禁。');
  }
  await renderExecutionContext(cwd, tasks, target, current?.level || 0);
  await touchSession(cwd, {
    sessionId: session.sessionId,
    taskId: resolvedTaskId,
    step: target.id,
    command: status ? 'go status' : 'go start',
  });

  if (status) {
    await finalizeStep(cwd, target, status, resolvedTaskId, session.sessionId);
    return;
  }

  if (uiRequirement === 'required') {
    const gap = await missingDesignArtifacts(cwd);
    if (gap.missing.length > 0) {
      console.error('❌  UI 设计门禁未通过：本任务涉及产品 UI 实现，但缺少已批准的设计产物。');
      console.error(`    缺失: ${gap.missing.join(', ')}`);
      console.error('    go 不会在设计批准前进入 UI 实现，以免实现先于设计方案确认。');
      console.error('    请先补齐并获得批准：');
      console.error('      docpath write-design --kind brief --template    # 初始化高密度 ui-brief.md 蓝图');
      console.error('      docpath write-design --kind brief --stdin       # 写入确认后的 ui-brief.md');
      console.error('      docpath write-design --kind approval --stdin    # design-approval.md (frontmatter 须含 approval.state: approved)');
      console.error('    若本任务实际不涉及产品 UI，请在 spec.md 的「UI 设计门禁」勾选「不涉及产品 UI 实现」。');
      process.exit(1);
    }
  }

  await startStep(cwd, target, resolvedTaskId, extraFields, session.sessionId);
}
