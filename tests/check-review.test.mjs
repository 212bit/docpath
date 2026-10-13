import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

// 8 维度齐全、全部具体值的可选设计稿，覆盖 missingDesignPreviewDepth 工具函数夹具。
const CONCRETE_PREVIEW = [
  '# Design Preview',
  '## 1. 布局与栅格',
  '栅格 12 列，gutter 24px，断点 640px / 1024px；区域 Header / Sidebar / Main。',
  '## 2. 尺寸规格',
  'Header 高 64px；Sidebar 宽 240px；主按钮 高 40px。',
  '## 3. 间距标度',
  '标度（base 4px）: 4px / 8px / 16px / 24px / 32px。',
  '## 4. 图标系统',
  '图标库 lucide，默认 24px，描边 1.5px；新增=plus，删除=trash。',
  '## 5. 颜色与 Tokens',
  '--bg #FFFFFF；--text #1A1D23；--primary #2563EB；--error #DC2626。',
  '## 6. 动效规格',
  '时长 fast 120ms / base 200ms；缓动 cubic-bezier(0.16, 1, 0.3, 1)。',
  '## 7. 交互逻辑',
  '主操作 hover 高亮，focus 焦点环 2px，loading 占位，error 行内提示。',
  '## 8. 技术约束',
  '绑定 frontend-stack；对比度 ≥ 4.5:1；首屏预算 150KB；支持最近两版浏览器。',
  '',
].join('\n');

const REQUIRED_UI_GATE_SECTION = [
  '## 4.1 重大变更门禁',
  '',
  '### UI 设计门禁',
  '- [ ] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
  '- [x] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）',
  '',
];

function writeValidFrontendStack(tasks) {
  writeFileSync(join(tasks, 'frontend-stack.md'), [
    '# Frontend Stack',
    '',
    '## 选定栈',
    '- JS 框架: 纯静态',
    '- CSS / 样式方案: 原生 CSS',
    '- 组件库 / 设计系统: 无',
    '',
    '## 被否决备选',
    '- React - 理由: 当前测试场景不需要组件运行时，增加构建和运行复杂度',
    '',
    '## 约束',
    '- 性能 / 包体约束: 保持夹具最小',
    '',
  ].join('\n'));
}

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
  const jsonlLines = steps.map((step, index) => JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    taskId,
    step,
    status: 'done',
    context: '已完成',
    timestamp: `2026-06-01T00:0${index}:00.000Z`,
  }));
  writeFileSync(join(workspace, 'breadcrumb.jsonl'), jsonlLines.join('\n') + '\n');

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

function structuredPlanJson(markdown, overrides = {}) {
  return {
    schema_version: 1,
    kind: 'plan',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    title: 'T-AGENT - Agent Lifecycle',
    markdown,
    generated_at: '2026-06-01T00:00:00.000Z',
    steps: [
      {
        id: 'S1',
        name: '实现 agent done',
        description: '实现 pending-done 收口。',
        acceptance: 'agent done 能完成任务。',
        dependencies: '无',
        status: 'pending',
      },
    ],
    ...overrides,
  };
}

function writeActiveSpecJson(cwd, tasks, specJson, taskId = undefined) {
  const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
  let resolvedTaskId = taskId;
  if (!resolvedTaskId && existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      resolvedTaskId = state.task_id;
    } catch {}
  }
  resolvedTaskId = resolvedTaskId || 'T-AGENT';
  const canonical = join(cwd, '.docpath', 'tasks', resolvedTaskId);
  mkdirSync(canonical, { recursive: true });
  const content = `${JSON.stringify({ ...specJson, task_id: resolvedTaskId }, null, 2)}\n`;
  writeFileSync(join(tasks, 'spec.json'), content);
  writeFileSync(join(canonical, 'spec.json'), content);
}

function writeActivePlanJson(cwd, tasks, planJson, taskId = undefined) {
  const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
  let resolvedTaskId = taskId;
  if (!resolvedTaskId && existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      resolvedTaskId = state.task_id;
    } catch {}
  }
  resolvedTaskId = resolvedTaskId || 'T-AGENT';
  const canonical = join(cwd, '.docpath', 'tasks', resolvedTaskId);
  mkdirSync(canonical, { recursive: true });
  const content = `${JSON.stringify(planJson, null, 2)}\n`;
  writeFileSync(join(tasks, 'plan.json'), content);
  writeFileSync(join(canonical, 'plan.json'), content);
}

function writePendingDoneFixture(workspace, record) {
  writeFileSync(join(workspace, 'pending-done.json'), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(workspace, 'pending-done.md'), `---
task_id: ${record.task_id}
entered_at: ${record.entered_at}
phase: ${record.phase}
warned: ${record.warned === true ? 'true' : 'false'}
---
`);
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

  it('project standards package gate is skipped for ordinary non-intake workspaces', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-standards-skip-'));
    try {
      mkExecWorkspace(cwd);
      const result = runResult('check --skip-tests --skip-lint --fix-drift current --verbose', cwd);
      assert.equal(result.code, 0);
      assert.doesNotMatch(result.out, /Project standards package gate/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('project standards package gate blocks missing required artifacts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-standards-missing-'));
    try {
      mkExecWorkspace(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'requirements.md'), '# Requirements\n\n拍板状态: 已拍板\n');

      const result = runResult('check --skip-tests --skip-lint --fix-drift current --verbose', cwd);

      assert.notEqual(result.code, 0);
      assert.match(result.out, /Project standards package gate/);
      assert.match(result.out, /Missing required artifacts/);
      assert.match(result.out, /architecture\.md/);
      assert.doesNotMatch(result.out, /development-checklist\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('project standards package gate blocks draft standards artifacts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-standards-draft-'));
    try {
      mkExecWorkspace(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'requirements.md'), '# Requirements\n\n拍板状态: 已拍板\n');
      writeFileSync(join(cwd, '.docpath', 'rules', 'architecture.md'), '# Architecture\n\n> 雏形讨论稿\n\n模块与依赖待重写。\n');

      const result = runResult('check --skip-tests --skip-lint --fix-drift current', cwd);

      assert.notEqual(result.code, 0);
      assert.match(result.out, /Artifacts that still look draft\/unapproved/);
      assert.match(result.out, /contains draft\/prototype\/inferred marker/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('project standards package gate passes frozen minimal standards', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-standards-pass-'));
    try {
      mkExecWorkspace(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'requirements.md'), '# Requirements\n\n拍板状态: 已拍板\n\n目标、范围、验收标准已确认。\n');
      writeFileSync(join(cwd, '.docpath', 'rules', 'architecture.md'), '# Architecture\n\n## ADR-001\n\n模块边界和依赖方向已确认。\n');

      const result = runResult('check --skip-tests --skip-lint --fix-drift current', cwd);

      assert.equal(result.code, 0);
      const evidence = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.json'), 'utf-8'));
      const standardsGate = evidence.checks.find((check) => check.name === 'Project standards package gate');
      assert.equal(standardsGate?.passed, true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('check resolves main checkout node_modules bin when running inside a git worktree', () => {
    const main = mkdtempSync(join(tmpdir(), 'dp-check-main-'));
    const sibling = mkdtempSync(join(tmpdir(), 'dp-check-wt-parent-'));
    const worktree = join(sibling, 'feature');
    try {
      const { tasks } = mkExecWorkspace(main);
      writeCanonicalTaskCopy(main, 'T-AGENT', tasks);
      writeFileSync(join(main, 'package.json'), JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'tsup --clean',
          test: 'tsup',
          lint: 'tsc --noEmit',
        },
      }, null, 2));
      writeFileSync(join(main, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
      writeFileSync(join(main, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }, null, 2));
      mkdirSync(join(main, 'node_modules', '.bin'), { recursive: true });
      const pnpmShim = join(main, 'node_modules', '.bin', 'pnpm');
      const tscShim = join(main, 'node_modules', '.bin', 'tsc');
      const tsupShim = join(main, 'node_modules', '.bin', 'tsup');
      writeFileSync(pnpmShim, [
        '#!/bin/sh',
        'case "$*" in',
        '  *typecheck*) command -v tsc >/dev/null || exit 11 ;;',
        '  *build*) command -v tsup >/dev/null || exit 12 ;;',
        '  *test*) command -v tsup >/dev/null || exit 13 ;;',
        '  *lint*) command -v tsc >/dev/null || exit 14 ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
      writeFileSync(tscShim, '#!/bin/sh\nexit 0\n');
      writeFileSync(tsupShim, '#!/bin/sh\nexit 0\n');
      chmodSync(pnpmShim, 0o755);
      chmodSync(tscShim, 0o755);
      chmodSync(tsupShim, 0o755);

      execSync('git init', { cwd: main, encoding: 'utf-8' });
      execSync('git config user.email test@example.com', { cwd: main, encoding: 'utf-8' });
      execSync('git config user.name Test', { cwd: main, encoding: 'utf-8' });
      execSync('git add .docpath package.json pnpm-lock.yaml tsconfig.json', { cwd: main, encoding: 'utf-8' });
      execSync('git commit -m baseline', { cwd: main, encoding: 'utf-8' });
      execSync(`git worktree add ${JSON.stringify(worktree)} HEAD`, { cwd: main, encoding: 'utf-8' });
      rmSync(join(worktree, 'node_modules'), { recursive: true, force: true });

      const result = runResult(`check --cwd ${worktree} --verbose`, worktree);

      assert.equal(result.code, 0, result.out);
      assert.match(result.out, /TypeScript 编译/);
      assert.match(result.out, /构建/);
      assert.match(result.out, /测试/);
      assert.match(result.out, /Lint/);
      assert.match(result.out, /全部通过/);
      // R-347: 门禁列出实际执行的外部命令，agent 据此不再手动重跑
      assert.match(result.out, /已执行命令（门禁已跑过，无需手动重复）/);
      assert.match(result.out, /TypeScript 编译: tsc --noEmit/);
      const lastCheck = JSON.parse(readFileSync(join(worktree, '.docpath', 'workspace', 'last-check.json'), 'utf-8'));
      const withCommand = lastCheck.checks.filter((c) => typeof c.command === 'string' && c.command.length > 0);
      assert.ok(withCommand.length >= 4, `last-check.json checks[] should carry command: ${JSON.stringify(lastCheck.checks)}`);
      assert.ok(withCommand.every((c) => !/2>&1\s*$/.test(c.command)), 'command should not keep the internal 2>&1 suffix');
    } finally {
      try { execSync(`git worktree remove --force ${JSON.stringify(worktree)}`, { cwd: main, encoding: 'utf-8' }); } catch { /* ignore cleanup */ }
      rmSync(main, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
    }
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

  it('review fails before evidence writes when canonical spec.md drifts from spec.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-spec-drift-'));
    const { tasks } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(canonical, 'spec.md'), '# Stale spec view\n');
    writeFileSync(join(tasks, 'spec.md'), '# Stale spec view\n');
    writeActiveSpecJson(cwd, tasks, structuredSpecJson('', {
      major_change_gate: {
        required: false,
        types: [],
        user_confirmed: null,
        decision_brief_markdown: '- 用户确认: 无',
      },
      ui_gate: {
        state: 'exempt',
      },
    }), 'T-AGENT');
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review should not reach changed files\n');

    const result = runResult(`review --cwd ${cwd}`, cwd);

    // R-287: 漂移不再阻塞评审，由门禁入口自愈收敛（陈旧视图从 json 真源恢复）。
    assert.match(result.out, /spec\.md 机器真理源漂移已自愈/);
    assert.doesNotMatch(result.out, /机器真理源不同步/);
    const healedSpec = readFileSync(join(canonical, 'spec.md'), 'utf-8');
    assert.match(healedSpec, /FR-1/);

    const second = runResult(`review --cwd ${cwd}`, cwd);
    assert.doesNotMatch(second.out, /漂移已自愈/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review fails before evidence writes when canonical plan.md drifts from plan.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-plan-drift-'));
    const { tasks } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(canonical, 'plan.md'), '# Stale plan view\n');
    writeFileSync(join(tasks, 'plan.md'), '# Stale plan view\n');
    writeActivePlanJson(cwd, tasks, structuredPlanJson(''), 'T-AGENT');
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review should not reach changed files\n');

    const result = runResult(`review --cwd ${cwd}`, cwd);

    // R-287: 漂移不再阻塞评审，由门禁入口自愈收敛（陈旧视图从 json 真源恢复）。
    assert.match(result.out, /plan\.md 机器真理源漂移已自愈/);
    assert.doesNotMatch(result.out, /机器真理源不同步/);
    const healedPlan = readFileSync(join(canonical, 'plan.md'), 'utf-8');
    assert.match(healedPlan, /S1/);

    const second = runResult(`review --cwd ${cwd}`, cwd);
    assert.doesNotMatch(second.out, /漂移已自愈/);
    rmSync(cwd, { recursive: true, force: true });
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

  it('review falls back to task cumulative diff when the worktree is clean after commits', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-task-scope-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts .docpath/config.json', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });

    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.started_at = new Date(Date.now() - 1000).toISOString();
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    writeFileSync(join(cwd, 'todo.ts'), '// TODO review committed task diff\n');
    execSync('git add todo.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m feature', { cwd, encoding: 'utf-8' });

    // R-276: 活跃任务默认即 task 累计 diff, 树干净也覆盖已提交变更。
    const out = run(`review --cwd ${cwd} --dry-run`, cwd);

    assert.match(out, /活跃任务默认走 task 累计 diff 审查/);
    assert.match(out, /scope: task/);
    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);

    // 显式 --scope all 且树干净时, 原有自动切换兜底仍生效。
    const explicitAll = run(`review --cwd ${cwd} --scope all --dry-run`, cwd);

    assert.match(explicitAll, /自动切换为 task 累积 diff 审查/);
    assert.match(explicitAll, /scope: task/);
    assert.match(explicitAll, /todo\.ts/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --scope last_commit inspects the latest commit without git pretty-format fatal', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-last-commit-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts .docpath/config.json', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review latest commit\n');
    execSync('git add todo.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m feature', { cwd, encoding: 'utf-8' });

    const out = run(`review --cwd ${cwd} --scope last_commit --dry-run`, cwd);

    assert.doesNotMatch(out, /fatal: invalid --pretty format/);
    assert.doesNotMatch(out, /未发现变更文件/);
    assert.match(out, /scope: last_commit/);
    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review ignores DocPath workspace runtime session files', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-runtime-session-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    mkdirSync(join(cwd, '.docpath', 'workspace', 'sessions'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'sessions', 'default.json'), JSON.stringify({ cwd: './mock-flow-runner' }, null, 2));
    writeFileSync(join(cwd, 'clean.ts'), 'export const clean = true;\n');

    const out = run(`review --cwd ${cwd}`, cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.match(out, /审查通过/);
    assert.doesNotMatch(out, /硬编码绝对路径/);
    assert.equal(reviewJson.files.includes('.docpath/workspace/sessions/default.json'), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review exempts hardcoded absolute path in test files (mirrors console.log rule)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-test-exempt-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'legacy.test.ts'), "const p = '/Users/foo/bar';\nexport const x = p;\n");
    const out = run(`review --cwd ${cwd}`, cwd);
    assert.doesNotMatch(out, /硬编码绝对路径/);
    assert.match(out, /审查通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review still flags hardcoded absolute path in non-test source files', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-nontest-strict-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'legacy.ts'), "const p = '/Users/foo/bar';\nexport const x = p;\n");
    const out = run(`review --cwd ${cwd}`, cwd);
    assert.match(out, /硬编码绝对路径/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review result does not write ordinary review summaries into decisions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-no-decisions-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    mkdirSync(join(cwd, '.docpath', 'review-skills', 'typescript'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'review-skills', 'typescript', 'SKILL.md'), '# TypeScript Review Skill\n\n## Scope\n\n## Review Checklist\n\n## Evidence Contract\n');
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n');

    const out = run(`review --cwd ${cwd} --skip-skill-review docpath-review-typescript --reason "baseline scanner regression test"`, cwd);
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
    const reviewJsonPath = join(cwd, '.docpath', 'workspace', 'review.json');
    const reviewJson = JSON.parse(readFileSync(reviewJsonPath, 'utf-8'));

    assert.match(out, /审查通过/);
    assert.match(out, /finding_scope: mixed/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
    assert.equal(reviewJson.scope, 'task');
    assert.equal(reviewJson.skill_review_gate.status, 'pass_with_skips');
    assert.equal(reviewJson.finding_scope, 'mixed');
    assert.equal(reviewJson.finding_scope_counts.current_diff.infos, 1);
    assert.equal(existsSync(decisionsPath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review distinguishes current-diff findings from baseline whole-file findings', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-scope-counts-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'feature.ts'), [
      'export function longFeature() {',
      ...Array.from({ length: 55 }, (_, index) => `  const value${index} = ${index};`),
      '  return 1;',
      '}',
      '',
    ].join('\n'));
    execSync('git add src/feature.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'src', 'feature.ts'), [
      'export function longFeature() {',
      ...Array.from({ length: 55 }, (_, index) => `  const value${index} = ${index};`),
      '  console.log("new warning");',
      '  return 1;',
      '}',
      '',
    ].join('\n'));

    const out = run(`review --cwd ${cwd}`, cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.match(out, /current_diff: 0 错误, 1 警告, 0 提示/);
    assert.match(out, /baseline_or_whole_file: 0 错误, 1 警告, 0 提示/);
    assert.equal(reviewJson.finding_scope_counts.current_diff.warnings, 1);
    assert.equal(reviewJson.finding_scope_counts.baseline_or_whole_file.warnings, 1);
    assert.equal(reviewJson.findings.some((finding) => finding.finding_scope === 'current_diff'), true);
    assert.equal(reviewJson.findings.some((finding) => finding.finding_scope === 'baseline_or_whole_file'), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --approve does not write manual approvals into decisions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-approve-no-decisions-'));
    mkExecWorkspace(cwd);
    markReadyForReview(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    writeFileSync(join(cwd, 'manual.ts'), 'export const manual = true;\n');

    const out = run(`review --cwd ${cwd} --approve`, cwd);
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
    const reviewPath = join(cwd, '.docpath', 'workspace', 'review.md');
    const reviewJsonPath = join(cwd, '.docpath', 'workspace', 'review.json');

    assert.match(out, /手动批准/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
    assert.equal(existsSync(reviewPath), true);
    assert.equal(existsSync(reviewJsonPath), true);
    assert.equal(JSON.parse(readFileSync(reviewJsonPath, 'utf-8')).manual, true);
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
    const lastCheckJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(lastCheck, new RegExp(`git_ref: ${head}`));
    assert.match(lastCheck, /branch: (main|master)/);
    assert.match(lastCheck, /worktree_dirty: (true|false)/);
    assert.equal(lastCheckJson.passed, true);
    assert.equal(lastCheckJson.git.ref, head);
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
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1']);
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
    assert.match(result.out, /检测到未提交的重大变更/);
    assert.match(result.out, /两种合法出路/);

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
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(confirmedSpec, {
      major_change_gate: {
        required: true,
        types: ['技术栈 / 框架', 'UI 框架 / 设计系统', '外部 SDK / 大依赖'],
        user_confirmed: '2026-06-08 用户确认新增 React 测试依赖',
        decision_brief_markdown: [
          '- 背景: 测试新增重大依赖门禁',
          '- 可选方案: 保持原生 / React',
          '- 推荐方案: React',
          '- 成本: 新增依赖与维护成本',
          '- 风险: 包体积与技术栈迁移风险',
          '- 回滚方案: 移除新增依赖并恢复原实现',
          '- 用户确认: 2026-06-08 用户确认新增 React 测试依赖',
        ].join('\n'),
      },
    }));

    const confirmed = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const confirmedLastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    if (confirmed.code !== 0) {
      console.log('Confirmed Test Result Out:', confirmed.out);
      console.log('Confirmed Last Check:', confirmedLastCheck);
    }

    assert.equal(confirmed.code, 0);
    assert.match(confirmedLastCheck, /重大决策确认检查/);
    assert.match(confirmed.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check accepts --non-interactive and allows programmatic evidence writeback', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-interactive-writeback-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
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

    // 新增依赖触发重大变更门禁
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      type: 'module',
      dependencies: {
        cac: '^6.7.14',
        react: '^19.0.0',
      },
      scripts: {},
    }, null, 2) + '\n');

    // 注入含有待确认重大决策门禁的 spec
    const originalSpec = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    const specWithGate = originalSpec.replace('## 5. 验收标准', [
      '## 4.1 重大决策门禁',
      '',
      '### 是否涉及重大技术决策',
      '- [ ] 是，需要用户确认',
      '',
      '### Decision Brief',
      '- 背景: 测试交互确认',
      '- 推荐方案: React',
      '- 用户确认: 待确认',
      '',
      '## 5. 验收标准',
    ].join('\n'));
    writeFileSync(join(tasks, 'spec.md'), specWithGate);

    // 1. 验证 --non-interactive 阻止交互并直接失败
    const nonInteractiveResult = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current --non-interactive`, cwd);
    assert.equal(nonInteractiveResult.code, 1);
    assert.match(nonInteractiveResult.out, /重大决策确认检查/);
    assert.match(nonInteractiveResult.out, /检测到未提交的重大变更/);

    // 2. 调用 writeMajorChangeConfirmation 回写证据
    const { writeMajorChangeConfirmation } = await import('../dist/commands/check/evidence.js');
    await writeMajorChangeConfirmation(join(cwd, '.docpath'), 'T-AGENT', 'Approved programmatically via test');

    // 3. 验证规约自动写入 spec.md 且可通过重大变更门禁
    const checkPassedResult = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current --non-interactive`, cwd);
    assert.equal(checkPassedResult.code, 0);
    assert.match(checkPassedResult.out, /全部通过/);

    const specMd = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    assert.match(specMd, /-\s*\[x\]\s*是，需要用户确认/);
    assert.match(specMd, /- 用户确认: Approved programmatically via test/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('check supports 3-way merge conflict suggestions on file drift', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-merge-drift-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    const canonical = writeCanonicalTaskCopy(cwd, 'T-AGENT', tasks);
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1']);
    // 写入任务级别的 breadcrumb.jsonl 以通过子任务完成度检查
    const tasksDir = join(cwd, '.docpath', 'tasks', 'T-AGENT');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'breadcrumb.jsonl'), JSON.stringify({
      schema_version: 1,
      kind: 'breadcrumb',
      taskId: 'T-AGENT',
      step: 'S1',
      status: 'done',
      timestamp: '2026-06-01T00:00:00.000Z',
      context: '完成',
    }) + '\n');

    // 1. 无冲突三方合并测试
    // 制造 canonical 和 current 在不同位置添加内容的无冲突漂移
    const baseContent = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    // canonical 在第一段后添加内容
    const canonicalContent = baseContent.replace(
      '## 1. 背景与动机',
      '## 1. 背景与动机\n\n> Canonical added this note'
    );
    // current 在最后一段后添加内容
    const currentContent = baseContent.replace(
      '- [ ] AC-1: agent done 清理 pending-done',
      '- [ ] AC-1: agent done 清理 pending-done\n- [ ] AC-2: Current added this'
    );

    writeFileSync(join(canonical, 'spec.md'), canonicalContent, 'utf-8');
    writeActiveSpecJson(cwd, canonical, structuredSpecJson(canonicalContent), 'T-AGENT');

    writeFileSync(join(tasks, 'spec.md'), currentContent, 'utf-8');
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(currentContent), 'T-AGENT');

    // 运行 check 并指定 --fix-drift merge 
    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift merge`, cwd);
    assert.equal(result.code, 0);

    const mergedContent = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    assert.match(mergedContent, /Canonical added this note/);
    assert.match(mergedContent, /Current added this/);

    // 2. 有冲突三方合并测试
    // 制造在同一位置进行不同修改的冲突漂移
    const conflictCanonical = mergedContent.replace(
      'Canonical added this note',
      'Canonical Conflict Note'
    );
    const conflictCurrent = mergedContent.replace(
      'Canonical added this note',
      'Current Conflict Note'
    );

    writeFileSync(join(canonical, 'spec.md'), conflictCanonical, 'utf-8');
    writeActiveSpecJson(cwd, canonical, structuredSpecJson(conflictCanonical), 'T-AGENT');

    writeFileSync(join(tasks, 'spec.md'), conflictCurrent, 'utf-8');
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(conflictCurrent), 'T-AGENT');

    const conflictResult = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift merge`, cwd);
    assert.equal(conflictResult.code, 1);
    assert.match(conflictResult.out, /三方合并已执行但存在冲突/);
    assert.match(conflictResult.out, /冲突文件: spec.md/);

    const conflictMergedContent = readFileSync(join(tasks, 'spec.md'), 'utf-8');
    assert.match(conflictMergedContent, /<<<<<<<|=======|>>>>>>>/);

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

  it('check reads spec.json before stale spec.md views', () => {
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

    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /全部通过/);
    // R-287: check 入口自愈收敛漂移，不再在 next_hint 里指挥手动 write-spec。
    assert.match(result.out, /spec\.md 机器真理源漂移已自愈/);
    assert.doesNotMatch(result.out, /source\.content_sha256 不一致/);
    assert.doesNotMatch(result.out, /recommended_command: docpath write-spec --stdin/);
    const healedSpec = readFileSync(join(canonical, 'spec.md'), 'utf-8');
    assert.match(healedSpec, /FR-1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check blocks strategic workflow or UI changes without confirmed major change gate', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-strategic-change-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1']);
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
    assert.match(result.out, /检测到未提交的重大变更/);

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
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(confirmedSpec, {
      major_change_gate: {
        required: true,
        types: ['UI 信息架构 / 用户主路径', '工作流 / Agent 行为'],
        user_confirmed: '2026-06-08 用户确认协议模板重大变更',
        decision_brief_markdown: [
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
        ].join('\n'),
      },
    }));

    const confirmed = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const confirmedLastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(confirmed.code, 0);
    assert.match(confirmedLastCheck, /重大决策确认检查/);
    assert.match(confirmed.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check enforces structured decision_brief fields when major change gate is required', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-structured-brief-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeDoneBreadcrumb(workspace, 'T-AGENT', ['S1']);
    mkdirSync(join(cwd, 'templates'), { recursive: true });
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'templates', 'AGENTS.md'), '# Agent Protocol\n\nOld rule.\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });

    writeFileSync(join(cwd, 'templates', 'AGENTS.md'), '# Agent Protocol\n\nNew rule.\n');

    // Case 1: missing required fields in Decision Brief (e.g. empty chosen/options)
    const invalidSpec = `${readFileSync(join(tasks, 'spec.md'), 'utf-8').replace('## 5. 验收标准', [
      '## 4.1 重大变更门禁',
      '',
      '### 是否涉及重大变更',
      '- [x] 是，需要用户确认',
      '',
      '### Decision Brief',
      '- 当前问题: 测试',
      '- 用户确认: N/A',
      '',
      '## 5. 验收标准',
    ].join('\n'))}`;
    writeFileSync(join(tasks, 'spec.md'), invalidSpec);
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(invalidSpec, {
      major_change_gate: {
        required: true,
        types: ['工作流 / Agent 行为'],
        user_confirmed: 'N/A', // Invalid user confirmation, should block
        decision_brief_markdown: [
          '- 当前问题: 测试',
          '- 用户确认: N/A',
        ].join('\n'),
      },
    }));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    assert.equal(result.code, 1);
    assert.match(result.out, /重大决策确认检查/);

    // Case 2: fully structured decision brief passes
    const validSpec = `${readFileSync(join(tasks, 'spec.md'), 'utf-8').replace('## 5. 验收标准', [
      '## 4.1 重大变更门禁',
      '',
      '### 是否涉及重大变更',
      '- [x] 是，需要用户确认',
      '',
      '### Decision Brief',
      '- 当前问题: 测试协议模板重大变更门禁',
      '- 可选方案:',
      '  - 方案 A: 直接修改',
      '  - 方案 B: 先确认',
      '- 推荐方案: 方案 B',
      '- 决策理由: 方案 B 安全',
      '- 用户确认: 2026-06-08 用户确认协议模板重大变更',
      '',
      '## 5. 验收标准',
    ].join('\n'))}`;
    writeFileSync(join(tasks, 'spec.md'), validSpec);
    writeActiveSpecJson(cwd, tasks, structuredSpecJson(validSpec, {
      major_change_gate: {
        required: true,
        types: ['工作流 / Agent 行为'],
        user_confirmed: '2026-06-08 用户确认协议模板重大变更',
        decision_brief_markdown: [
          '- 当前问题: 测试协议模板重大变更门禁',
          '- 可选方案:',
          '  - 方案 A: 直接修改',
          '  - 方案 B: 先确认',
          '- 推荐方案: 方案 B',
          '- 决策理由: 方案 B 安全',
          '- 用户确认: 2026-06-08 用户确认协议模板重大变更',
        ].join('\n'),
      },
    }));

    const confirmed = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    assert.equal(confirmed.code, 0);
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
      ...REQUIRED_UI_GATE_SECTION,
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
    writeValidFrontendStack(tasks);
    writeFileSync(join(tasks, 'design-preview.md'), CONCRETE_PREVIEW);
    writeFileSync(join(tasks, 'visual-acceptance.md'), '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(12));
    writeFileSync(join(tasks, 'ui-brief.md'), [
      '# UI Blueprint',
      '## 1. Screen Contract',
      '## 2. Flow Contract',
      '## 3. Layout Contract',
      '## 4. Component Contract',
      '## 5. State Contract',
      '## 6. Visual Contract',
      '## 7. Generation Contract',
      '## 8. Acceptance Contract',
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
      ...REQUIRED_UI_GATE_SECTION,
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
    writeValidFrontendStack(tasks);
    writeFileSync(join(tasks, 'design-preview.md'), CONCRETE_PREVIEW);
    writeFileSync(join(tasks, 'visual-acceptance.md'), '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(12));
    writeFileSync(join(tasks, 'ui-brief.md'), [
      '# UI Blueprint',
      '## 1. Screen Contract',
      '## 2. Flow Contract',
      '## 3. Layout Contract',
      '## 4. Component Contract',
      '## 5. State Contract',
      '## 6. Visual Contract',
      '## 7. Generation Contract',
      '## 8. Acceptance Contract',
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
    writePendingDoneFixture(join(tmpdir_path, '.docpath', 'workspace'), {
      task_id: 'T-AGENT',
      entered_at: '2026-06-01T00:00:00.000Z',
      phase: 'executing',
      warned: false,
    });

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
    writePendingDoneFixture(join(tmpdir_path, '.docpath', 'workspace'), {
      task_id: 'T-OTHER',
      entered_at: '2026-06-01T00:00:00.000Z',
      phase: 'executing',
      warned: false,
    });

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
    writePendingDoneFixture(join(tmpdir_path, '.docpath', 'workspace'), {
      task_id: 'T-AGENT',
      entered_at: '2026-05-29T00:00:00.000Z',
      phase: 'executing',
      warned: false,
    });

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

  it('status --agent emits parseable diagnostic output', () => {
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
    assert.match(out, /^route_hint:/m);
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

describe('check entry stage ordering contract (R-305)', () => {
  it('protocol blocks drift fails loud BEFORE expensive runners (早退契约)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-order-'));
    const { tasks } = mkExecWorkspace(cwd);
    void tasks;
    // fixture 模板根: blocks 源与 canonical 注入区人为分叉
    const tplDir = join(cwd, 'fixture-templates');
    mkdirSync(join(tplDir, 'protocols', 'blocks'), { recursive: true });
    writeFileSync(join(tplDir, 'protocols', 'blocks', 'demo.md'), '块源新内容\n');
    writeFileSync(join(tplDir, 'protocols', 'CLAUDE.md'), [
      '# Fixture Protocol',
      '',
      '<!-- docpath:block demo -->',
      '陈旧注入区内容',
      '<!-- /docpath:block -->',
      '',
    ].join('\n'));

    let out = '';
    let code = 0;
    try {
      out = execSync(`node ${CLI} check --cwd ${cwd} --skip-tests --skip-lint`, {
        cwd,
        encoding: 'utf-8',
        timeout: 20000,
        env: { ...process.env, DOCPATH_TEMPLATES_DIR: tplDir },
      });
    } catch (error) {
      code = error.status ?? 1;
      out = `${error.stdout?.toString() || ''}${error.stderr?.toString() || ''}`;
    }

    assert.notEqual(code, 0, 'blocks 漂移必须使 check 失败');
    assert.match(out, /协议共享契约注入区与块源不一致/);
    assert.match(out, /docpath render --view protocols/);
    // 早退契约: 失败必须发生在编译/测试 runner 之前
    assert.doesNotMatch(out, /编译检查/, '不得进入编译检查段落');
    assert.doesNotMatch(out, /测试检查/, '不得进入测试检查段落');
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('check environment failure classification (S4)', () => {
  it('tags runner failures as environment_failure when command is not found', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-env-'));
    mkExecWorkspace(cwd);
    // 写一个 tsconfig.json 触发 typecheck，但没有 node_modules/.bin/tsc
    // 直接用 npx 调不存在的包，模拟环境失败
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      scripts: {},
    }, null, 2) + '\n');
    writeFileSync(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }, null, 2));
    // 不安装 node_modules，npx tsc 会失败且输出包含 ENOENT 或 command not found

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    // 编译检查应该失败
    assert.match(result.out, /编译检查|TypeScript/);
    // last-check.json 应该写入检查结果
    const lastCheckJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.json'), 'utf-8'));
    assert.ok(lastCheckJson.checks.length > 0, 'last-check.json 应有检查项');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('looksLikeEnvironmentFailure detects common patterns', async () => {
    const { looksLikeEnvironmentFailure } = await import('../dist/commands/check/runners.js');
    // 环境失败模式
    assert.equal(looksLikeEnvironmentFailure('sh: line 1: pnpm: command not found'), true);
    assert.equal(looksLikeEnvironmentFailure('Error: Cannot find module /path/to/node_modules/.bin/tsc'), true);
    assert.equal(looksLikeEnvironmentFailure('spawn /bin/sh ENOENT'), true);
    assert.equal(looksLikeEnvironmentFailure('npm: command not found'), true);
    assert.equal(looksLikeEnvironmentFailure('Error: attempt to write a readonly database'), true);
    assert.equal(looksLikeEnvironmentFailure('SQLITE_READONLY: attempt to write a readonly database'), true);
    assert.equal(looksLikeEnvironmentFailure('EROFS: read-only file system, open projects.sqlite'), true);
    // 代码失败模式
    assert.equal(looksLikeEnvironmentFailure('Type error: Property foo does not exist'), false);
    assert.equal(looksLikeEnvironmentFailure('AssertionError: expected true to be false'), false);
    assert.equal(looksLikeEnvironmentFailure('FAIL tests/foo.test.ts'), false);
  });

  it('looksLikeToolchainUnavailable detects readonly database and sandbox constraints for check_env_exempt', async () => {
    const { looksLikeToolchainUnavailable } = await import('../dist/commands/check/runners.js');
    assert.equal(looksLikeToolchainUnavailable('command not found: tsc'), true);
    assert.equal(looksLikeToolchainUnavailable('spawn /bin/sh ENOENT'), true);
    assert.equal(looksLikeToolchainUnavailable('Error: attempt to write a readonly database'), true);
    assert.equal(looksLikeToolchainUnavailable('SQLITE_READONLY'), true);
    assert.equal(looksLikeToolchainUnavailable('EROFS: read-only file system'), true);
    assert.equal(looksLikeToolchainUnavailable('AssertionError: expected 1 to equal 2'), false);
  });
});

describe('healStructuredMarkdownDrift (R-287 方案 A 自愈原语)', () => {
  let writeActiveTaskFile;
  let healStructuredMarkdownDrift;

  before(async () => {
    ({ writeActiveTaskFile } = await import('../dist/utils/task-files.js'));
    ({ healStructuredMarkdownDrift } = await import('../dist/utils/structured-heal.js'));
  });

  const HEAL_SPEC = [
    '# T-HEAL - Heal Test',
    '',
    '## 1. 背景与动机',
    '',
    '原始叙述。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: 第一需求',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 隔离',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 验收一',
    '',
  ].join('\n');

  function mkHealWorkspace() {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-heal-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'T-HEAL'), { recursive: true });
    return { cwd, dp, canonical: join(dp, 'tasks', 'T-HEAL'), current: join(dp, 'tasks', 'current') };
  }

  it('enforces json-truth markers while absorbing markdown additions and narrative (zero loss)', async () => {
    const { cwd, dp, canonical, current } = mkHealWorkspace();
    try {
      await writeActiveTaskFile(dp, 'T-HEAL', 'spec.md', HEAL_SPEC);
      // 手改 current 工作别名 md：翻勾 FR-1、新增 FR-9、加叙述段 → 漂移
      const edited = readFileSync(join(current, 'spec.md'), 'utf-8')
        .replace('- [ ] FR-1: 第一需求', '- [x] FR-1: 第一需求\n- [ ] FR-9: 手写新增')
        .replace('原始叙述。', '原始叙述。\n\n手写的新叙述段。');
      writeFileSync(join(current, 'spec.md'), edited);

      const result = await healStructuredMarkdownDrift(dp, 'T-HEAL', 'spec.md');
      assert.equal(result.healed, true);
      assert.deepEqual(result.enforced_markers, ['FR-1']);

      const healedMd = readFileSync(join(canonical, 'spec.md'), 'utf-8');
      assert.match(healedMd, /- \[ \] FR-1: 第一需求/, '勾选态必须回写为 json 真源状态');
      assert.match(healedMd, /FR-9: 手写新增/, 'markdown 新增条目必须保留');
      assert.match(healedMd, /手写的新叙述段。/, '叙述段必须逐字保留');
      const healedJson = JSON.parse(readFileSync(join(canonical, 'spec.json'), 'utf-8'));
      assert.ok(healedJson.functional_requirements.some((item) => item.id === 'FR-9'), '新增条目必须吸收进 json');

      const second = await healStructuredMarkdownDrift(dp, 'T-HEAL', 'spec.md');
      assert.equal(second.healed, false, '自愈必须幂等：二次调用报 no-drift');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('restores a gutted markdown view from json truth instead of absorbing the destruction', async () => {
    const { cwd, dp, canonical, current } = mkHealWorkspace();
    try {
      await writeActiveTaskFile(dp, 'T-HEAL', 'spec.md', HEAL_SPEC);
      writeFileSync(join(current, 'spec.md'), '# T-HEAL - Heal Test\n\n只剩标题的坏视图\n');

      const result = await healStructuredMarkdownDrift(dp, 'T-HEAL', 'spec.md');
      assert.equal(result.healed, true);
      assert.match(result.reason, /恢复/);

      const healedMd = readFileSync(join(canonical, 'spec.md'), 'utf-8');
      assert.match(healedMd, /FR-1/, '结构化条目必须从 json 真源恢复');
      assert.match(healedMd, /只剩标题的坏视图/, '原 markdown 剩余文本必须零丢失保留（自愈保留小节）');
      const healedJson = JSON.parse(readFileSync(join(canonical, 'spec.json'), 'utf-8'));
      assert.ok(healedJson.functional_requirements.some((item) => item.id === 'FR-1'), '破坏不得传播进 json 真源');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('converges the crash window where markdown was written without a json update', async () => {
    const { cwd, dp, canonical, current } = mkHealWorkspace();
    try {
      await writeActiveTaskFile(dp, 'T-HEAL', 'spec.md', HEAL_SPEC);
      // 模拟崩溃窗口：md 已更新（含结构化条目），json 未跟上
      writeFileSync(join(current, 'spec.md'), HEAL_SPEC.replace('原始叙述。', '崩溃前写入的叙述。'));

      const result = await healStructuredMarkdownDrift(dp, 'T-HEAL', 'spec.md');
      assert.equal(result.healed, true);

      const healedMd = readFileSync(join(canonical, 'spec.md'), 'utf-8');
      assert.match(healedMd, /崩溃前写入的叙述。/);
      const second = await healStructuredMarkdownDrift(dp, 'T-HEAL', 'spec.md');
      assert.equal(second.healed, false, '收敛后 sha 必须一致');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
