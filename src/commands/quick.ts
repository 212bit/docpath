import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transitionWorkflow } from '../engine/transitions.js';
import { evaluateTaskRisk, riskPolicyFromConfig, riskTierName } from '../engine/risk.js';
import { assertQuickScope } from '../engine/quick-guard.js';
import { readRiskPolicyConfig } from '../utils/config.js';
import { resolveDocpathDir } from '../utils/file.js';
import { clearCurrentTaskAlias, currentTaskDir, canonicalTaskDir, writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';
import { emitNextHint } from '../utils/next-hint.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { doneCommand } from './done.js';

export interface QuickOptions {
  cwd: string;
  title: string;
  /** 即时档：跳 check(build/test)，仅 typecheck + 结构门禁；跳 review。比 quick 更轻。 */
  instant?: boolean;
  /** 事后补录：认领当前未提交的微型改动（跳过 clean worktree 拦截） */
  adopt?: boolean;
  /** 一键收口：创建后直接执行 done 门禁 */
  done?: boolean;
  /** 一键收口并提交到 Git */
  commit?: boolean;
}

function slugifyTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || 'quick-task';
}

async function generateQuickTaskId(docpathDir: string, title: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `T-${date}-quick-${slugifyTitle(title)}`;
  const tasksDir = join(docpathDir, 'tasks');
  const entries = existsSync(tasksDir) ? await readdir(tasksDir) : [];
  if (!entries.includes(base)) return base;

  for (let index = 2; index < 100; index++) {
    const candidate = `${base}-${index}`;
    if (!entries.includes(candidate)) return candidate;
  }
  throw new Error(`docpath quick: unable to generate unique task id for ${title}`);
}

function renderQuickSpec(taskId: string, title: string, profile: 'quick' | 'instant'): string {
  return [
    `# ${taskId} - ${title}`,
    '',
    `> workflow_profile: ${profile}`,
    '> source: docpath quick',
    '',
    '## 1. 背景与动机',
    '',
    'Quick task intent record. This task is intentionally lightweight and uses proportional gates.',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    `- [ ] FR-1: ${title}`,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: Keep the change scoped and auditable.',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${title}`,
    '',
    '### 不包含',
    '- Full spec/plan ceremony for standard or strict tasks.',
    '- Architecture, protocol, migration, permission, or broad module changes.',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | Workflow profile | quick / standard | quick | User chose the fast track for a tiny task. |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    '- [x] 否',
    '- [ ] 是，需要用户确认',
    '',
    '### 变更类型',
    '- [ ] 工作流 / Agent 行为',
    '',
    '### UI 设计门禁',
    '- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
    '- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）',
    '',
    '### Decision Brief',
    '- 当前问题: Tiny task governance should be proportional.',
    '- 可选方案:',
    '  - 方案 A: 使用标准任务流程',
    '  - 方案 B: 使用 quick 轻量任务流程',
    '- 推荐方案: 方案 B',
    '- 决策理由: 方案 B 在保证 check 门禁的前提下显著降低了低风险任务的摩擦',
    '- 用户确认: `docpath quick` invocation.',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: The scoped change is completed.',
    '- [ ] AC-2: `docpath check` passes before closeout.',
    '- [ ] AC-3: Review skip is recorded as quick-profile policy evidence.',
    '',
  ].join('\n');
}

function renderQuickEvidence(taskId: string, title: string, profile: 'quick' | 'instant', adopted?: boolean): string {
  const instant = profile === 'instant';
  return [
    `# ${instant ? 'Instant' : 'Quick'} Task: ${taskId}`,
    '',
    `- title: ${title}`,
    `- workflow_profile: ${profile}`,
    '- created_by: docpath quick',
    ...(adopted ? ['- adopted_existing_changes: true'] : []),
    '- gates:',
    instant
      ? '  - check: lite (typecheck + 结构门禁,跳 build/test)'
      : '  - check: required',
    instant
      ? '  - review: skipped by instant profile'
      : '  - review: skipped by quick profile unless escalated',
    '  - journal: minimal',
    '',
    '## Boundaries',
    '',
    'Quick is intended for typo fixes, one-line bugs, comments, and small low-risk adjustments.',
    'Escalate to the standard lifecycle for architecture, protocol, permission, migration, CI/CD, UI workflow, or broad multi-file changes.',
    '',
  ].join('\n');
}

export async function quickCommand(options: QuickOptions): Promise<void> {
  const { cwd } = options;
  const title = options.title?.trim();
  if (!title) throw new Error('docpath quick requires <title>');

  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    throw new Error('未找到 .docpath/ 目录。请先运行 `docpath init`');
  }

  const current = await readCurrentState(cwd);
  if (current && current.phase !== 'idle' && current.phase !== 'completed') {
    throw new Error(`docpath quick: 当前已有活跃任务（phase=${current.phase}），请先 done 或 task reset`);
  }

  if (options.adopt) {
    // 认领模式下校验已有未提交改动是否在 quick 边界内（<=3 个非 DocPath 文件、未触碰核心高危路径）
    assertQuickScope(cwd);
  } else {
    assertCleanWorktreeForNewTask(cwd, 'docpath quick');
  }

  const taskId = await generateQuickTaskId(docpathDir, title);
  const profile: 'quick' | 'instant' = options.instant ? 'instant' : 'quick';
  await clearCurrentTaskAlias(docpathDir);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', renderQuickSpec(taskId, title, profile));

  await mkdir(canonicalTaskDir(docpathDir, taskId), { recursive: true });
  await mkdir(currentTaskDir(docpathDir), { recursive: true });
  const quickEvidence = renderQuickEvidence(taskId, title, profile, options.adopt);
  await writeFile(join(canonicalTaskDir(docpathDir, taskId), 'quick.md'), quickEvidence, 'utf-8');
  await writeFile(join(currentTaskDir(docpathDir), 'quick.md'), quickEvidence, 'utf-8');

  await transitionWorkflow(cwd, 'task.created', {
    taskId,
    taskTitle: title,
    currentStep: 'quick task created',
  });
  // level/profile 直接随 FSM 转移落盘（R-286）：此前是出锁后无锁覆写 patch，
  // 既开竞态窗口，也可能覆盖并发转移的结果。
  // R-338: 创建期风险评估（文本信号：标题），落盘 state.risk_tier；
  // R2+ 的地板会在 check/done 时自动强制 review/journal full，无需在此拒绝。
  const riskPolicy = riskPolicyFromConfig(await readRiskPolicyConfig(cwd));
  const riskVerdict = evaluateTaskRisk({ text: title, policy: riskPolicy });

  await transitionWorkflow(cwd, 'step.started', {
    taskId,
    taskTitle: title,
    currentStep: options.instant ? 'instant task active' : 'quick task active',
    level: options.instant ? 0 : 1,
    workflowProfile: profile,
    riskTier: riskVerdict.tier,
  });

  console.log(`✅  ${profile} task 已创建: ${taskId}`);
  console.log(`   title: ${title}`);
  console.log(`   profile: ${profile}`);
  if (options.adopt) {
    console.log('   📦 已认领当前工作区现有未提交变更（事后补录模式）');
  }
  console.log(`   risk: ${riskTierName(riskVerdict.tier)}${riskVerdict.reasons.length > 0 ? `（${riskVerdict.reasons.join('；')}）` : ''}`);
  if (riskVerdict.tier >= 2) {
    console.log('   ⚠️  风险 R2+：done 时将强制 check + review +完整 journal，quick 快车道不适用');
  }
  if (options.instant) {
    console.log('   gates: lite check (typecheck + 结构门禁,跳 build/test), review skipped');
  } else {
    console.log('   gates: check required, review skipped by quick profile');
  }

  if (options.done || options.commit) {
    console.log('\n🚀  一键收口/提交已启用，执行收尾流程...\n');
    await doneCommand({
      cwd,
      commit: options.commit,
    });
  } else {
    console.log('   下一步: 完成修改后运行 docpath done');
    await emitNextHint(cwd);
  }
}
