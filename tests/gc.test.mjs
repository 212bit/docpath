import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-gc-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260601-active'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260531-old'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260530-orphan'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-20260529-done'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-20260601-active',
    task_title: 'Active',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'backlog', 'R-001-active.md'), [
    '---',
    'id: R-001',
    'title: Active',
    'status: active',
    'priority: P1',
    'level: 2',
    'source: test',
    'links:',
    '  task: T-20260601-active',
    '  spec: tasks/T-20260601-active/spec.md',
    'created_at: 2026-06-01',
    '---',
    '',
    'active',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'tasks', 'T-20260531-old', 'spec.md'), '# Old\n');
  writeFileSync(join(dp, 'tasks', 'T-20260530-orphan', 'spec.md'), '# Orphan\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('gc command', () => {
  it('dry-run previews historical task dirs without moving them', () => {
    const cwd = mkWorkspace();

    const out = run(`gc --cwd ${cwd}`, cwd);

    assert.match(out, /模式: dry-run/);
    assert.match(out, /T-20260531-old/);
    assert.match(out, /T-20260530-orphan/);
    assert.doesNotMatch(out, /T-20260601-active\n/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260531-old')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('force archives historical task dirs and keeps active/current/done', () => {
    const cwd = mkWorkspace();

    const out = run(`gc --cwd ${cwd} --force`, cwd);

    assert.match(out, /已归档 2 个历史任务目录/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260601-active')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260531-old')), false);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old')), true);
    assert.equal(readFileSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old', 'spec.md'), 'utf-8'), '# Old\n');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260529-done')), true);
    rmSync(cwd, { recursive: true, force: true });
  });
});
