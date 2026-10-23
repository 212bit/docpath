import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { assertNoNonDocPathChangesForExecutionStart, detectUncommittedNonDocPathFiles, renderCommitReminder } from '../dist/utils/git-dirty-guard.js';

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

function writeDocpathWorkspace(cwd, { phase = 'idle', state = 'idle', taskId = '', taskTitle = '' } = {}) {
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
}

function mkBaseWorkspace(options = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-dirty-guard-'));
  writeDocpathWorkspace(cwd, options);
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
      const promoteDir = join(cwd, '.docpath', 'backlog');
      const promoteFile = readdirSync(promoteDir).find((name) => name === 'R-001.md' || /^R-001-.*\.md$/.test(name));
      assert.ok(promoteFile, 'R-001 item file should exist');
      const item = readFileSync(join(promoteDir, promoteFile), 'utf-8');
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
      assert.match(result.out, /docpath go --step S1 --adopt/);
      assert.match(result.out, /--accept-dirty "<列出文件及原因>"/);
      assert.doesNotMatch(result.out, /recover current-task edits before go/);
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

  describe('detectUncommittedNonDocPathFiles', () => {
    it('returns empty for clean repo', () => {
      const cwd = mkBaseWorkspace();
      try {
        initGitRepo(cwd);
        const res = detectUncommittedNonDocPathFiles(cwd);
        assert.deepEqual(res, { nonDocPathFiles: [], count: 0 });
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('returns empty when only .docpath files are dirty', () => {
      const cwd = mkBaseWorkspace();
      try {
        initGitRepo(cwd);
        writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'dirty\n');
        const res = detectUncommittedNonDocPathFiles(cwd);
        assert.deepEqual(res, { nonDocPathFiles: [], count: 0 });
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('returns files and count when non-docpath files are dirty', () => {
      const cwd = mkBaseWorkspace();
      try {
        initGitRepo(cwd);
        writeFileSync(join(cwd, 'README.md'), 'dirty\n');
        const res = detectUncommittedNonDocPathFiles(cwd);
        assert.deepEqual(res, { nonDocPathFiles: ['README.md'], count: 1 });
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  describe('renderCommitReminder', () => {
    it('returns empty string for empty input', () => {
      const res = renderCommitReminder([]);
      assert.equal(res, '');
    });

    it('returns warning with banner, files, command suggestion, and disclaimer', () => {
      const files = ['src/app.ts', 'tests/app.test.ts'];
      const res = renderCommitReminder(files);

      // (a) banner
      assert.match(res, /警告/);
      assert.match(res, /未提交/);
      // (b) file list
      assert.match(res, /src\/app\.ts/);
      assert.match(res, /tests\/app\.test\.ts/);
      // (c) commit command suggestion
      assert.match(res, /git commit/);
      // (d) disclaimer
      assert.match(res, /免责声明/);
    });
  });
  it('allows docs-index.json (docs.md retired by R-336) as closeout-owned paths during execution start', () => {
    const cwd = mkBaseWorkspace({ phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, '.docpath', 'docs-index.json'), '{"version":1,"entries":[]}\n');
      // Must not throw when only DocPath index artifacts are dirty
      assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S1',
      });
      // R-336: docs.md 已下线不再生成，不再属于 closeout-owned 白名单（普通文件语义）
      writeFileSync(join(cwd, '.docpath', 'docs.md'), '# Docs\n');
      assert.throws(() => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S1',
      }));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows dirty tracked files when running on the same active task (non-worktree)', () => {
    const cwd = mkBaseWorkspace({ phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
      git(cwd, ['add', 'src-app.ts']);
      git(cwd, ['commit', '-m', 'add src-app.ts']);
      writeFileSync(join(cwd, 'src-app.ts'), 'modified\n');

      assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S1',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still blocks untracked business files in non-worktree mode even if same active task', () => {
    const cwd = mkBaseWorkspace({ phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'untracked-src.ts'), 'new file\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        }),
        /当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('execution-start error suggests git add ownership claim for blocked untracked files (R-330)', () => {
    const cwd = mkBaseWorkspace({ phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'untracked-src.ts'), 'new file\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        }),
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          assert.match(message, /git add untracked-src\.ts/);
          assert.match(message, /认领归属/);
          return true;
        }
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('execution-start error keeps run start suggestion for tracked-only blocked files (R-330)', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'tracked-src.ts'), 'original\n');
      git(cwd, ['add', 'tracked-src.ts']);
      git(cwd, ['commit', '-m', 'add tracked-src.ts']);
      writeFileSync(join(cwd, 'tracked-src.ts'), 'modified\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        }),
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          assert.match(message, /docpath go --step S1 --adopt/);
          assert.match(message, /--accept-dirty "<列出文件及原因>"/);
          assert.doesNotMatch(message, /recover current-task edits before go/);
          assert.doesNotMatch(message, /git add /);
          return true;
        }
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows dirty untracked and tracked files for the same active task in a real linked git worktree (tracked-copy contract, no symlinks)', () => {
    const mainCwd = mkdtempSync(join(tmpdir(), 'dp-dirty-guard-main-'));
    try {
      // Main checkout with a tracked source file; backlog/rules are plain
      // tracked directories per the R-273 tracked-copy contract.
      mkdirSync(join(mainCwd, '.docpath', 'backlog'), { recursive: true });
      mkdirSync(join(mainCwd, '.docpath', 'rules'), { recursive: true });
      writeFileSync(join(mainCwd, '.docpath', 'backlog', 'backlog.md'), '# Backlog\n');
      writeFileSync(join(mainCwd, '.docpath', 'rules', 'style.md'), '# Rules\n');
      writeFileSync(join(mainCwd, 'src-app.ts'), 'original\n');
      initGitRepo(mainCwd);

      // Real linked worktree: `.git` in the worktree root is a gitdir pointer file.
      const wtCwd = join(mainCwd, '.worktrees', 'wt');
      git(mainCwd, ['worktree', 'add', wtCwd, '-b', 'wt-branch']);
      writeDocpathWorkspace(wtCwd, { phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });

      writeFileSync(join(wtCwd, 'src-app.ts'), 'modified\n');
      writeFileSync(join(wtCwd, 'untracked-src.ts'), 'new file\n');

      assertNoNonDocPathChangesForExecutionStart(wtCwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S1',
      });
    } finally {
      rmSync(mainCwd, { recursive: true, force: true });
    }
  });

  it('allows dirty tracked files of the same task while phase is checking or reviewing (post-check fixup)', () => {
    for (const phase of ['checking', 'reviewing']) {
      const cwd = mkBaseWorkspace({ phase, state: phase, taskId: 'T-TEST', taskTitle: 'Test' });
      try {
        initGitRepo(cwd);
        writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
        git(cwd, ['add', 'src-app.ts']);
        git(cwd, ['commit', '-m', 'add src-app.ts']);
        writeFileSync(join(cwd, 'src-app.ts'), 'modified\n');

        assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        });
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  });

  it('still blocks untracked business files while phase is checking even for the same task', () => {
    const cwd = mkBaseWorkspace({ phase: 'checking', state: 'checking', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'untracked-src.ts'), 'new file\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        }),
        /当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows backlog bookkeeping dirt for new-task start (R-313)', () => {
    const cwd = mkBaseWorkspace({ phase: 'completed', state: 'completed' });
    try {
      initGitRepo(cwd);
      // 仅簿记脏文件: 新增条目 + 索引变更(accept/capture 的典型产物)
      mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'backlog', 'R-099.md'), '---\nid: R-099\n---\n新条目\n');
      writeFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), '# index updated\n');

      const result = runResult(['quick', 'Tiny fix'], cwd);
      assert.doesNotMatch(result.out, /当前 Git worktree 存在未提交变更/, '簿记脏文件不得阻塞开任务');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still blocks when business files mix with backlog bookkeeping (R-313)', () => {
    const cwd = mkBaseWorkspace({ phase: 'completed', state: 'completed' });
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'backlog', 'R-099.md'), 'entry\n');
      writeFileSync(join(cwd, 'README.md'), 'business dirt\n');

      const result = runResult(['quick', 'Tiny fix'], cwd);
      assert.equal(result.code, 1);
      assert.match(result.out, /README\.md/, '业务脏文件仍必须拦截');
      assert.doesNotMatch(result.out, /R-099\.md/, '簿记文件不应出现在拦截清单');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still blocks dirty files in cross-task scenarios', () => {
    const cwd = mkBaseWorkspace({ phase: 'executing', state: 'executing', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
      git(cwd, ['add', 'src-app.ts']);
      git(cwd, ['commit', '-m', 'add src-app.ts']);
      writeFileSync(join(cwd, 'src-app.ts'), 'modified\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-OTHER',
          step: 'S1',
        }),
        /当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows dirty tracked files when replanning task returns to planning phase with prior breadcrumbs (R-444)', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
      git(cwd, ['add', 'src-app.ts']);
      git(cwd, ['commit', '-m', 'add src-app.ts']);
      writeFileSync(join(cwd, 'src-app.ts'), 'modified by S1\n');

      // Add prior step breadcrumb for T-TEST
      writeFileSync(
        join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl'),
        JSON.stringify({ taskId: 'T-TEST', step: 'S1', status: 'done', action: 'step_pass', timestamp: new Date().toISOString() }) + '\n',
      );

      // Must allow tracked modifications during replanning
      assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S2',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  function writeTwoStepTask(cwd) {
    writeExecutableTask(cwd);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Implement dirty guard',
      '- [ ] S1: Implement dirty guard',
      '- **描述**: 进入执行',
      '- **验收条件**: guard 正确',
      '- **依赖**: 无',
      '',
      '### S2: Cross the step boundary',
      '- [ ] S2: Cross the step boundary',
      '- **描述**: 带着本任务未提交代码进入下一步',
      '- **验收条件**: 下一步直接放行',
      '- **依赖**: 无',
      '',
    ].join('\n'));
  }

  it('step-pass carries the task\'s own uncommitted file without accept-dirty, then blocks a foreign file', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-DIRTY', taskTitle: 'Dirty Guard' });
    try {
      writeTwoStepTask(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      initGitRepo(cwd);
      run(['go', '--step', 'S1'], cwd);
      writeFileSync(join(cwd, 'src', 'own-task.ts'), 'export const own = true;\n');

      const out = run(['step-pass', '--skip-verify'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      const baseline = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'task-dirty-baseline.json'), 'utf-8'));
      const crumbs = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');

      assert.doesNotMatch(out, /--accept-dirty/);
      assert.doesNotMatch(out, /拒绝进入执行步骤/);
      assert.doesNotMatch(crumbs, /accept-dirty/);
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S2');
      assert.equal(baseline.task_id, 'T-DIRTY');
      assert.equal(typeof baseline.paths['src/own-task.ts'], 'string');

      writeFileSync(join(cwd, 'src', 'foreign.ts'), 'export const foreign = true;\n');
      const blocked = runResult(['go', '--step', 'S2'], cwd);
      assert.equal(blocked.code, 1);
      assert.match(blocked.out, /src\/foreign\.ts/);
      assert.doesNotMatch(blocked.out, /src\/own-task\.ts/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows a baseline-owned edit when the task phase is not active, and still blocks a new foreign file', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
      git(cwd, ['add', 'src-app.ts']);
      git(cwd, ['commit', '-m', 'add src-app.ts']);
      writeFileSync(join(cwd, 'src-app.ts'), 'edited during the task\n');
      writeFileSync(join(cwd, '.docpath', 'workspace', 'task-dirty-baseline.json'), JSON.stringify({
        task_id: 'T-TEST',
        recorded_at: '2026-10-22T00:00:00.000Z',
        updated_at: '2026-10-22T00:00:00.000Z',
        source: 'step',
        paths: { 'src-app.ts': 'owned' },
      }));

      assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-TEST',
        step: 'S2',
      });

      writeFileSync(join(cwd, 'foreign.ts'), 'concurrent edit\n');
      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S2',
        }),
        (error) => {
          const message = error instanceof Error ? error.message : String(error);
          assert.match(message, /foreign\.ts/);
          assert.doesNotMatch(message, /src-app\.ts/);
          return true;
        },
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ignores DocPath promote backups on execution start and new-task start', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning_done', taskId: 'T-DIRTY', taskTitle: 'Dirty Guard' });
    try {
      writeExecutableTask(cwd);
      initGitRepo(cwd);
      const backupDir = join(cwd, '.docpath', 'tasks', 'promote-backups', '2026-10-22T00-00-00-000Z');
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, 'spec.md'), '# promoted alias backup\n');

      const out = run(['go', '--step', 'S1'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.doesNotMatch(out, /拒绝进入执行步骤/);
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }

    const fresh = mkBaseWorkspace({ phase: 'completed', state: 'completed' });
    try {
      initGitRepo(fresh);
      const backupDir = join(fresh, '.docpath', 'tasks', 'promote-backups', '2026-10-22T00-00-00-000Z');
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, 'plan.md'), '# backup\n');
      const result = runResult(['quick', 'Tiny fix'], fresh);
      assert.doesNotMatch(result.out, /当前 Git worktree 存在未提交变更/);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('start --adopt claims workspace edits without logging accept-dirty', () => {
    const cwd = mkBaseWorkspace({ phase: 'completed', state: 'completed' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'uncommitted.ts'), 'export const adopted = true;\n');

      const out = run(['start', '认领已有改动', '--adopt', '--draft'], cwd);
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      const baseline = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'task-dirty-baseline.json'), 'utf-8'));
      const crumbs = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');

      assert.match(out, /--adopt 已认领工作区变更至步骤 S1/);
      assert.doesNotMatch(out, /accept-dirty/);
      assert.doesNotMatch(crumbs, /accept-dirty/);
      assert.match(crumbs, /go --adopt: claimed working tree changes into S1/);
      assert.equal(state.phase, 'executing');
      assert.equal(typeof baseline.paths['uncommitted.ts'], 'string');
      assert.equal(baseline.task_id, state.task_id);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still blocks brand-new task in planning phase without prior breadcrumbs when dirty tracked files exist (R-444)', () => {
    const cwd = mkBaseWorkspace({ phase: 'planning', state: 'planning', taskId: 'T-TEST', taskTitle: 'Test' });
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'src-app.ts'), 'original\n');
      git(cwd, ['add', 'src-app.ts']);
      git(cwd, ['commit', '-m', 'add src-app.ts']);
      writeFileSync(join(cwd, 'src-app.ts'), 'modified before task start\n');

      // No breadcrumbs for T-TEST
      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
          taskId: 'T-TEST',
          step: 'S1',
        }),
        /当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
