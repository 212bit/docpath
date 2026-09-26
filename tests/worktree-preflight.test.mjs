import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-wt-preflight-'));
  execSync('git init -b main', { cwd });
  execSync('git config user.name "Tester"', { cwd });
  execSync('git config user.email "tester@example.com"', { cwd });

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(cwd, 'src'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: preflight-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Preflight Test\n');
  writeFileSync(join(cwd, 'src', 'index.ts'), '// initial\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    schema_version: 1,
    phase: 'idle',
    task_id: null,
  }, null, 2));

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: { ...process.env, ...env } });
}

describe('docpath worktree preflight conflict detection', () => {
  it('detects clean state when no conflicts exist', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-1', cwd);
      run('worktree create feat-2', cwd);

      const out = run('worktree conflicts', cwd);
      assert.match(out, /DocPath Worktree 并发前置冲突体检报告/);
      assert.match(out, /协同状态良好/);

      const jsonOut = JSON.parse(run('worktree preflight --json', cwd));
      assert.equal(jsonOut.passed, true);
      assert.equal(jsonOut.hasBlockingConflicts, false);
      assert.equal(jsonOut.fileOverlaps.length, 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects cross-worktree file modification overlaps', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-a', cwd);
      run('worktree create feat-b', cwd);

      const wtAPath = join(cwd, '.worktrees', 'feat-a');
      const wtBPath = join(cwd, '.worktrees', 'feat-b');

      // Both modify src/index.ts
      writeFileSync(join(wtAPath, 'src', 'index.ts'), '// modified by A\n');
      writeFileSync(join(wtBPath, 'src', 'index.ts'), '// modified by B\n');

      const out = run('worktree conflicts', cwd);
      assert.match(out, /【文件重叠】/);
      assert.match(out, /src\/index\.ts/);
      assert.match(out, /feat-a/);
      assert.match(out, /feat-b/);

      const jsonOut = JSON.parse(run('worktree conflicts --json', cwd));
      assert.equal(jsonOut.passed, false);
      assert.equal(jsonOut.hasBlockingConflicts, true);
      assert.equal(jsonOut.fileOverlaps.length, 1);
      assert.equal(jsonOut.fileOverlaps[0].file, 'src/index.ts');
      assert.equal(jsonOut.fileOverlaps[0].risk, 'high');

      // Test strict mode exit 1
      assert.throws(() => {
        run('worktree conflicts --strict', cwd);
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects in-flight backlog dependency conflict across worktrees', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-core', cwd);
      run('worktree create feat-ext', cwd);

      const wtCore = join(cwd, '.worktrees', 'feat-core');
      const wtExt = join(cwd, '.worktrees', 'feat-ext');

      // Core is working on R-100
      writeFileSync(join(wtCore, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-core',
        backlog_id: 'R-100',
      }, null, 2));

      // Ext is working on R-200 which depends on R-100
      writeFileSync(join(wtExt, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-ext',
        backlog_id: 'R-200',
      }, null, 2));

      mkdirSync(join(wtExt, '.docpath', 'tasks', 'current'), { recursive: true });
      writeFileSync(join(wtExt, '.docpath', 'tasks', 'current', 'spec.json'), JSON.stringify({
        id: 'T-ext',
        backlog_id: 'R-200',
        dependencies: ['R-100'],
      }, null, 2));

      const out = run('worktree conflicts', cwd);
      assert.match(out, /【依赖在途】/);
      assert.match(out, /R-100/);
      assert.match(out, /feat-core/);

      const jsonOut = JSON.parse(run('worktree conflicts --json', cwd));
      assert.equal(jsonOut.dependencyConflicts.length, 1);
      assert.equal(jsonOut.dependencyConflicts[0].dependencyId, 'R-100');
      assert.equal(jsonOut.dependencyConflicts[0].depWorktree, 'feat-core');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects active task duplicate claim collision', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-worker-1', cwd);
      run('worktree create feat-worker-2', cwd);

      const wt1 = join(cwd, '.worktrees', 'feat-worker-1');
      const wt2 = join(cwd, '.worktrees', 'feat-worker-2');

      // Both claiming R-300
      writeFileSync(join(wt1, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-300-1',
        backlog_id: 'R-300',
      }, null, 2));

      writeFileSync(join(wt2, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-300-2',
        backlog_id: 'R-300',
      }, null, 2));

      const out = run('worktree conflicts', cwd);
      assert.match(out, /需求重复认领/);
      assert.match(out, /R-300/);

      const jsonOut = JSON.parse(run('worktree conflicts --json', cwd));
      assert.equal(jsonOut.taskCollisions.length, 1);
      assert.equal(jsonOut.taskCollisions[0].backlogId, 'R-300');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs agent-friendly YAML format', () => {
    const cwd = mkGitRepo();
    try {
      const agentOut = run('worktree conflicts --agent', cwd);
      assert.match(agentOut, /agent_view:\s*worktree_conflicts/);
      assert.match(agentOut, /passed:\s*true/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
