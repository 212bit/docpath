import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`,
    };
  }
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initGitRepo(cwd) {
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'initial']);
}

function mkBaseWorkspace({ phase = 'idle', state = 'idle', taskId = '', taskTitle = '' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-dirty-guard-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: dirty-guard-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: taskId,
    task_title: taskTitle,
    phase,
    state,
    gate: 'none',
    current_step: phase === 'planning' ? 'plan ready' : 'waiting',
    started_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-06-18T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function writeAcceptedBacklog(cwd) {
  const backlogDir = join(cwd, '.docpath', 'backlog');
  mkdirSync(backlogDir, { recursive: true });
  writeFileSync(join(backlogDir, 'R-001-dirty-guard.md'), `---
id: R-001
title: Dirty Guard
status: accepted
priority: P1
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-06-18
---

## 背景

Dirty guard test.

## 验收

Dirty worktree is blocked before promotion.
`);
}

function writeExecutableTask(cwd) {
  const tasks = join(cwd, '.docpath', 'tasks', 'current');
  writeFileSync(join(tasks, 'spec.md'), [
    '# T-DIRTY - Dirty Guard',
    '',
    '## 1. 背景与动机',
    '',
    '测试 dirty worktree guard。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: go 在非 DocPath 脏改上阻断',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 测试隔离',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- dirty guard',
    '',
    '### 不包含',
    '- 外部依赖',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | guard | block / allow | block | 防止叠加开发 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### UI 设计门禁',
    '- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
    '- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: dirty guard 行为正确',
    '',
  ].join('\n'));
  writeFileSync(join(tasks, 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: Implement dirty guard',
    '- [ ] S1: Implement dirty guard',
    '- **描述**: 进入执行',
    '- **验收条件**: guard 正确',
    '- **依赖**: 无',
    '',
  ].join('\n'));
}

describe('dirty worktree guard', () => {
  it('quick refuses to start a new task on a dirty Git worktree', () => {
    const cwd = mkBaseWorkspace({ phase: 'completed', state: 'completed' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'README.md'), 'dirty\n');

      const result = runResult(['quick', 'Fix typo'], cwd);

      assert.equal(result.code, 1);
      assert.match(result.out, /docpath quick: 当前 Git worktree 存在未提交变更/);
      assert.match(result.out, /docpath changes --agent/);
      assert.match(result.out, /docpath worktree create <slug>/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('backlog promote refuses dirty worktrees before mutating backlog links', () => {
    const cwd = mkBaseWorkspace({ phase: 'idle', state: 'idle' });
    try {
      writeAcceptedBacklog(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'README.md'), 'dirty\n');

      const result = runResult(['backlog', 'promote', 'R-001'], cwd);
      const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-dirty-guard.md'), 'utf-8');

      assert.equal(result.code, 1);
      assert.match(result.out, /docpath backlog promote: 当前 Git worktree 存在未提交变更/);
      assert.match(result.out, /README\.md/);
      assert.match(item, /status: accepted/);
      assert.match(item, /task: null/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('backlog promote allows dirty target backlog evidence from capture', () => {
    const cwd = mkBaseWorkspace({ phase: 'idle', state: 'idle' });
    try {
      initGitRepo(cwd);

      run([
        'backlog',
        'capture',
        '--title',
        'Captured promote',
        '--background',
        'Captured backlog evidence.',
        '--acceptance',
        'Promote can consume its own dirty backlog files.',
      ], cwd);
      const out = run(['backlog', 'promote', 'R-001', '--draft'], cwd);
      const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001.md'), 'utf-8');
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));

      assert.match(out, /已 promote backlog 条目: R-001/);
      assert.match(item, /status: active/);
      assert.match(item, /task: T-/);
      assert.equal(state.phase, 'drafting');
      assert.match(state.task_id, /^T-/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('go refuses to enter execution when non-DocPath files are dirty', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-DIRTY', taskTitle: 'Dirty Guard' });
    try {
      writeExecutableTask(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'app.ts'), 'export const clean = true;\n');
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src', 'app.ts'), 'export const dirty = true;\n');

      const result = runResult(['go', '--step', 'S1'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));

      assert.equal(result.code, 1);
      assert.match(result.out, /docpath go: 当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/);
      assert.match(result.out, /src\/app\.ts/);
      assert.match(result.out, /docpath run start --step S1 --note "recover current-task edits before go"/);
      assert.equal(state.phase, 'planning');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('go refuses unrelated DocPath task evidence before execution', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-DIRTY', taskTitle: 'Dirty Guard' });
    try {
      writeExecutableTask(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, '.docpath', 'tasks', 'T-OTHER'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'tasks', 'T-OTHER', 'spec.md'), '# T-OTHER - Other Task\n');

      const result = runResult(['go', '--step', 'S1'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));

      assert.equal(result.code, 1);
      assert.match(result.out, /与当前任务无关或无法确认归属/);
      assert.match(result.out, /\.docpath\/tasks\/T-OTHER\/spec\.md/);
      assert.match(result.out, /docpath changes --agent/);
      assert.equal(state.phase, 'planning');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('go allows DocPath-only task evidence changes before execution', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-DIRTY', taskTitle: 'Dirty Guard' });
    try {
      writeExecutableTask(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), [
        '## 执行计划',
        '',
        '### S1: Implement dirty guard',
        '- [ ] S1: Implement dirty guard',
        '- **描述**: 进入执行（更新后的计划证据）',
        '- **验收条件**: guard 正确',
        '- **依赖**: 无',
        '',
      ].join('\n'));

      const out = run(['go', '--step', 'S1'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));

      assert.doesNotMatch(out, /dirty worktree|未提交变更/);
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('next routes idle dirty worktrees to changes instead of new work capture', () => {
    const cwd = mkBaseWorkspace({ phase: 'idle', state: 'idle' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'README.md'), 'dirty\n');

      const output = parse(run(['next', '--agent'], cwd));

      assert.equal(output.recommended_command, 'docpath changes --agent');
      assert.match(output.next_action, /未提交变更/);
      assert.doesNotMatch(output.recommended_command, /backlog capture/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
