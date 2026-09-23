import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

// R-340: step-pass 复合命令——一次调用完成「收尾当前步骤 + 启动下一步」。
// 与 agent step done + go 的分步等价性：门禁不削弱，往返减半。

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  });
  return {
    code: result.status ?? 0,
    out: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function twoStepPlan() {
  return [
    '## 执行计划',
    '',
    '### S1: First step',
    '- [ ] S1: First step',
    '- **描述**: do the first thing',
    '- **验收条件**: S1 recorded as done',
    '- **依赖**: 无',
    '',
    '### S2: Second step',
    '- [ ] S2: Second step',
    '- **描述**: do the second thing',
    '- **验收条件**: S2 recorded as done',
    '- **依赖**: S1',
    '',
  ].join('\n');
}

describe('docpath step-pass (R-340)', () => {
  it('finishes current step and auto-starts the next pending step', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-pass-'));
    try {
      const { tasks, workspace } = mkExecWorkspace(cwd);
      writeFileSync(join(tasks, 'plan.md'), twoStepPlan());

      const result = run(['step-pass', '--note', 'pass S1'], cwd);
      assert.equal(result.code, 0, `step-pass failed: ${result.out}`);
      assert.match(result.out, /step-pass: S1 已完成/);
      assert.match(result.out, /自动推进下一步/);
      // go 的渲染路径复用：执行上下文 + next_hint 都在同一次输出里
      assert.match(result.out, /执行子任务/);
      assert.match(result.out, /S2 — Second step/);
      assert.match(result.out, /next_hint:/);

      const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
      assert.match(plan, /- \[x\] S1: First step/);
      assert.match(plan, /- \[ \] S2: Second step/);
      const state = JSON.parse(readFileSync(join(workspace, 'state.json'), 'utf-8'));
      assert.equal(state.current_step, 'S2');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('suggests quick-done closeout when the last step is passed', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-pass-last-'));
    try {
      const { tasks } = mkExecWorkspace(cwd);
      writeFileSync(join(tasks, 'plan.md'), [
        '## 执行计划',
        '',
        '### S1: Only step',
        '- [ ] S1: Only step',
        '- **描述**: single step plan',
        '- **验收条件**: done',
        '- **依赖**: 无',
        '',
      ].join('\n'));

      const result = run(['step-pass'], cwd);
      assert.equal(result.code, 0, `step-pass failed: ${result.out}`);
      assert.match(result.out, /step-pass: S1 已完成/);
      assert.match(result.out, /所有计划步骤均已完成/);
      assert.match(result.out, /docpath quick-done/);
      assert.doesNotMatch(result.out, /执行子任务/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('refuses to pass a phantom current_step not present in plan (pollution guard)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-pass-phantom-'));
    try {
      const { tasks, workspace } = mkExecWorkspace(cwd);
      writeFileSync(join(tasks, 'plan.md'), twoStepPlan());
      // 模拟 check.failed 把错误文本写进 current_step 的历史缺陷面。
      writeFileSync(join(workspace, 'state.json'), JSON.stringify({
        level: 2,
        task_id: 'T-AGENT',
        task_title: 'Agent Lifecycle',
        phase: 'executing',
        gate: 'none',
        state: 'executing',
        current_step: '质量检查失败: 测试, 子任务完成度 (0/1)',
        started_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      }));

      const result = run(['step-pass'], cwd);
      assert.notEqual(result.code, 0);
      assert.match(result.out, /不是 plan 中的有效步骤/);
      assert.match(result.out, /go --step S1/);
      // phantom 步骤绝不能留下 done 事件
      const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
      assert.match(plan, /- \[ \] S1: First step/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails loud when no step is in progress', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-pass-idle-'));
    try {
      const { workspace } = mkExecWorkspace(cwd);
      writeFileSync(join(workspace, 'state.json'), JSON.stringify({
        level: 2,
        task_id: 'T-AGENT',
        task_title: 'Agent Lifecycle',
        phase: 'idle',
        gate: 'none',
        state: 'idle',
        current_step: '',
        started_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      }));

      const result = run(['step-pass'], cwd);
      assert.notEqual(result.code, 0);
      assert.match(result.out, /没有进行中的步骤/);
      assert.match(result.out, /docpath go --step/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('completes all remaining pending steps at once with --all / -a (R-377)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-pass-all-'));
    try {
      const { tasks } = mkExecWorkspace(cwd);
      writeFileSync(join(tasks, 'plan.md'), twoStepPlan());

      const result = run(['step-pass', '--all', '--note', 'batch pass'], cwd);
      assert.equal(result.code, 0, `step-pass --all failed: ${result.out}`);
      assert.match(result.out, /step-pass: S1 已完成/);
      assert.match(result.out, /step-pass: S2 已完成/);
      assert.match(result.out, /所有计划步骤均已完成/);

      const plan = readFileSync(join(tasks, 'plan.md'), 'utf-8');
      assert.match(plan, /- \[x\] S1: First step/);
      assert.match(plan, /- \[x\] S2: Second step/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
