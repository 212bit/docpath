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
import { readCurrentMd, resolveBoundTaskId } from '../utils/workspace.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';
import { parsePlanSteps, type PlanStep } from '../utils/doc-parser.js';
import { markPlanStep, type PlanStepStatus } from '../utils/plan-sync.js';
import { runCommand } from './runtime.js';
import { resolveUiDesignRequirement, missingDesignArtifacts } from '../utils/ui-gate.js';

interface GoOptions {
  cwd: string;
  /** 指定子任务编号 (e.g. S1)，不指定则自动找下一个 */
  step?: string;
  /** 收尾状态；不传时表示进入执行态 */
  status?: 'done' | 'skipped' | 'blocked';
  /** 仅输出上下文，不更新状态 */
  dryRun?: boolean;
}

interface GoContext {
  docpathDir: string;
  planPath: string;
  specPath: string;
}

// ── Verification Gate: 防止跳过 check 直接标记完成 ──

async function verifyBeforeCompletion(cwd: string, docpathDir: string): Promise<{ allowed: boolean; reason: string }> {
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (!existsSync(statePath)) return { allowed: true, reason: '无 state.json' };

  const state = JSON.parse(await readFile(statePath, 'utf-8'));

  // 如果上次 check 是 fail，阻止完成
  if (state.state === 'check_fail') {
    return { allowed: false, reason: '上次 check 失败，请先修复并重新运行 docpath check' };
  }

  // 检查 last-check.md 是否存在且是 pass
  const lastCheckPath = join(docpathDir, 'workspace', 'last-check.md');
  if (existsSync(lastCheckPath)) {
    const checkContent = await readFile(lastCheckPath, 'utf-8');
    if (checkContent.includes('❌ FAIL')) {
      return { allowed: false, reason: 'last-check.md 记录了失败项，请先修复' };
    }
  }

  return { allowed: true, reason: 'check_pass' };
}

async function resolveGoContext(cwd: string): Promise<GoContext> {
  const docpathDir = await resolveDocpathDir(cwd);
  const tasksDir = join(docpathDir, 'tasks', 'current');
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
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

async function readPlanSteps(planPath: string): Promise<PlanStep[]> {
  if (!existsSync(planPath)) {
    console.error('❌  未找到 plan.md。请先运行 `docpath:plan` 生成计划。');
    process.exit(1);
  }

  const planContent = await readFile(planPath, 'utf-8');
  const tasks = parsePlanSteps(planContent);
  if (tasks.length === 0) {
    console.error('❌  plan.md 中未找到子任务。格式须为 `### S1: 名称` 或 `- [ ] 任务`');
    process.exit(1);
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

async function finalizeStep(cwd: string, target: PlanStep, status: NonNullable<GoOptions['status']>): Promise<void> {
  await runCommand({
    cwd,
    action: 'end',
    step: target.id,
    status,
    note: `go-status: ${target.id} -> ${status}`,
  });

  const syncStatus: PlanStepStatus = status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'blocked';
  const sync = await markPlanStep(cwd, target.id, syncStatus);
  if (!sync.updated) {
    console.warn(`⚠️  plan checklist 未同步: ${sync.reason}`);
  }

  console.log(`✅  已记录步骤状态: ${target.id} -> ${status}`);
  console.log('💡  下一步可运行 `docpath next --agent` 或 `docpath go` 继续推进。\n');
}

async function startStep(
  cwd: string,
  target: PlanStep,
  taskId: string | undefined,
  extraFields: Record<string, string>,
): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId: taskId || 'unknown',
    step: target.id,
    status: 'in_progress',
    context: `开始执行: ${target.name}`,
  });

  // 更新 current.md：phase 表示工作流阶段，current_step 表示正在执行的子任务
  await transitionWorkflow(cwd, 'step.started', {
    currentStep: target.id,
    taskId: extraFields.task_id,
    taskTitle: extraFields.task_title,
  });

  console.log('─── Claude Code 指令 ───');
  console.log('请执行子任务 ' + target.id + '，完成后运行 `docpath:agent step --step ' + target.id + ' --auto-next` 自动标记完成并加载下一个任务。');

  console.log('');
}

export async function goCommand(options: GoOptions): Promise<void> {
  const { cwd, step, status, dryRun } = options;
  const { planPath, specPath } = await resolveGoContext(cwd);
  const extraFields = await readSpecFields(specPath);
  const tasks = await readPlanSteps(planPath);
  const current = await readCurrentMd(cwd);
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

  await renderExecutionContext(cwd, tasks, target, current?.level || 0);
  if (dryRun) {
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

  if (status) {
    await finalizeStep(cwd, target, status);
    return;
  }

  // 硬门禁 A：UI 任务进入执行前必须有 design-preview + 已批准 design-approval。
  // 判定优先级：spec 4.1 显式框 > 关键词回退（resolveUiDesignRequirement）。
  // - required + 缺产物 → fail-loud，绝不让 UI 实现先于设计批准开始
  // - exempt / unknown(未命中关键词) → 放行
  // 不设绕过 flag：合法的「无需设计」走 spec「不涉及产品 UI」框，留痕可审计。
  // 与 check 阶段共用 ui-gate.ts，保证 go 前置门禁与 check 门禁判定一致。
  const uiRequirement = await resolveUiDesignRequirement(cwd);
  if (uiRequirement === 'required') {
    const gap = await missingDesignArtifacts(cwd);
    if (gap.missing.length > 0) {
      console.error('❌  UI 设计门禁未通过：本任务涉及产品 UI 实现，但缺少已批准的设计产物。');
      console.error(`    缺失: ${gap.missing.join(', ')}`);
      console.error('    go 不会在设计批准前进入 UI 实现，以免实现先于设计方案确认。');
      console.error('    请先补齐并获得批准：');
      console.error('      docpath write-design --kind preview --stdin     # 布局/信息架构/状态/响应式/边界');
      console.error('      docpath write-design --kind approval --stdin    # frontmatter 须含 approval.state: approved');
      console.error('    若本任务实际不涉及产品 UI，请在 spec.md 的「## 4.1 ... UI 设计门禁」勾选「不涉及产品 UI 实现」。');
      process.exit(1);
    }
  }

  await startStep(cwd, target, current?.task_id, extraFields);
}
