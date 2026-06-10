import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

const CLI = '/Users/mac/project/docpath/dist/index.js';
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

describe('go --auto-next', () => {
  let tmpdir_path, tasks;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-go-'));
    ({ tasks } = mkExecWorkspace(tmpdir_path));
    // Create plan.md with 2 subtasks
    writeFileSync(join(tasks, 'plan.md'), `# Plan

## Subtask 1: Implement login
- [ ] Create login form
- [ ] Add validation

## Subtask 2: Implement reports page
- [ ] Create reports component
- [ ] Add charts
`);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('go --dry-run shows subtask list', () => {
    const out = run('go --dry-run', tmpdir_path);
    assert.match(out, /1|Subtask/i, 'should list subtasks');
  });

  it('go shows current step', () => {
    const out = run('go', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
  });

  it('go --step S1 --status done marks plan and breadcrumb as done', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-done-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Finish go step',
      '- [ ] S1: Finish go step',
      '- **描述**: finish current step',
      '- **验收条件**: step recorded as done',
      '- **依赖**: 无',
      '',
    ].join('\n'));

    const out = run('go --step S1 --status done', cwd);
    const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(out, /S1 -> done/);
    assert.match(plan, /- \[x\] S1: Finish go step/);
    assert.match(breadcrumb, /status: done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('go --step S1 --status skipped marks plan with [~]', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-skip-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Skip go step',
      '- [ ] S1: Skip go step',
      '- **描述**: skip current step',
      '- **验收条件**: step recorded as skipped',
      '- **依赖**: 无',
      '',
    ].join('\n'));

    const out = run('go --step S1 --status skipped', cwd);
    const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(out, /S1 -> skipped/);
    assert.match(plan, /- \[\~\] S1: Skip go step/);
    assert.match(breadcrumb, /status: skipped/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('go --step S1 --status blocked marks plan with [!]', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-block-'));
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Block go step',
      '- [ ] S1: Block go step',
      '- **描述**: block current step',
      '- **验收条件**: step recorded as blocked',
      '- **依赖**: 无',
      '',
    ].join('\n'));

    const out = run('go --step S1 --status blocked', cwd);
    const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(out, /S1 -> blocked/);
    assert.match(plan, /- \[!\] S1: Block go step/);
    assert.match(breadcrumb, /status: blocked/);
    rmSync(cwd, { recursive: true, force: true });
  });

  // 回归：无 task_id 时 go 必须 fail-loud，绝不静默兜底成 unknown/runtime 推进状态。
  it('go fails loud when no task_id is bound (no spec.md, empty state task_id)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-notask-'));
    const workspace = join(cwd, '.docpath', 'workspace');
    const tasks = join(cwd, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    // state.json 存在但 task_id 为空；不写 spec.md。
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 1, task_id: '', task_title: '', phase: 'executing', gate: 'none',
      state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Orphan step',
      '- [ ] S1: Orphan step',
      '- **描述**: 无任务绑定的孤儿步骤',
      '- **验收条件**: 不应被执行',
      '- **依赖**: 无',
      '',
    ].join('\n'));

    const out = run('go', cwd);
    // 必须报错且不写 breadcrumb（不存在或无 in_progress 记录）。
    assert.match(out, /无法解析 task_id|无任务/, 'should refuse without a bound task');
    let breadcrumb = '';
    try { breadcrumb = readFileSync(join(workspace, 'breadcrumb.md'), 'utf-8'); } catch { /* none */ }
    assert.doesNotMatch(breadcrumb, /status: in_progress/, 'must not record progress for an orphan step');
    rmSync(cwd, { recursive: true, force: true });
  });

  // dry-run 不受门禁影响：仍可预览，便于无任务时排查。
  it('go --dry-run still previews without a task_id', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-drynotask-'));
    const workspace = join(cwd, '.docpath', 'workspace');
    const tasks = join(cwd, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 1, task_id: '', task_title: '', phase: 'executing', gate: 'none',
      state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Orphan step',
      '- [ ] S1: Orphan step',
      '- **描述**: 预览用',
      '- **验收条件**: 仅预览',
      '- **依赖**: 无',
      '',
    ].join('\n'));

    const out = run('go --dry-run', cwd);
    assert.match(out, /dry-run/, 'dry-run should preview');
    assert.doesNotMatch(out, /无法解析 task_id/, 'dry-run should not hit the gate');
    rmSync(cwd, { recursive: true, force: true });
  });
});
