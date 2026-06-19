import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transitionWorkflow } from '../engine/transitions.js';
import { resolveDocpathDir } from '../utils/file.js';
import { clearCurrentTaskAlias, currentTaskDir, canonicalTaskDir, writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState, writeCurrentState } from '../utils/workspace.js';
import { emitNextHint } from '../utils/next-hint.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';

interface QuickOptions {
  cwd: string;
  title: string;
  /** 即时档：跳 check(build/test)，仅 typecheck + 结构门禁；跳 review。比 quick 更轻。 */
  instant?: boolean;
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
    '- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）',
    '- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）',
    '',
    '### Decision Brief',
    '- 当前问题: Tiny task governance should be proportional.',
    '- 推荐方案: Use quick profile, require check, skip full review by profile.',
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

function renderQuickEvidence(taskId: string, title: string, profile: 'quick' | 'instant'): string {
  const instant = profile === 'instant';
  return [
    `# ${instant ? 'Instant' : 'Quick'} Task: ${taskId}`,
    '',
    `- title: ${title}`,
    `- workflow_profile: ${profile}`,
    '- created_by: docpath quick',
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
  assertCleanWorktreeForNewTask(cwd, 'docpath quick');

  const taskId = await generateQuickTaskId(docpathDir, title);
  const profile: 'quick' | 'instant' = options.instant ? 'instant' : 'quick';
  await clearCurrentTaskAlias(docpathDir);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', renderQuickSpec(taskId, title, profile));

  await mkdir(canonicalTaskDir(docpathDir, taskId), { recursive: true });
  await mkdir(currentTaskDir(docpathDir), { recursive: true });
  const quickEvidence = renderQuickEvidence(taskId, title, profile);
  await writeFile(join(canonicalTaskDir(docpathDir, taskId), 'quick.md'), quickEvidence, 'utf-8');
  await writeFile(join(currentTaskDir(docpathDir), 'quick.md'), quickEvidence, 'utf-8');

  await transitionWorkflow(cwd, 'task.created', {
    taskId,
    taskTitle: title,
    currentStep: 'quick task created',
  });
  const executing = await transitionWorkflow(cwd, 'step.started', {
    taskId,
    taskTitle: title,
    currentStep: 'quick task active',
  });
  await writeCurrentState(cwd, {
    ...executing,
    level: options.instant ? 0 : 1,
    workflow_profile: options.instant ? 'instant' : 'quick',
    current_step: options.instant ? 'instant task active' : 'quick task active',
    updated_at: new Date().toISOString(),
  });

  console.log(`✅  ${profile} task 已创建: ${taskId}`);
  console.log(`   title: ${title}`);
  console.log(`   profile: ${profile}`);
  if (options.instant) {
    console.log('   gates: lite check (typecheck + 结构门禁,跳 build/test), review skipped');
  } else {
    console.log('   gates: check required, review skipped by quick profile');
  }
  console.log('   下一步: 完成修改后运行 docpath done');
  await emitNextHint(cwd);
}
