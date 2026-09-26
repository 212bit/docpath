import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transitionWorkflow } from '../engine/transitions.js';
import { evaluateTaskRisk, riskPolicyFromConfig, riskTierName } from '../engine/risk.js';
import { assertQuickScope } from '../engine/quick-guard.js';
import { readRiskPolicyConfig } from '../utils/config.js';
import { resolveDocpathDir } from '../utils/file.js';
import { clearCurrentTaskAlias, currentTaskDir, canonicalTaskDir, writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState, mutateCurrentState } from '../utils/workspace.js';
import { emitNextHint } from '../engine/next-hint.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { doneCommand } from './done.js';
import { endStepExecution } from './runtime.js';

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
  /** 原地升级：将当前活跃的 quick 任务就地升级为 standard 标准流程（不触发 worktree，保留未提交代码） */
  upgrade?: boolean;
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

export async function upgradeQuickToStandard(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readCurrentState(cwd);
  if (!current || !current.task_id || (current.phase === 'idle' || current.phase === 'completed')) {
    throw new Error('docpath quick upgrade: 当前没有活跃的任务');
  }

  const taskId = current.task_id;
  const title = current.task_title || taskId;
  const taskDir = canonicalTaskDir(docpathDir, taskId);

  // 1. 升级 spec 为 standard 格式
  const specPath = join(taskDir, 'spec.md');
  const existingRequirements: string[] = [];
  if (existsSync(specPath)) {
    try {
      const oldSpec = await readFile(specPath, 'utf-8');
      for (const line of oldSpec.split('\n')) {
        const match = line.match(/^- \[ \] FR-\d+:(.*)/);
        if (match) existingRequirements.push(match[1].trim());
      }
    } catch {}
  }
  const reqLines = existingRequirements.length > 0
    ? existingRequirements.map((r, i) => `- [ ] FR-${i + 1}: ${r}`).join('\n')
    : `- [ ] FR-1: ${title}`;

  const standardSpec = [
    `# ${taskId} - ${title}`,
    '',
    '> workflow_profile: standard',
    '> source: docpath quick upgrade',
    '',
    '## 1. 背景与动机',
    '',
    `来自 quick 任务原地升级为 standard 流程: ${title}`,
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    reqLines,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持架构与现有工作流一致性',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${title}`,
    '',
    '### 不包含',
    '- 无关的非范围需求',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 原地升级为 standard | standard | 通过 | 改动规模或风险超出 quick 限制，就地升级保留已交付代码 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    '- [x] 否',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 代码修改完成并全量通过 check 与 review 门禁',
    '',
  ].join('\n');

  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', standardSpec);

  // 2. 补齐并自动闭环单步执行计划（S1 done）
  const singleStepPlan = [
    '## 执行计划',
    '',
    `### S1: 实现并验证 ${title}`,
    `- **描述**: 完成 ${title}（quick 升级 standard 压缩计划）。`,
    '- **验收条件**: 代码实现就绪并通过质量门禁与审查',
    '- **依赖**: 无',
    '',
    '## Checklist',
    '- [x] S1',
    '',
    '## 依赖关系图',
    'S1',
    '',
  ].join('\n');

  await writeActiveTaskFile(docpathDir, taskId, 'plan.md', singleStepPlan);
  await endStepExecution({
    cwd,
    step: 'S1',
    status: 'done',
    note: 'quick 升级 standard 自动闭环执行计划',
  });

  // 3. 更新 state.json 中的 profile 为 standard
  await mutateCurrentState(cwd, (state) => {
    if (!state) {
      throw new Error('docpath quick upgrade: 当前没有活跃的任务');
    }
    return {
      ...state,
      workflow_profile: 'standard',
      level: Math.max(state.level ?? 1, 1),
    };
  });

  console.log(`🚀  任务 ${taskId} 已就地升级为 standard 标准流程！`);
  console.log('   - workflow_profile: standard');
  console.log('   - spec.md & spec.json 已同步标准真源');
  console.log('   - plan.md 已生成并闭环 S1 完成证据');
  console.log('   - 下一步: 运行 docpath done 走 standard 门禁完成收口\n');
  await emitNextHint(cwd);
}

export async function quickCommand(options: QuickOptions): Promise<void> {
  const { cwd } = options;
  if (options.upgrade || options.title === 'upgrade') {
    await upgradeQuickToStandard(cwd);
    return;
  }

  const title = options.title?.trim();
  if (!title) throw new Error('docpath quick requires <title>');

  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    throw new Error('未找到 .docpath/ 目录。请先运行 `docpath init`');
  }

  const current = await readCurrentState(cwd);
  if (current && current.phase !== 'idle' && current.phase !== 'completed') {
    throw new Error(`docpath quick: 当前已有活跃任务（phase=${current.phase}），请先 done 或 task reset；如需将当前 quick 升级为 standard，请运行 docpath quick upgrade`);
  }

  const CORE_RISKY_TITLE_KEYWORDS = [
    'core', 'lifecycle', 'protocol', 'engine', 'check', 'gate',
    '调度', '生命周期', '协议', '架构', '迁移', 'migration',
    'harness', 'permission', '权限', 'worktree',
  ];
  const lowerTitle = title.toLowerCase();
  const hitKeywords = CORE_RISKY_TITLE_KEYWORDS.filter(k => lowerTitle.includes(k));
  if (hitKeywords.length > 0) {
    console.log(`⚠️  前置提示: 任务标题命中核心/高危关键词 [${hitKeywords.join(', ')}]。`);
    console.log('   Quick 模式仅适用于 < 50 行且不触碰核心生命周期/架构/协议的局部小改动。');
    console.log('   若开发过程中涉及核心文件修改，可随时运行 `docpath quick upgrade` 原地升级为 standard 标准流程。\n');
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
