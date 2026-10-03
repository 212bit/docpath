import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-lease-stash-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace', 'sessions'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-active'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: lease-stash-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    task_id: 'T-active',
    task_title: 'Active Task',
    status: 'executing',
    phase: 'executing',
    step: 'S1',
  }, null, 2));

  // Write an active session owned by parent process (which is alive!)
  const parentPid = process.ppid || process.pid;
  writeFileSync(join(dp, 'workspace', 'sessions', 'worker-1.json'), JSON.stringify({
    schema_version: 1,
    kind: 'session',
    session_id: 'worker-1',
    pid: parentPid,
    cwd,
    command: 'docpath go --step S1',
    task_id: 'T-active',
    step: 'S1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, null, 2));

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('Active Session Lease & Task Stash Protection', () => {
  it('blocks task stash when task is leased by another live session', () => {
    const cwd = mkWorkspace();
    try {
      assert.throws(() => {
        run('task stash "attempt preempt"', cwd);
      }, /正在由活跃会话 'worker-1' .* 执行中，禁止跨会话强行挂起/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows task stash when --force is supplied', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('task stash "force stash" --force --no-git', cwd);
      assert.match(out, /当前任务已暂存: T-active/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('blocks task abort when task is leased by another live session unless --force', () => {
    const cwd = mkWorkspace();
    try {
      assert.throws(() => {
        run('task abort', cwd);
      }, /正在由活跃会话 'worker-1' .* 执行中，禁止跨会话强行挂起/);

      const out = run('task abort --force', cwd);
      assert.match(out, /当前任务已废弃: T-active/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
