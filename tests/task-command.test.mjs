import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'executing', taskId = 'T-TASK-CMD' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-task-cmd-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', taskId), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: task-command-test\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: phase === 'idle' ? '' : taskId,
    task_title: phase === 'idle' ? '' : 'Task command',
    phase,
    gate: 'none',
    current_step: phase === 'idle' ? '等待下一步' : 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', taskId, 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'backlog', 'R-001-task.md'), [
    '---',
    'id: R-001',
    'title: Task command',
    'status: active',
    'priority: P0',
    'level: 2',
    'source: test',
    'links:',
    `  task: ${taskId}`,
    `  spec: tasks/${taskId}/spec.md`,
    'created_at: 2026-06-01',
    '---',
    '',
    'Task command',
    '',
  ].join('\n'));
  return cwd;
}

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  }).trim();
}

describe('task command', () => {
  it('task abort archives active task, clears current alias, resets state, and drops linked backlog', () => {
    const cwd = mkWorkspace();

    const out = run(['task', 'abort'], cwd);

    assert.match(out, /当前任务已废弃: T-TASK-CMD/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-TASK-CMD')), false);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-TASK-CMD', 'spec.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current')), false);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'idle');
    assert.equal(state.gate, 'none');
    assert.equal(state.task_id, '');

    const backlog = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-task.md'), 'utf-8');
    assert.match(backlog, /status: dropped/);
    assert.match(readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8'), /task\.abort/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('task reset clears current alias and resets state without dropping linked backlog or archiving canonical files', () => {
    const cwd = mkWorkspace();

    const out = run(['task', 'reset'], cwd);

    assert.match(out, /当前任务上下文已重置: T-TASK-CMD/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-TASK-CMD', 'spec.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-TASK-CMD')), false);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current')), false);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'idle');
    assert.equal(state.task_id, '');

    const backlog = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-task.md'), 'utf-8');
    assert.match(backlog, /status: active/);
    assert.match(readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8'), /task\.reset/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('task abort fails loudly when there is no active task', () => {
    const cwd = mkWorkspace({ phase: 'idle' });

    assert.throws(() => run(['task', 'abort'], cwd), /当前没有可废弃的活跃任务/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
