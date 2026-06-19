import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function validSpec(title = 'canonical') {
  return [
    `# T-DRIFT - ${title}`,
    '',
    '## 1. 背景与动机',
    '',
    '测试任务文件漂移。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: 检测漂移',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持兼容',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- spec/plan 漂移',
    '',
    '### 不包含',
    '- 历史任务扫描',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 检测范围 | 当前 / 全量 | 当前 | 降低噪声 |',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: check 能失败',
    '',
  ].join('\n');
}

function validSpecForTask(taskId, title = 'canonical') {
  return validSpec(title).replace('# T-DRIFT', `# ${taskId}`);
}

function validPlan(title = 'canonical') {
  return [
    '## 执行计划',
    '',
    `### S1: ${title}`,
    '- [x] S1: drift check',
    '- **描述**: 检测漂移',
    '- **验收条件**: 输出两边路径',
    '- **依赖**: 无',
    '',
  ].join('\n');
}

function mkWorkspace({ phase = 'executing' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-task-drift-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-DRIFT'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: drift-test\n  type: node\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-DRIFT',
    task_title: 'Task drift',
    phase,
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-DRIFT] — 2026-06-01T00:00:00.000Z',
    '',
    '---',
    'taskId: T-DRIFT',
    'step: S1',
    'status: done',
    'timestamp: 2026-06-01T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: 完成',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'tasks', 'T-DRIFT', 'spec.md'), validSpec('canonical'));
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), validSpec('current'));
  writeFileSync(join(dp, 'tasks', 'T-DRIFT', 'plan.md'), validPlan('canonical'));
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), validPlan('current'));
  return cwd;
}

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function runShell(command, cwd) {
  try {
    return {
      code: 0,
      out: execSync(command, { cwd, encoding: 'utf-8', timeout: 30000 }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('active task file drift', () => {
  it('check and next fail loud on task identity drift before plan/breadcrumb drift', () => {
    const cwd = mkWorkspace({ phase: 'drafting' });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), validSpecForTask('T-DRAFT-data-uniform', 'wrong current'));
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'spec.md'), validSpecForTask('T-DRAFT-data-uniform', 'wrong canonical'));

    const check = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);
    assert.equal(check.code, 1);
    assert.match(check.out, /任务身份一致性检查/);
    assert.match(check.out, /TASK IDENTITY DRIFT DETECTED/);
    assert.match(check.out, /state\.task_id: T-DRIFT/);
    assert.match(check.out, /declared_task_id: T-DRAFT-data-uniform/);
    assert.doesNotMatch(check.out, /Plan\/Breadcrumb 漂移检查/);
    assert.doesNotMatch(check.out, /Illegal workflow transition/);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'drafting');
    assert.equal(state.gate, 'none');

    const next = run(`next --cwd ${cwd} --agent`, cwd);
    assert.equal(next.code, 0);
    assert.match(next.out, /recommended_command: docpath tasks drift/);
    assert.match(next.out, /identity_drift_summary:/);
    assert.match(next.out, /declared_task_id: T-DRAFT-data-uniform/);

    const tasksDrift = run(`tasks drift --cwd ${cwd}`, cwd);
    assert.equal(tasksDrift.code, 1);
    assert.match(tasksDrift.out, /TASK IDENTITY DRIFT DETECTED/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('tasks drift fails loud on phantom active task state', () => {
    const cwd = mkWorkspace();
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), { recursive: true, force: true });

    const drift = run(`tasks drift --cwd ${cwd}`, cwd);

    assert.equal(drift.code, 1);
    assert.match(drift.out, /幽灵任务漂移/);
    assert.match(drift.out, /state\.task_id: T-DRIFT/);
    assert.match(drift.out, /current 别名与 canonical 任务目录均不存在/);
    assert.match(drift.out, /不要用 agent step 机械修复/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check fails loud (not sync) on phantom active task state', () => {
    const cwd = mkWorkspace();
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), { recursive: true, force: true });

    const check = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.equal(check.code, 1);
    assert.match(check.out, /PHANTOM TASK DRIFT DETECTED/);
    assert.match(check.out, /docpath task abort/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check skips current-task context files when workflow is idle (no active task)', () => {
    const cwd = mkWorkspace();
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), { recursive: true, force: true });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: 'task aborted',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));

    const check = run(`check --cwd ${cwd} --skip-tests --skip-lint --force`, cwd);

    assert.doesNotMatch(check.out, /当前任务上下文文件缺失/);
    assert.doesNotMatch(check.out, /PHANTOM TASK DRIFT DETECTED/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check reports current/canonical drift with paths and sync fixes it from canonical', () => {
    const cwd = mkWorkspace();

    const failed = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);
    assert.equal(failed.code, 1);
    assert.match(failed.out, /任务文件 current\/canonical 漂移检查/);
    assert.match(failed.out, /TASK FILE DRIFT DETECTED/);
    assert.match(failed.out, /current: .*\.docpath\/tasks\/current\/spec\.md/);
    assert.match(failed.out, /canonical: .*\.docpath\/tasks\/T-DRIFT\/spec\.md/);
    assert.match(failed.out, /docpath tasks sync --from canonical/);

    const synced = run(`tasks sync --cwd ${cwd} --from canonical`, cwd);
    assert.equal(synced.code, 0);
    assert.match(synced.out, /canonical -> current/);
    assert.equal(
      readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'),
      readFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'spec.md'), 'utf-8'),
    );

    const passed = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');
    assert.equal(passed.code, 0);
    assert.match(lastCheck, /任务文件 current\/canonical 漂移检查/);
    assert.match(passed.out, /全部通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('tasks sync can write current content back to canonical', () => {
    const cwd = mkWorkspace();

    const synced = run(`tasks sync --cwd ${cwd} --from current`, cwd);

    assert.equal(synced.code, 0);
    assert.match(synced.out, /current -> canonical/);
    assert.equal(
      readFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'plan.md'), 'utf-8'),
      readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8'),
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check --fix-drift canonical syncs drift before completing checks', () => {
    const cwd = mkWorkspace();

    const fixed = run(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift canonical`, cwd);

    assert.equal(fixed.code, 0);
    assert.match(fixed.out, /已自动同步 active task 文件/);
    assert.match(fixed.out, /全部通过/);
    assert.equal(
      readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'),
      readFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'spec.md'), 'utf-8'),
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check interactively fixes drift from canonical when running in a TTY', () => {
    const cwd = mkWorkspace();

    const fixed = runShell(`(sleep 0.5; printf '\\r') | script -q /dev/null node ${BIN} check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

    assert.equal(fixed.code, 0);
    assert.match(fixed.out, /已交互式同步 active task 文件 \(canonical\)/);
    assert.match(fixed.out, /全部通过/);
    assert.equal(
      readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'),
      readFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'spec.md'), 'utf-8'),
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('next --auto-fix current syncs drift before emitting the route', () => {
    const cwd = mkWorkspace();

    const fixed = run(`next --cwd ${cwd} --agent --auto-fix current`, cwd);

    assert.equal(fixed.code, 0);
    assert.match(fixed.out, /recommended_command:/);
    assert.equal(
      readFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'plan.md'), 'utf-8'),
      readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8'),
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check --fix-drift rejects invalid sync source', () => {
    const cwd = mkWorkspace();

    const failed = run(`check --cwd ${cwd} --fix-drift both`, cwd);

    assert.equal(failed.code, 1);
    assert.match(failed.out, /参数非法: both/);
    assert.match(failed.out, /canonical\|current/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
