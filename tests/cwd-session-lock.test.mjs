import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd, env = {}) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 20000,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function mkProject(name) {
  const cwd = mkdtempSync(join(tmpdir(), `dp-cwd-lock-${name}-`));
  execSync('git init', { cwd });

  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: lock-test\n');
  writeFileSync(
    join(cwd, '.docpath', 'workspace', 'state.json'),
    JSON.stringify({
      level: 2,
      workflow_profile: 'standard',
      state: 'idle',
      task_id: '',
      task_title: 'Lock Test',
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  );
  writeFileSync(join(cwd, '.docpath', 'workspace', 'current.md'), '# Current Workspace\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

describe('Cwd-Session Lock Guard', () => {
  it('default session bypasses cwd check across different directories', () => {
    const cwd1 = mkProject('p1');
    const cwd2 = mkProject('p2');
    try {
      const res1 = run('status --agent', cwd1, { DOCPATH_SESSION: 'default' });
      assert.equal(res1.code, 0, `cwd1 failed: ${res1.out}`);

      const res2 = run('status --agent', cwd2, { DOCPATH_SESSION: 'default' });
      assert.equal(res2.code, 0, `cwd2 failed: ${res2.out}`);
    } finally {
      rmSync(cwd1, { recursive: true, force: true });
      rmSync(cwd2, { recursive: true, force: true });
    }
  });

  it('custom session bound to worktree1 blocks execution from worktree2 (same repo)', () => {
    // Create a main repo with two worktrees to simulate concurrent agent scenario
    const mainRepo = mkdtempSync(join(tmpdir(), 'dp-cwd-lock-main-'));
    execSync('git init', { cwd: mainRepo });
    execSync('git commit --allow-empty -m "init"', { cwd: mainRepo });

    const wt2Dir = mkdtempSync(join(tmpdir(), 'dp-cwd-lock-wt2-'));
    rmSync(wt2Dir, { recursive: true, force: true });
    execSync(`git worktree add -b wt2 ${wt2Dir}`, { cwd: mainRepo });

    // Bootstrap docpath workspace in both worktrees
    for (const dir of [mainRepo, wt2Dir]) {
      mkdirSync(join(dir, '.docpath', 'workspace'), { recursive: true });
      writeFileSync(join(dir, '.docpath', 'config.yaml'), 'project:\n  name: lock-test\n');
      writeFileSync(
        join(dir, '.docpath', 'workspace', 'state.json'),
        JSON.stringify({
          level: 2, workflow_profile: 'standard', state: 'idle',
          task_id: '', task_title: 'Lock Test', phase: 'idle', gate: 'none',
          current_step: '等待下一步',
          started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
      );
      writeFileSync(join(dir, '.docpath', 'workspace', 'current.md'), '# Current Workspace\n');
      writeFileSync(join(dir, '.docpath', 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
    }

    const customSession = 'codex-test-session';
    try {
      // Create session file in mainRepo to simulate it being bound there
      const sessionsDir = join(mainRepo, '.docpath', 'workspace', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(
        join(sessionsDir, `${customSession}.json`),
        JSON.stringify({
          schema_version: 1, kind: 'session', session_id: customSession,
          pid: process.pid, cwd: mainRepo, command: 'status',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
      );

      // mainRepo itself should be allowed
      const res1 = run('status --agent', mainRepo, { DOCPATH_SESSION: customSession });
      assert.equal(res1.code, 0, `mainRepo should be allowed: ${res1.out}`);

      // wt2 is a different worktree in the same repo — should be blocked
      const res2 = run('status --agent', wt2Dir, { DOCPATH_SESSION: customSession });
      assert.notEqual(res2.code, 0, 'wt2 should be blocked by cwd-lock');
      assert.match(res2.out, /跨目录门禁拦截/, 'Error message should mention cwd-lock');
    } finally {
      execSync(`git worktree remove --force ${wt2Dir}`, { cwd: mainRepo });
      rmSync(mainRepo, { recursive: true, force: true });
    }
  });

  it('bypassed commands are not blocked even with a cross-cwd session', () => {
    const cwd1 = mkProject('p1');
    const cwd2 = mkProject('p2');
    const customSession = 'codex-bypass-test';
    try {
      run('status --agent', cwd1, { DOCPATH_SESSION: customSession });

      const res = run('worktree list', cwd2, { DOCPATH_SESSION: customSession });
      assert.equal(res.code, 0, `worktree list should bypass cwd check: ${res.out}`);
    } finally {
      rmSync(cwd1, { recursive: true, force: true });
      rmSync(cwd2, { recursive: true, force: true });
    }
  });
});
