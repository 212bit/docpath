/**
 * docpath step-pass — 复合生命周期命令（R-340）
 *
 * 一次调用完成「当前步骤收尾 + 下一步启动」：等价于
 * `docpath agent step --status done` 后接 `docpath go`（自动选择下一个
 * 未完成步骤），把 Agent 每步两次工具往返压缩为一次。
 *
 * 不削弱任何门禁：收尾复用 endStepExecution 单一原语，推进复用 goCommand
 * 的全部前置检查（worktree 契约、漂移锁、重大变更门禁、dirty guard）。
 */

import { join } from 'path';
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
import { runStepTargetedVerification, renderStepVerifyFeedback } from '../engine/step-verify.js';

export interface StepPassOptions {
  cwd: string;
  /** 要收尾的步骤；缺省取 state.current_step */
  step?: string;
  note?: string;
  session?: string;
  /** 一键收尾所有待完成的步骤 */
  all?: boolean;
  /** 透传给内部 go 的首等恢复旗标（同 `go --accept-dirty`） */
  acceptDirty?: string;
  /** 显式指定要随做随验的单测文件路径 */
  test?: string;
  /** 是否跳过单步即时测试验证 */
  skipVerify?: boolean;
  /** 是否在单测失败时阻断步骤收尾 */
  strictVerify?: boolean;
  /** 所有步骤完成后直接进入收口门禁序列 */
  done?: boolean;
  /** 收口门禁通过后直接提交到本地 Git */
  commit?: boolean;
}

/**
 * normalizeStoredState 会把空 current_step 渲染为占位符（workspace.ts），
 * step-pass 需要把它还原为「无进行中步骤」才能给出正确的引导错误。
 */
const STEP_PLACEHOLDER = '待确认下一步';

function normalizeStep(raw: string | undefined): string {
  const value = raw?.trim() || '';
  return value === STEP_PLACEHOLDER ? '' : value;
}

export async function stepPassCommand(options: StepPassOptions): Promise<void> {
  const { cwd } = options;
  const current = await readCurrentState(cwd);
  if (current?.phase === 'completed') {
    throw new Error(
      'docpath step-pass: 当前任务已处于 completed 状态，无法推进步骤。\n' +
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
      console.log('🎉  所有计划步骤均已处于完成状态！');
      console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
      await emitNextHint(cwd);
      return;
    }
    for (const item of pending) {
      const sync = await endStepExecution({
        cwd,
        step: item.id,
        status: 'done',
        note: options.note || `step-pass --all: ${item.id}`,
        session: session.sessionId,
      });
      if (!sync.planSynced) {
        console.warn(`⚠️  plan checklist 未同步: ${sync.planSyncReason}`);
      }
      console.log(`✅  step-pass: ${item.id} 已完成`);
    }
    console.log('\n🎉  所有计划步骤均已完成！');
    if (options.done || options.commit) {
      console.log('🚀  --done / --commit 已启用，直接进入复合收口门禁序列...\n');
      const { doneCommand } = await import('./done.js');
      await doneCommand({
        cwd,
        commit: options.commit,
        note: options.note,
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

  // 默认值防御：check.failed 等转移会把错误文本写进 current_step（历史缺陷面），
  // 缺省收尾必须能在 plan 中对应到真实步骤，否则 phantom 事件会污染 breadcrumb。
  if (!explicitStep && step && planSteps && !planSteps.some((t) => t.id.toLowerCase() === step.toLowerCase())) {
    const pending = planSteps.filter((t) => !t.done).map((t) => t.id);
    if (pending.length === 0) {
      if (options.done || options.commit) {
        console.log('🚀  所有计划步骤已完成且 --commit 已启用，直接进入复合收口门禁序列...\n');
        const { doneCommand } = await import('./done.js');
        await doneCommand({
          cwd,
          commit: options.commit,
          note: options.note,
          session: options.session,
        });
        return;
      }
      console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
      await emitNextHint(cwd);
      return;
    }
    if (pending.length === 1 && current?.phase === 'executing') {
      step = pending[0];
      console.log(`🩹  step-pass: 检测到 current_step 异常 ("${currentStep}")，自动自愈对齐唯一待完成步骤 -> ${step}`);
    } else {
      throw new Error(
        `docpath step-pass: current_step "${step}" 不是 plan 中的有效步骤（可能被状态污染）。\n` +
        `    待完成步骤: ${pending.join(', ')}。请先用 \`docpath go --step ${pending[0]}\` 领取，或显式传入 \`--step <id>\`。`,
      );
    }
  }
  if (!step) {
    const pending = planSteps ? planSteps.filter((t) => !t.done).map((t) => t.id) : [];
    if (pending.length === 1 && current?.phase === 'executing') {
      step = pending[0];
      console.log(`🩹  step-pass: 自动对齐唯一待完成步骤 -> ${step}`);
    } else {
      throw new Error(
        'docpath step-pass: 没有进行中的步骤可收尾。\n' +
        '    请先用 `docpath go --step <id>` 领取步骤，或显式传入 `--step <id>` 补账。',
      );
    }
  }
  if (explicitStep && currentStep && explicitStep !== currentStep) {
    console.warn(`⚠️  step-pass: 指定步骤 ${explicitStep} 与当前执行步骤 ${currentStep} 不一致，按指定值收尾。`);
    step = explicitStep;
  }

  if (!options.skipVerify) {
    const verifyResult = await runStepTargetedVerification(cwd, {
      step,
      explicitTest: options.test,
      strictVerify: options.strictVerify,
      taskId,
    });
    if (verifyResult.executed) {
      const feedback = renderStepVerifyFeedback(verifyResult);
      if (feedback) {
        console.log(feedback);
      }
      if (!verifyResult.passed && options.strictVerify) {
        throw new Error(
          `docpath step-pass: 单步即时单测验证未通过 (${verifyResult.targetTests.join(', ')})，步骤收尾被阻断。\n` +
          '    请先修复单测或使用 --skip-verify 跳过验证。',
        );
      }
    }
  }

  // ── 执行 pre-step 生命周期 Hook ──
  try {
    const { executeLifecycleHook } = await import('../engine/hook-runner.js');
    const preReport = await executeLifecycleHook(cwd, 'pre-step', { taskId, step, note: options.note });
    if (!preReport.passed) {
      const failed = preReport.results.find((r) => !r.passed && r.fail_fast);
      if (failed) {
        throw new Error(`docpath step-pass: Hook (pre-step: ${failed.name}) 执行失败:\n${failed.output || failed.error}`);
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith('docpath step-pass: Hook')) throw err;
  }

  const sync = await endStepExecution({
    cwd,
    step,
    status: 'done',
    note: options.note || `step-pass: ${step}`,
    session: session.sessionId,
  });
  if (!sync.planSynced) {
    console.warn(`⚠️  plan checklist 未同步: ${sync.planSyncReason}`);
  }
  console.log(`✅  step-pass: ${step} 已完成`);

  // ── 执行 post-step 生命周期 Hook ──
  try {
    const { executeLifecycleHook } = await import('../engine/hook-runner.js');
    await executeLifecycleHook(cwd, 'post-step', { taskId, step, note: options.note });
  } catch {
    // fail-safe
  }

  // ── 步骤前静默自动格式化自愈 ──
  try {
    const { performSilentAutoFormat } = await import('../utils/auto-format.js');
    performSilentAutoFormat(cwd);
  } catch {
    // 格式化容错
  }

  // 判断是否还有后续步骤：有则交给 go 原子领取并渲染执行上下文；
  // 全部完成则给出收口路线（quick-done 一键收口）。无 plan 时保持保守路线，交给 go。
  const stepsAfter = await loadPlanSteps(cwd, taskId);
  const remaining = stepsAfter ? stepsAfter.filter((t) => !t.done).map((t) => t.id) : null;

  // 写入步骤交接 WIP 快照
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const { writeFileAtomic } = await import('../utils/file.js');
    const wipPath = join(docpathDir, 'workspace', 'wip-note.md');
    const nextStepId = remaining && remaining.length > 0 ? remaining[0] : 'done';
    const wipContent = [
      '# WIP Note',
      '',
      '> source: step-pass',
      `> task_id: ${taskId}`,
      `> step: ${step}`,
      `> completed_step: ${step}`,
      `> next_step: ${nextStepId}`,
      `> updated_at: ${new Date().toISOString()}`,
      '',
      `- Completed Step: ${step}`,
      `- Next Step: ${nextStepId}`,
      '- Status: step verified and recorded in breadcrumb. 可随时新开会话并运行 `docpath next --agent` 无缝继续。',
      '- Next agent: run `docpath next --agent` or proceed to next step.',
      '',
    ].join('\n');
    await writeFileAtomic(wipPath, wipContent);
  } catch (err) {
    // 容错
  }

  // ── S3: 单步 arch 守卫（仅在 Level >= 2 标准任务且非终步时触发）──
  if ((current?.level ?? 2) >= 2 && remaining && remaining.length > 0) {
    try {
      const { checkArchitectureLayers } = await import('../engine/arch-guard.js');
      const archResult = await checkArchitectureLayers(cwd);
      if (!archResult.passed) {
        console.warn(`\n⚠️  [架构守卫] 步骤 ${step} 引入了架构违规 (${archResult.violations.length} 项)，请注意排查：\n` + archResult.violations.map(i => `   - ${i.message}`).join('\n'));
      }
    } catch {
      // 容错防崩
    }
  }

  if (remaining && remaining.length === 0) {
    console.log('\n🎉  所有计划步骤均已完成！');
    if (options.done || options.commit) {
      console.log('🚀  --done / --commit 已启用，直接进入复合收口门禁序列...\n');
      const { doneCommand } = await import('./done.js');
      await doneCommand({
        cwd,
        commit: options.commit,
        note: options.note,
        session: options.session,
      });
      return;
    }
    // R-363：收口路线按实际 changed files 做 scope 判定——改动命中 quick-guard
    // RISKY_PATH_PATTERNS 时不推荐 quick-done（它在 done 阶段必拒）。
    console.log(renderCloseoutRoute(resolveCloseoutRoute(cwd)));
    await emitNextHint(cwd);
    return;
  }

  if (remaining && remaining.length > 0 && (options.commit || options.done)) {
    console.log(`ℹ️  检测到后续仍有 ${remaining.length} 个未完成步骤，--commit / --done 将在终步收口时原子触发。`);
  }

  console.log(`⏭️  自动推进下一步${remaining ? `（剩余 ${remaining.length} 步）` : ''}`);
  await goCommand({ cwd, session: options.session, acceptDirty: options.acceptDirty });
}

async function loadPlanSteps(cwd: string, taskId: string) {
  const docpathDir = await resolveDocpathDir(cwd);
  const planContent = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
  if (!planContent.trim()) {
    // 无 plan 时返回空数组：守卫不生效，剩余判断走 go 的 MISSING_PLAN / 自动生成路线。
    return null;
  }
  try {
    return parsePlanSteps(planContent);
  } catch {
    return null;
  }
}
