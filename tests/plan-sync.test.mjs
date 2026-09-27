import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ plan = '# Plan\n\n- [ ] S1: Implement sync\n', breadcrumb = '# Breadcrumb\n' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-sync-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-SYNC'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: sync-test\n  type: node\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-SYNC',
    task_title: 'Plan sync',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), breadcrumb);
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);
  writeFileSync(join(dp, 'tasks', 'T-SYNC', 'plan.md'), plan);
  return cwd;
}

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('plan/breadcrumb sync', () => {
  it('marks the matching plan checklist when an agent step is done', () => {
    const cwd = mkWorkspace();
    run(`agent step --cwd ${cwd} --step S1 --status done`, cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-SYNC', 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(plan, /- \[x\] S1: Implement sync/);
    assert.match(canonical, /- \[x\] S1: Implement sync/);
    assert.match(breadcrumb, /step: S1/);
    assert.match(breadcrumb, /status: done/);
    assert.doesNotMatch(breadcrumb, /status: in_progress/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('marks ALL checklist lines for a step id, including bottom Checklist section (R-253)', () => {
    const cwd = mkWorkspace({
      plan: [
        '## 执行计划',
        '',
        '### S1: Implement sync',
        '- [ ] S1: Implement sync',
        '- **描述**: do sync',
        '- **验收条件**: sync works',
        '- **依赖**: 无',
        '',
        '### S2: Next step',
        '- [ ] S2: Next step',
        '- **描述**: next',
        '- **验收条件**: next works',
        '- **依赖**: S1',
        '',
        '## Checklist',
        '- [ ] S1',
        '- [ ] S2',
        '',
      ].join('\n'),
    });
    run(`agent step --cwd ${cwd} --step S1 --status done`, cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    // section 内 checklist 更新
    assert.match(plan, /### S1: Implement sync\n- \[x\] S1: Implement sync/);
    // 底部 ## Checklist 同 id 行也必须更新（R-253 核心断言）
    const bottomChecklist = plan.split('## Checklist')[1];
    assert.ok(bottomChecklist, 'bottom Checklist section should exist');
    assert.match(bottomChecklist, /- \[x\] S1/);
    // S2 不受影响
    assert.match(bottomChecklist, /- \[ \] S2/);
    assert.match(plan, /- \[ \] S2: Next step/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('adds a checklist line for section-style plan steps when an agent step is done', () => {
    const cwd = mkWorkspace({
      plan: [
        '## 执行计划',
        '',
        '### S1: Implement sync',
        '- **描述**: do sync',
        '- **验收条件**: sync works',
        '- **依赖**: 无',
        '',
      ].join('\n'),
    });
    run(`agent step --cwd ${cwd} --step S1 --status done`, cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    const result = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.match(plan, /### S1: Implement sync\n- \[x\] S1: Implement sync/);
    assert.doesNotMatch(result.out, /Plan\/Breadcrumb 漂移检查/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check detects plan done without breadcrumb evidence', () => {
    const cwd = mkWorkspace({ plan: '# Plan\n\n- [x] S1: Implement sync\n' });
    const result = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.match(result.out, /Plan\/Breadcrumb 漂移检查/);
    assert.match(result.out, /DRIFT DETECTED:/);
    assert.match(result.out, /\[plan-done-no-breadcrumb\] S1 marked done in plan\.md but no breadcrumb evidence/);
    assert.match(result.out, /修复建议:/);
    assert.match(result.out, /docpath go --step S1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check detects breadcrumb done without a checked plan item', () => {
    const breadcrumb = [
      '# Breadcrumb',
      '',
      '### ✅ S1 [T-SYNC] — 2026-05-29T00:00:00.000Z',
      '',
      '---',
      'taskId: T-SYNC',
      'step: S1',
      'status: done',
      'timestamp: 2026-05-29T00:00:00.000Z',
      '---',
      '',
      '- **状态**: done',
      '- **上下文**: 完成同步',
      '',
    ].join('\n');
    const cwd = mkWorkspace({ breadcrumb });
    const result = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.match(result.out, /Plan\/Breadcrumb 漂移检查/);
    assert.match(result.out, /DRIFT DETECTED:/);
    assert.match(result.out, /\[breadcrumb-done-no-plan\] S1 done in breadcrumb but plan\.md still unchecked/);
    assert.match(result.out, /修复建议:/);
    assert.match(result.out, /docpath agent step --step S1 --status done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('marks skipped steps with [~] in both current and canonical plan files', () => {
    const cwd = mkWorkspace();
    run(`agent step --cwd ${cwd} --step S1 --status skipped`, cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-SYNC', 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(plan, /- \[\~\] S1: Implement sync/);
    assert.match(canonical, /- \[\~\] S1: Implement sync/);
    assert.match(breadcrumb, /status: skipped/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('marks blocked steps with [!] in both current and canonical plan files', () => {
    const cwd = mkWorkspace();
    run(`agent step --cwd ${cwd} --step S1 --status blocked`, cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-SYNC', 'plan.md'), 'utf-8');
    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.match(plan, /- \[!\] S1: Implement sync/);
    assert.match(canonical, /- \[!\] S1: Implement sync/);
    assert.match(breadcrumb, /status: blocked/);
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('plan command FSM precondition (R-291)', () => {
  it('refuses to write plan files when plan.ready is illegal for the current phase', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-plan-gate-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'workspace'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'T-DONE'), { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: plan-gate-test\n');
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 1,
      task_id: 'T-DONE',
      task_title: 'Done task',
      phase: 'completed',
      gate: 'review_pass',
      current_step: 'done',
      started_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
    const spec = '# T-DONE - Done task\n\n## 2. 需求清单\n\n### 功能需求\n- [ ] FR-1: 已完成需求\n';
    const plan = '## 执行计划\n\n### S1: old step\n- [x] S1: old step\n\n## Checklist\n- [x] S1\n';
    const planJson = '{"kind":"plan","note":"must stay byte-identical"}\n';
    for (const dir of ['current', 'T-DONE']) {
      writeFileSync(join(dp, 'tasks', dir, 'spec.md'), spec);
      writeFileSync(join(dp, 'tasks', dir, 'plan.md'), plan);
      writeFileSync(join(dp, 'tasks', dir, 'plan.json'), planJson);
    }

    try {
      let code = 0;
      let out = '';
      try {
        out = execSync(`node ${BIN} plan --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
      } catch (error) {
        code = error.status ?? 1;
        out = `${error.stdout?.toString() || ''}${error.stderr?.toString() || ''}`;
      }

      assert.notEqual(code, 0, 'completed 阶段的 plan 必须以非零码失败');
      assert.match(out, /不允许生成计划/);
      assert.match(out, /建议下一步/);
      // 零写入：canonical 与 current 的计划证据必须逐字节保持原样（R-291 半执行污染回归）
      for (const dir of ['current', 'T-DONE']) {
        assert.equal(readFileSync(join(dp, 'tasks', dir, 'plan.md'), 'utf-8'), plan, `${dir}/plan.md 不得被改写`);
        assert.equal(readFileSync(join(dp, 'tasks', dir, 'plan.json'), 'utf-8'), planJson, `${dir}/plan.json 不得被改写`);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ignores system workflow events (task.pop, task.stash, check, etc) in breadcrumb without plan drift', () => {
    const cwd = mkWorkspace({
      plan: '## 执行计划\n\n### S1: Step 1\n- [ ] S1: Step 1\n',
      breadcrumb: JSON.stringify({ taskId: 'T-SYNC', step: 'task.pop', status: 'done', context: 'pop' }) + '\n' +
        JSON.stringify({ taskId: 'T-SYNC', step: 'check', status: 'done', context: 'check' }) + '\n',
    });

    const res = run(`check --cwd ${cwd}`, cwd);
    // Should NOT report drift for task.pop or check
    assert.doesNotMatch(res.out, /task\.pop.*done in breadcrumb but plan\.md still unchecked/);
    assert.doesNotMatch(res.out, /Plan\/Breadcrumb 漂移检查/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('supports step-skip command to skip or supersede a plan step with ~ marker and breadcrumb evidence', () => {
    const cwd = mkWorkspace({
      plan: '## 执行计划\n\n### S1: First step\n- [ ] S1: First step\n\n### S2: Superseded step\n- [ ] S2: Superseded step\n',
    });

    const res = run(`step-skip --cwd ${cwd} --step S2 --reason "承接于 R-074 bd9605c" --superseded-by bd9605c`, cwd);
    assert.equal(res.code, 0);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(plan, /- \[~\] S2: Superseded step/);

    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');
    assert.match(breadcrumb, /step-skip \[S2\]/);
    assert.match(breadcrumb, /bd9605c/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
