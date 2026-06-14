import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

const runResult = (args, cwd) => {
  try {
    return {
      code: 0,
      out: execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (e) {
    return {
      code: e.status || 1,
      out: (e.stdout || '') + '\n' + (e.stderr || ''),
    };
  }
};

function writeDoneBreadcrumb(workspace, taskId, steps) {
  writeFileSync(join(workspace, 'breadcrumb.md'), [
    '# breadcrumb.md',
    '',
    ...steps.flatMap((step, index) => [
      `### ✅ ${step} [${taskId}] — 2026-06-01T00:0${index}:00.000Z`,
      '',
      '---',
      `taskId: ${taskId}`,
      `step: ${step}`,
      'status: done',
      `timestamp: 2026-06-01T00:0${index}:00.000Z`,
      '---',
      '',
      '- **状态**: done',
      '- **上下文**: 已完成',
      '',
    ]),
  ].join('\n'));
}

function writeCanonicalTaskCopy(cwd, taskId, tasks) {
  const canonical = join(cwd, '.docpath', 'tasks', taskId);
  mkdirSync(canonical, { recursive: true });
  for (const file of ['spec.md', 'plan.md']) {
    writeFileSync(join(canonical, file), readFileSync(join(tasks, file), 'utf-8'));
  }
  return canonical;
}

function markReadyForReview(cwd) {
  const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf-8'));
  state.phase = 'checking';
  state.gate = 'check_pass';
  state.current_step = '质量检查通过，下一步: docpath review';
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function structuredSpecJson(markdown, overrides = {}) {
  return {
    schema_version: 1,
    kind: 'spec',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    task_id: 'T-AGENT',
    backlog_id: null,
    title: 'T-AGENT - Agent Lifecycle',
    markdown,
    generated_at: '2026-06-01T00:00:00.000Z',
    scope: {
      included: ['agent done'],
      excluded: ['真实外部检查'],
    },
    major_change_gate: {
      required: false,
      types: [],
      user_confirmed: null,
      decision_brief_markdown: '',
    },
    ui_gate: {
      state: 'exempt',
    },
    functional_requirements: [
      { id: 'FR-1', text: 'agent done 能完成任务', done: false },
    ],
    non_functional_requirements: [
      { id: 'NFR-1', text: '保持测试隔离', done: false },
    ],
    acceptance_criteria: [
      { id: 'AC-1', text: 'agent done 清理 pending-done', done: false },
    ],
    decision_brief: '',
    ...overrides,
  };
}

describe('check and review commands', () => {
  let tmpdir_path;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-check-'));
    mkExecWorkspace(tmpdir_path);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('check --dry-run produces output', () => {
    const out = run('check --dry-run', tmpdir_path);
    assert.ok(out.length > 0, 'dry-run should produce output');
  });

  it('check --skip-tests --skip-lint runs without errors', () => {
    const out = run('check --skip-tests --skip-lint --fix-drift current', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
  });

  it('check reports active task document paths and field locations for structure errors', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-structure-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'workspace'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    mkdirSync(join(dp, 'spec'), { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: structure-test\n  type: node\n');
    writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
    writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-STRUCT',
      task_title: 'Structure diagnostics',
      phase: 'executing',
      gate: 'none',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
    writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Broken Spec\n\n## 2. 需求清单\n');
    writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: broken step',
      '- **描述**: only description',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /spec\.md 结构校验/);
    assert.match(result.out, /检查文件: .*\.docpath\/tasks\/current\/spec\.md/);
    assert.match(result.out, /缺少 `### 功能需求` 章节 \(line 3, section ## 2\. 需求清单, field ### 功能需求\)/);
    assert.match(result.out, /plan\.md 结构校验/);
    assert.match(result.out, /检查文件: .*\.docpath\/tasks\/current\/plan\.md/);
    assert.match(result.out, /以下步骤缺少 `验收条件`: S1 \(line 3, section S1, field 验收条件\)/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --dry-run produces output', () => {
    const reviewPath = join(tmpdir_path, '.docpath', 'workspace', 'review.md');
    const decisionsPath = join(tmpdir_path, '.docpath', 'workspace', 'decisions.md');
    const breadcrumbPath = join(tmpdir_path, '.docpath', 'workspace', 'breadcrumb.md');
    const statePath = join(tmpdir_path, '.docpath', 'workspace', 'state.json');
    const beforeBreadcrumb = readFileSync(breadcrumbPath, 'utf-8');
    const beforeState = readFileSync(statePath, 'utf-8');

    const result = runResult('review --dry-run', tmpdir_path);

    assert.equal(result.code, 0);
    assert.ok(result.out.length > 0, 'dry-run should produce output');
    assert.match(result.out, /\[dry-run\]/);
    assert.equal(existsSync(reviewPath), false);
    assert.equal(existsSync(decisionsPath), false);
    assert.equal(readFileSync(breadcrumbPath, 'utf-8'), beforeBreadcrumb);
    assert.equal(readFileSync(statePath, 'utf-8'), beforeState);
  });

  it('review shows real file names for TODO findings', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-todo-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git -c user.email=test@example.com -c user.name=Test commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
    execSync('git add todo.ts', { cwd, encoding: 'utf-8' });

    const out = run(`review --cwd ${cwd}`, cwd);

    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);
    assert.doesNotMatch(out, /\[f\.file\]/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review defaults to current worktree changes instead of last commit', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-worktree-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');

    const out = run(`review --cwd ${cwd} --dry-run`, cwd);

    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review result does not write ordinary review summaries into decisions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-no-decisions-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n');

    const out = run(`review --cwd ${cwd}`, cwd);
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');

    assert.match(out, /审查通过/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
    assert.equal(existsSync(decisionsPath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --approve does not write manual approvals into decisions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-approve-no-decisions-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'manual.ts'), 'export const manual = true;\n');

    const out = run(`review --cwd ${cwd} --approve`, cwd);
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
    const reviewPath = join(cwd, '.docpath', 'workspace', 'review.md');

    assert.match(out, /手动批准/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
    assert.equal(existsSync(reviewPath), true);
    assert.equal(existsSync(decisionsPath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check writes git baseline metadata into last-check evidence', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-git-baseline-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'README.md'), '# baseline\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    const head = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, new RegExp(`git_ref: ${head}`));
    assert.match(lastCheck, /branch: (main|master)/);
    assert.match(lastCheck, /worktree_dirty: (true|false)/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check counts plan progress with parsed steps and ignores duplicate checklist rows', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-plan-parser-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: First step',
      '- [x] S1: First step',
      '- **描述**: 完成第一步',
      '- **验收条件**: 第一项完成',
      '- **依赖**: 无',
      '',
      '### S2: Second step',
      '- [x] S2: Second step',
      '- **描述**: 完成第二步',
      '- **验收条件**: 第二项完成',
      '- **依赖**: S1',
      '',
      '## Checklist',
      '- [ ] S1',
      '- [ ] S2',
      '',
    ].join('\n'));
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1', 'S2']);

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const lastCheck = readFileSync(join(workspace, 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, /子任务完成度 \(2\/2\)/);
    assert.doesNotMatch(lastCheck, /子任务完成度 \(2\/4\)/);
    assert.doesNotMatch(lastCheck, /Checklist 同步/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check accepts global checklist markers when sections have no inline checkbox', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-global-checklist-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: First step',
      '- **描述**: 完成第一步',
      '- **验收条件**: 第一项完成',
      '- **依赖**: 无',
      '',
      '### S2: Second step',
      '- **描述**: 完成第二步',
      '- **验收条件**: 第二项完成',
      '- **依赖**: S1',
      '',
      '## Checklist',
      '- [x] S1',
      '- [x] S2',
      '',
    ].join('\n'));
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1', 'S2']);

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const current = readFileSync(join(workspace, 'current.md'), 'utf-8');
    const lastCheck = readFileSync(join(workspace, 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(current, /- \[x\] S1: First step/);
    assert.match(current, /- \[x\] S2: Second step/);
    assert.match(lastCheck, /子任务完成度 \(2\/2\)/);
    assert.doesNotMatch(lastCheck, /Checklist 同步/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check treats terminal verification step as covered by lifecycle gates', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-terminal-step-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Implement feature',
      '- [x] S1: Implement feature',
      '- **描述**: 完成功能实现',
      '- **验收条件**: 功能已实现',
      '- **依赖**: 无',
      '',
      '### S2: 验证门禁并归档',
      '- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。',
      '- **验收条件**: 质量门禁通过，任务状态进入 completed。',
      '- **依赖**: S1',
      '',
      '## Checklist',
      '- [x] S1',
      '- [ ] S2',
      '',
    ].join('\n'));
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1']);

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const lastCheck = readFileSync(join(workspace, 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, /子任务完成度 \(2\/2\)/);
    assert.match(lastCheck, /terminal verification step/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check keeps completed archived tasks completed when tasks/current is gone', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-completed-archive-'));
    const { workspace } = mkExecWorkspace(cwd);
    const doneTask = join(cwd, '.docpath', 'tasks', 'done', 'T-DONE');
    mkdirSync(doneTask, { recursive: true });
    writeFileSync(join(doneTask, 'spec.md'), readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'));
    writeFileSync(join(doneTask, 'plan.md'), readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8'));
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-DONE',
      task_title: 'Archived task',
      phase: 'completed',
      gate: 'review_pass',
      state: 'completed',
      current_step: '知识归档完成',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const state = JSON.parse(readFileSync(join(workspace, 'state.json'), 'utf-8'));
    const lastCheck = readFileSync(join(workspace, 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.equal(state.phase, 'completed');
    assert.equal(state.gate, 'review_pass');
    assert.match(lastCheck, /当前任务上下文文件完整性/);
    assert.doesNotMatch(lastCheck, /当前任务上下文文件缺失/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check blocks major dependency additions without a confirmed Decision Brief', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-major-decision-'));
    const { tasks } = mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      type: 'module',
      dependencies: { cac: '^6.7.14' },
      scripts: {},
    }, null, 2) + '\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });

    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      type: 'module',
      dependencies: {
        cac: '^6.7.14',
        react: '^19.0.0',
        antd: '^6.0.0',
      },
      scripts: {},
    }, null, 2) + '\n');

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /重大决策确认检查/);
    assert.match(result.out, /新增重大依赖: antd, react/);
    assert.match(result.out, /检测到重大变更/);
    assert.match(result.out, /未记录 Decision Brief 和用户确认/);

    const confirmedSpec = `${readFileSync(join(tasks, 'spec.md'), 'utf-8').replace('## 5. 验收标准', [
      '## 4.1 重大决策门禁',
      '',
      '### 是否涉及重大技术决策',
      '- [x] 是，需要用户确认',
      '',
      '### 决策类型',
      '- [x] 技术栈 / 框架',
      '- [x] UI 框架 / 设计系统',
      '- [x] 外部 SDK / 大依赖',
      '',
      '### Decision Brief',
      '- 背景: 测试新增重大依赖门禁',
      '- 可选方案: 保持原生 / React',
      '- 推荐方案: React',
      '- 成本: 新增依赖与维护成本',
      '- 风险: 包体积与技术栈迁移风险',
      '- 回滚方案: 移除新增依赖并恢复原实现',
      '- 用户确认: 2026-06-08 用户确认新增 React 测试依赖',
      '',
      '## 5. 验收标准',
    ].join('\n'))}`;
    writeFileSync(join(tasks, 'spec.md'), confirmedSpec);

    const confirmed = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const confirmedLastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(confirmed.code, 0);
    assert.match(confirmedLastCheck, /重大决策确认检查/);
    assert.match(confirmed.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check reads major change confirmation from spec.json before spec.md', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-major-json-'));
    const { tasks } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    const markdown = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    const specJson = structuredSpecJson(markdown, {
      major_change_gate: {
        required: true,
        types: ['工作流 / Agent 行为'],
        user_confirmed: '2026-06-13 用户确认协议模板重大变更',
        decision_brief_markdown: [
          '- 当前问题: 测试 JSON 重大变更门禁',
          '- 目标: JSON 结构化字段优先生效',
          '- 用户确认: 2026-06-13 用户确认协议模板重大变更',
        ].join('\n'),
      },
    });
    writeFileSync(join(tasks, 'spec.json'), `${JSON.stringify(specJson, null, 2)}\n`);
    writeFileSync(join(canonical, 'spec.json'), `${JSON.stringify(specJson, null, 2)}\n`);

    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      type: 'module',
      dependencies: { cac: '^6.7.14' },
      scripts: {},
    }, null, 2) + '\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      type: 'module',
      dependencies: {
        cac: '^6.7.14',
        react: '^19.0.0',
      },
      scripts: {},
    }, null, 2) + '\n');
    execSync('git add package.json', { cwd, encoding: 'utf-8' });

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, /重大决策确认检查/);
    assert.match(result.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check fails loud when spec.json is corrupt', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-corrupt-spec-json-'));
    const { tasks } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    writeFileSync(join(canonical, 'spec.json'), '{not-json');

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /spec\.json .*不是合法 JSON/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check fails loud when spec.md drifts from spec.json hash', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-spec-json-drift-'));
    const { tasks } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    const brokenSpec = '# Broken view\n';
    writeFileSync(join(tasks, 'spec.md'), brokenSpec);
    writeFileSync(join(canonical, 'spec.md'), brokenSpec);
    const specJson = structuredSpecJson('', {
      major_change_gate: {
        required: false,
        types: [],
        user_confirmed: null,
        decision_brief_markdown: '- 用户确认: 无',
      },
      ui_gate: {
        state: 'exempt',
      },
    });
    writeFileSync(join(canonical, 'spec.json'), `${JSON.stringify(specJson, null, 2)}\n`);

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /任务文件 current\/canonical 漂移检查/);
    assert.match(result.out, /source\.content_sha256 不一致/);
    assert.match(result.out, /docpath tasks sync --from current/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check blocks strategic workflow or UI changes without confirmed major change gate', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-strategic-change-'));
    const { tasks } = mkExecWorkspace(cwd);
    mkdirSync(join(cwd, 'templates'), { recursive: true });
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'templates', 'AGENTS.md'), '# Agent Protocol\n\nOld rule.\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });

    writeFileSync(join(cwd, 'templates', 'AGENTS.md'), [
      '# Agent Protocol',
      '',
      '重大 UI 信息架构和工作流变更必须先讨论。',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /重大决策确认检查/);
    assert.match(result.out, /Agent 协议模板变更: templates\/AGENTS\.md/);
    assert.match(result.out, /检测到重大变更/);

    const confirmedSpec = `${readFileSync(join(tasks, 'spec.md'), 'utf-8').replace('## 5. 验收标准', [
      '## 4.1 重大变更门禁',
      '',
      '### 是否涉及重大变更',
      '- [x] 是，需要用户确认',
      '',
      '### 变更类型',
      '- [x] UI 信息架构 / 用户主路径',
      '- [x] 工作流 / Agent 行为',
      '',
      '### Decision Brief',
      '- 当前问题: 测试协议模板重大变更门禁',
      '- 目标: 未确认时阻塞协议级改动',
      '- 背景: 协议模板会改变 Agent 行为',
      '- 可选方案: 直接修改 / 先确认',
      '- 推荐方案: 先确认',
      '- 不做什么: 不扩大到实现任务',
      '- 成本: 增加前置讨论',
      '- 风险: 门禁过严',
      '- 回滚方案: 恢复旧协议模板',
      '- 用户确认: 2026-06-08 用户确认协议模板重大变更',
      '',
      '## 5. 验收标准',
    ].join('\n'))}`;
    writeFileSync(join(tasks, 'spec.md'), confirmedSpec);

    const confirmed = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const confirmedLastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(confirmed.code, 0);
    assert.match(confirmedLastCheck, /重大决策确认检查/);
    assert.match(confirmed.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check blocks UI implementation when design approval is not approved', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-ui-approval-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'spec.md'), [
      '# T-AGENT - Project UI',
      '',
      '## 1. 背景与动机',
      '重构 项目页面布局。',
      '',
      '## 2. 需求清单',
      '### 功能需求',
      '- [ ] FR-1: 实现 project UI layout',
      '### 非功能需求',
      '- [ ] NFR-1: 响应式界面',
      '',
      '## 3. 范围界定',
      '### 包含',
      '- 页面实现',
      '### 不包含',
      '- 后端改造',
      '',
      '## 4. 关键决策',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | UI | 旧版 / 新版 | 新版 | 测试 |',
      '',
      '## 5. 验收标准',
      '- [ ] AC-1: UI implementation 通过 approval gate',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: UI implementation',
      '- [x] S1: UI implementation',
      '- **描述**: 写产品 UI 代码',
      '- **验收条件**: 页面实现完成',
      '- **依赖**: 无',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-preview.md'), '# Design Preview\n\n信息架构 布局 状态 交互 移动 响应式 参考 不做 边界 snapshot HTML '.repeat(20));
    writeFileSync(join(tasks, 'visual-acceptance.md'), '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(12));
    writeFileSync(join(tasks, 'ui-brief.md'), [
      '# UI Prompt Brief',
      '## Product Context',
      '## Design North Star',
      '## Visual Direction',
      '## Anti-goals',
      '## Design Tokens',
      '## Shared Components',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'external-design-handoff.md'), [
      '# External Design Handoff',
      '## Tool Prompt',
      'Stitch Figma v0 Framer prompt',
      '## Tool Outputs',
      'output link and snapshot',
      '## Selected Direction',
      'selected project page direction',
      '## Rejected Directions',
      'rejected marketing hero',
      '## Implementation Constraints',
      'constraints for responsive implementation',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-approval.md'), [
      '---',
      'approval:',
      '  state: pending',
      '  source: user',
      '  approved_at: null',
      '  forbidden_directions: []',
      '---',
      '# Design Approval',
      '## Forbidden Directions',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /UI\/UX Design Approval Gate/);
    assert.match(result.out, /状态不是 approved（当前: pending）/);
    assert.match(result.out, /用户同意采用流程不等于批准具体设计方案/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check allows UI implementation when design approval is approved', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-ui-approved-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'spec.md'), [
      '# T-AGENT - Project UI',
      '',
      '## 1. 背景与动机',
      '重构 项目页面布局。',
      '',
      '## 2. 需求清单',
      '### 功能需求',
      '- [ ] FR-1: 实现 project UI layout',
      '### 非功能需求',
      '- [ ] NFR-1: 响应式界面',
      '',
      '## 3. 范围界定',
      '### 包含',
      '- 页面实现',
      '### 不包含',
      '- 后端改造',
      '',
      '## 4. 关键决策',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | UI | 旧版 / 新版 | 新版 | 测试 |',
      '',
      '## 5. 验收标准',
      '- [ ] AC-1: UI implementation 通过 approval gate',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: UI implementation',
      '- [x] S1: UI implementation',
      '- **描述**: 写产品 UI 代码',
      '- **验收条件**: 页面实现完成',
      '- **依赖**: 无',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-preview.md'), '# Design Preview\n\n信息架构 布局 状态 交互 移动 响应式 参考 不做 边界 snapshot HTML '.repeat(20));
    writeFileSync(join(tasks, 'visual-acceptance.md'), '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(12));
    writeFileSync(join(tasks, 'ui-brief.md'), [
      '# UI Prompt Brief',
      '## Product Context',
      '## Design North Star',
      '## Visual Direction',
      '## Anti-goals',
      '## Design Tokens',
      '## Shared Components',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'external-design-handoff.md'), [
      '# External Design Handoff',
      '## Tool Prompt',
      'Stitch Figma v0 Framer prompt',
      '## Tool Outputs',
      'output link and snapshot',
      '## Selected Direction',
      'selected project page direction',
      '## Rejected Directions',
      'rejected marketing hero',
      '## Implementation Constraints',
      'constraints for responsive implementation',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-approval.md'), [
      '---',
      'approval:',
      '  state: approved',
      '  source: user',
      '  approved_at: 2026-06-10T00:00:00.000Z',
      '  summary: Approved concrete project page visual direction',
      '  forbidden_directions: [marketing hero]',
      '---',
      '# Design Approval',
      '## Forbidden Directions',
      '- marketing hero',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, /UI\/UX Design Approval Gate/);
    assert.match(result.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check blocks UI implementation when external design handoff is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-ui-missing-handoff-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'spec.md'), [
      '# T-AGENT - Project UI',
      '',
      '## 1. 背景与动机',
      '重构 项目页面布局。',
      '',
      '## 2. 需求清单',
      '### 功能需求',
      '- [ ] FR-1: 实现 project UI layout',
      '### 非功能需求',
      '- [ ] NFR-1: 响应式界面',
      '',
      '## 3. 范围界定',
      '### 包含',
      '- 页面实现',
      '### 不包含',
      '- 后端改造',
      '',
      '## 4. 关键决策',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | UI | 旧版 / 新版 | 新版 | 测试 |',
      '',
      '## 5. 验收标准',
      '- [ ] AC-1: UI implementation 通过 approval gate',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: UI implementation',
      '- [x] S1: UI implementation',
      '- **描述**: 写产品 UI 代码',
      '- **验收条件**: 页面实现完成',
      '- **依赖**: 无',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-preview.md'), '# Design Preview\n\n信息架构 布局 状态 交互 移动 响应式 参考 不做 边界 snapshot HTML '.repeat(20));
    writeFileSync(join(tasks, 'visual-acceptance.md'), '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(12));
    writeFileSync(join(tasks, 'ui-brief.md'), [
      '# UI Prompt Brief',
      '## Product Context',
      '## Design North Star',
      '## Visual Direction',
      '## Anti-goals',
      '## Design Tokens',
      '## Shared Components',
      '',
    ].join('\n'));
    writeFileSync(join(tasks, 'design-approval.md'), [
      '---',
      'approval:',
      '  state: approved',
      '  source: user',
      '  approved_at: 2026-06-10T00:00:00.000Z',
      '  summary: Approved concrete project page visual direction',
      '  forbidden_directions: [marketing hero]',
      '---',
      '# Design Approval',
      '## Forbidden Directions',
      '- marketing hero',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /UI\/UX Design Approval Gate/);
    assert.match(result.out, /缺少文件: external-design-handoff\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check does not require UI approval for non-UI tasks', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-non-ui-'));
    mkExecWorkspace(cwd);

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 0);
    assert.doesNotMatch(result.out, /UI\/UX Design Approval Gate/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('status warns when current executing task has pending-done sentinel', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-AGENT
entered_at: 2026-06-01T00:00:00.000Z
phase: executing
warned: false
---
`);

    const out = run('status', tmpdir_path);

    assert.match(out, /未收尾哨兵/);
    assert.match(out, /docpath agent done/);
    assert.match(out, /task_id: T-AGENT/);
  });

  it('status does not warn when sentinel belongs to another task', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-OTHER
entered_at: 2026-06-01T00:00:00.000Z
phase: executing
warned: false
---
`);

    const out = run('status', tmpdir_path);

    assert.doesNotMatch(out, /未收尾哨兵/);
    assert.doesNotMatch(out, /docpath agent done/);
  });

  it('status writes stale pending-done warning breadcrumb only once', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-AGENT
entered_at: 2026-05-29T00:00:00.000Z
phase: executing
warned: false
---
`);

    run('status', tmpdir_path);
    run('status', tmpdir_path);

    const breadcrumb = readFileSync(join(tmpdir_path, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const matches = breadcrumb.match(/\[WARN\] Task T-AGENT active >24h without done/g) || [];
    assert.equal(matches.length, 1);
    const sentinel = readFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), 'utf-8');
    assert.match(sentinel, /warned: true/);
  });

  it('status human output exposes state, phase, gate and source truth', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: 'T-S1',
      task_title: 'Status Output',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'current.md'), '# Current\n');

    const out = run('status', tmpdir_path);

    assert.match(out, /状态:\s+executing/);
    assert.match(out, /阶段:\s+executing/);
    assert.match(out, /门禁:\s+none/);
    assert.match(out, /状态真源:\s+\.docpath\/workspace\/state\.json/);
    assert.match(out, /渲染产物:.*\.docpath\/workspace\/current\.md/);
    assert.doesNotMatch(out, /current\.md 是否存在/);
  });

  it('status --agent keeps machine output unchanged', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: 'T-S1',
      task_title: 'Status Output',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));

    const out = run('status --agent', tmpdir_path);

    assert.match(out, /^state:/m);
    assert.match(out, /^phase:/m);
    assert.match(out, /^gate:/m);
    assert.doesNotMatch(out, /状态真源/);
  });

  it('status uninitialized hint points to state.json and current.md relationship', () => {
    rmSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), { force: true });
    rmSync(join(tmpdir_path, '.docpath', 'workspace', 'current.md'), { force: true });

    const out = run('status', tmpdir_path);

    assert.match(out, /未找到可解析的工作流状态/);
    assert.match(out, /state\.json 是否存在/);
    assert.match(out, /current\.md 只是由 state\.json 重建的渲染产物/);
  });
});
