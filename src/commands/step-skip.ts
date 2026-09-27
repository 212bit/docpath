/**
 * docpath step-skip — 步骤跳过与承接收口命令
 *
 * 允许 Agent 或开发者显式跳过或标记已被其他任务/提交承接的步骤（Superseded Step）：
 * 1. 同步将 plan.md / plan.json 中的步骤标记为已跳过 (~ 状态)；
 * 2. 在 breadcrumb 中记录带有跳过原因与承接溯源的完备证据，防止 Plan/Breadcrumb 假漂移；
 * 3. 自动推进至下一个未完成步骤，或在全部完成后引导/执行终步收口门禁。
 */

import { readCurrentState, resolveBoundTaskId } from '../utils/workspace.js';
import { resolveSessionContext } from '../utils/session.js';
import { endStepExecution } from './runtime.js';
import { goCommand } from './go.js';
import { emitNextHint } from '../engine/next-hint.js';
import { exitWithError } from '../utils/error-helpers.js';
import { parsePlanSteps } from '../utils/doc-parser.js';
import { readActiveTaskFile } from '../utils/task-files.js';
import { resolveDocpathDir } from '../utils/file.js';
import { renderCloseoutRoute, resolveCloseoutRoute } from '../engine/closeout-route.js';

export interface StepSkipOptions {
  cwd: string;
  /** 要跳过的步骤；缺省取 state.current_step */
  step?: string;
  /** 跳过原因 */
  reason?: string;
  /** 承接该步骤的提交或任务标识（如 bd9605c 或 R-074） */
  supersededBy?: string;
  session?: string;
  /** 一键跳过所有剩余待完成步骤 */
  all?: boolean;
  /** 透传给内部 go 的首等恢复旗标 */
  acceptDirty?: string;
  /** 所有步骤跳过/完成后直接进入收口门禁序列 */
  done?: boolean;
  /** 收口门禁通过后直接提交到本地 Git */
  commit?: boolean;
}

const STEP_PLACEHOLDER = '待确认下一步';

function normalizeStep(raw: string | undefined): string {
  const value = raw?.trim() || '';
  return value === STEP_PLACEHOLDER ? '' : value;
}

function buildSkipNote(options: StepSkipOptions, stepId: string): string {
  const parts: string[] = [];
  if (options.reason) {
    parts.push(options.reason);
  } else {
    parts.push('步骤已跳过/已在其他任务承接');
  }
  if (options.supersededBy) {
    parts.push(`(承接于: ${options.supersededBy})`);
  }
  return `step-skip [${stepId}]: ${parts.join(' ')}`;
}

async function loadPlanSteps(cwd: string, taskId: string) {
  const docpathDir = await resolveDocpathDir(cwd);
  const planContent = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
  if (!planContent.trim()) {
    return null;
  }
  try {
    return parsePlanSteps(planContent);
  } catch {
    return null;
  }
}

export async function stepSkipCommand(options: StepSkipOptions): Promise<void> {
  const { cwd } = options;
  const current = await readCurrentState(cwd);
  if (current?.phase === 'completed') {
    throw new Error(
      'docpath step-skip: 当前任务已处于 completed 状态，无需跳过步骤。\n' +
      '    如果是新工作，请运行 docpath next --agent 或 docpath start <id> 推进新任务。',
    );
  }
  const taskId = await resolveBoundTaskId(cwd);
  if (!taskId) {
    exitWithError('NO_ACTIVE_TASK');
  }

  const session = resolveSessionContext(options.session);

  if (options.all) {
    const planSteps = await loadPlanSteps(cwd, taskId);
    const pending = planSteps?.filter((t) => !t.done) ?? [];
    if (pending.length === 0) {
      console.log('🎉  所有计划步骤均已处于完成/跳过状态！');
      console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
      await emitNextHint(cwd);
      return;
    }
    for (const item of pending) {
      const note = buildSkipNote(options, item.id);
      const sync = await endStepExecution({
        cwd,
        step: item.id,
        status: 'skipped',
        note,
        session: session.sessionId,
      });
      if (!sync.planSynced) {
        console.warn(`⚠️  plan checklist 未同步: ${sync.planSyncReason}`);
      }
      console.log(`⏭️  step-skip: ${item.id} 已跳过 (${note})`);
    }
    console.log('\n🎉  所有计划步骤均已完成/跳过！');
    if (options.done || options.commit) {
      console.log('🚀  --done / --commit 已启用，直接进入复合收口门禁序列...\n');
      const { doneCommand } = await import('./done.js');
      await doneCommand({
        cwd,
        commit: options.commit,
        note: options.reason,
        session: options.session,
      });
      return;
    }
    console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
    await emitNextHint(cwd);
    return;
  }

  const currentStep = normalizeStep(current?.current_step);
  const explicitStep = options.step?.trim();
  const planSteps = await loadPlanSteps(cwd, taskId);
  let step = explicitStep || currentStep || '';

  if (!explicitStep && step && planSteps && !planSteps.some((t) => t.id.toLowerCase() === step.toLowerCase())) {
    const pending = planSteps.filter((t) => !t.done).map((t) => t.id);
    throw new Error(
      `docpath step-skip: current_step "${step}" 不是 plan 中的有效步骤。\n` +
      (pending.length > 0
        ? `    待完成步骤: ${pending.join(', ')}。请指定 \`--step <id>\` 进行跳过。`
        : `    所有计划步骤均已完成，请直接运行 \`${resolveCloseoutRoute(cwd).recommendedCommand}\` 收口。`),
    );
  }
  if (!step) {
    throw new Error(
      'docpath step-skip: 没有指定要跳过的步骤。\n' +
      '    请使用 `docpath step-skip <stepId>` 或 `--step <id>` 指定要跳过的步骤。',
    );
  }
  if (explicitStep && currentStep && explicitStep !== currentStep) {
    step = explicitStep;
  }

  const note = buildSkipNote(options, step);
  const sync = await endStepExecution({
    cwd,
    step,
    status: 'skipped',
    note,
    session: session.sessionId,
  });
  if (!sync.planSynced) {
    console.warn(`⚠️  plan checklist 未同步: ${sync.planSyncReason}`);
  }
  console.log(`⏭️  step-skip: 步骤 ${step} 已跳过 (${note})`);

  const stepsAfter = await loadPlanSteps(cwd, taskId);
  const remaining = stepsAfter ? stepsAfter.filter((t) => !t.done).map((t) => t.id) : null;
  if (remaining && remaining.length === 0) {
    console.log('\n🎉  所有计划步骤均已完成/跳过！');
    if (options.done || options.commit) {
      console.log('🚀  --done / --commit 已启用，直接进入复合收口门禁序列...\n');
      const { doneCommand } = await import('./done.js');
      await doneCommand({
        cwd,
        commit: options.commit,
        note: options.reason,
        session: options.session,
      });
      return;
    }
    console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
    await emitNextHint(cwd);
    return;
  }
  console.log(`⏭️  自动推进下一步${remaining ? `（剩余 ${remaining.length} 步）` : ''}`);
  await goCommand({ cwd, session: options.session, acceptDirty: options.acceptDirty });
}
