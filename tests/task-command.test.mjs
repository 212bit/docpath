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

    const backlog = readFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-001-task.md'), 'utf-8');
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

  it('task stash saves active task files and state, resets to idle, and lists correctly', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-STASH-1' });

    const outStash = run(['task', 'stash', 'interrupted by urgent issue'], cwd);
    assert.match(outStash, /当前任务已暂存: T-STASH-1/);
    assert.match(outStash, /interrupted by urgent issue/);

    // current alias cleared
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current')), false);

    // state reset to idle
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'idle');
    assert.equal(state.task_id, '');

    // stash directory created
    const stashesDir = join(cwd, '.docpath', 'workspace', 'stashes');
    assert.equal(existsSync(stashesDir), true);

    // task stash list
    const outList = run(['task', 'stash', 'list'], cwd);
    assert.match(outList, /任务暂存列表 \(共 1 个\)/);
    assert.match(outList, /T-STASH-1/);
    assert.match(outList, /interrupted by urgent issue/);

    // json output
    const jsonList = JSON.parse(run(['task', 'stash', 'list', '--json'], cwd));
    assert.equal(jsonList.stashes.length, 1);
    assert.equal(jsonList.stashes[0].taskId, 'T-STASH-1');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('task pop restores stashed task state and files and removes stash', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-STASH-RESTORE' });

    run(['task', 'stash', 'save for later'], cwd);

    // Verify workspace is idle
    let state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'idle');

    // Pop the stash
    const outPop = run(['task', 'pop'], cwd);
    assert.match(outPop, /已恢复暂存任务: T-STASH-RESTORE/);

    // State restored
    state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'executing');
    assert.equal(state.task_id, 'T-STASH-RESTORE');
    assert.equal(state.current_step, 'S1');

    // Canonical & current files exist
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-STASH-RESTORE', 'spec.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md')), true);

    // Stash removed
    const jsonList = JSON.parse(run(['task', 'stash', 'list', '--json'], cwd));
    assert.equal(jsonList.stashes.length, 0);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('task drop deletes the specified stash record', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-STASH-DROP' });

    run(['task', 'stash'], cwd);
    let jsonList = JSON.parse(run(['task', 'stash', 'list', '--json'], cwd));
    assert.equal(jsonList.stashes.length, 1);

    const outDrop = run(['task', 'drop'], cwd);
    assert.match(outDrop, /已丢弃暂存记录/);

    jsonList = JSON.parse(run(['task', 'stash', 'list', '--json'], cwd));
    assert.equal(jsonList.stashes.length, 0);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('task switch automatically stashes current task and pops target stash', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-TASK-A' });

    // Stash Task A
    run(['task', 'stash', 'Work in progress on A'], cwd);

    // Now start a new task B
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-TASK-B'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-TASK-B', 'spec.md'), '# Spec B\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# Spec B\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-TASK-B',
      task_title: 'Task B',
      phase: 'executing',
      gate: 'none',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }));

    // Switch from Task B back to Task A
    const outSwitch = run(['task', 'switch', 'T-TASK-A'], cwd);
    assert.match(outSwitch, /已自动暂存前序任务: T-TASK-B/);
    assert.match(outSwitch, /已恢复暂存任务: T-TASK-A/);

    // Verify current state is now Task A
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.task_id, 'T-TASK-A');
    assert.equal(state.phase, 'executing');

    // Verify Task B is now in stashes
    const jsonList = JSON.parse(run(['task', 'stash', 'list', '--json'], cwd));
    assert.equal(jsonList.stashes.length, 1);
    assert.equal(jsonList.stashes[0].taskId, 'T-TASK-B');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('task stash and list supports --agent YAML format', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-AGENT-STASH' });

    const outStashAgent = run(['task', 'stash', '--agent', '-m', 'agent stash test'], cwd);
    assert.match(outStashAgent, /status: stashed/);
    assert.match(outStashAgent, /task_id: T-AGENT-STASH/);
    assert.match(outStashAgent, /recommended_command: docpath task pop/);

    const outListAgent = run(['task', 'stash', 'list', '--agent'], cwd);
    assert.match(outListAgent, /task_id: T-AGENT-STASH/);
    assert.match(outListAgent, /count: 1/);

    const outPopAgent = run(['task', 'pop', '--agent'], cwd);
    assert.match(outPopAgent, /status: restored/);
    assert.match(outPopAgent, /task_id: T-AGENT-STASH/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('task stash preserves and restores git dirty changes when in a git repo', () => {
    const cwd = mkWorkspace({ phase: 'executing', taskId: 'T-GIT-STASH' });

    // Initialize git repo in test workspace
    execFileSync('git', ['init', '-b', 'main'], { cwd });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
    writeFileSync(join(cwd, 'initial.txt'), 'hello');
    execFileSync('git', ['add', '.'], { cwd });
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd });

    // Make an uncommitted code change
    writeFileSync(join(cwd, 'feature.txt'), 'in-progress feature work');

    // Run task stash
    const outStash = run(['task', 'stash', 'interrupted feature'], cwd);
    assert.match(outStash, /已保存未提交变更/);
    assert.equal(existsSync(join(cwd, 'feature.txt')), false);

    // Run task pop
    const outPop = run(['task', 'pop'], cwd);
    assert.match(outPop, /已恢复 Git 未提交变更/);
    assert.equal(existsSync(join(cwd, 'feature.txt')), true);
    assert.equal(readFileSync(join(cwd, 'feature.txt'), 'utf-8'), 'in-progress feature work');

    rmSync(cwd, { recursive: true, force: true });
  });
});

