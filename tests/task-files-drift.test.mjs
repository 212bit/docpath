import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function writeSpecJson(dir, markdown, taskId = 'T-DRIFT') {
  const sha256 = createHash('sha256').update(markdown).digest('hex');
  const specJson = {
    schema_version: 1,
    kind: 'spec',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      content_sha256: sha256
    },
    task_id: taskId,
    backlog_id: null,
    title: `${taskId} - Task Title`,
    markdown,
    generated_at: '2026-06-01T00:00:00.000Z',
    scope: { included: [], excluded: [] },
    major_change_gate: { required: false, types: [], user_confirmed: null, decision_brief_markdown: '' },
    ui_gate: { state: 'exempt' },
    functional_requirements: [{ id: 'FR-1', text: '检测漂移', done: false }],
    non_functional_requirements: [{ id: 'NFR-1', text: '保持兼容', done: false }],
    acceptance_criteria: [{ id: 'AC-1', text: '能跑通', done: false }],
    decision_brief: ''
  };
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(specJson, null, 2));
}

function writePlanJson(dir, markdown, taskId = 'T-DRIFT') {
  const sha256 = createHash('sha256').update(markdown).digest('hex');
  const planJson = {
    schema_version: 1,
    kind: 'plan',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      content_sha256: sha256
    },
    task_id: taskId,
    title: 'Plan Title',
    markdown,
    generated_at: '2026-06-01T00:00:00.000Z',
    steps: [
      {
        id: 'S1',
        name: 'Step 1',
        description: 'Step description',
        acceptance: 'Criteria met',
        dependencies: '无',
        status: 'done'
      }
    ]
  };
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(planJson, null, 2));
}

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
    '## Checklist',
    `- [x] S1`,
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
  // Create task-level breadcrumb.jsonl (required for current architecture)
  writeFileSync(join(dp, 'tasks', 'T-DRIFT', 'breadcrumb.jsonl'), JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    taskId: 'T-DRIFT',
    step: 'S1',
    status: 'done',
    timestamp: '2026-06-01T00:00:00.000Z',
    context: '完成',
  }) + '\n');
  // Create docs-index.json (required to pass deliverables check)
  writeFileSync(join(dp, 'docs-index.json'), JSON.stringify({
    documents: [],
    generated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  const specCanonical = validSpec('canonical');
  const specCurrent = validSpec('current');
  const planCanonical = validPlan('canonical');
  const planCurrent = validPlan('current');

  writeFileSync(join(dp, 'tasks', 'T-DRIFT', 'spec.md'), specCanonical);
  writeSpecJson(join(dp, 'tasks', 'T-DRIFT'), specCanonical);

  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), specCurrent);
  writeSpecJson(join(dp, 'tasks', 'current'), specCurrent);

  writeFileSync(join(dp, 'tasks', 'T-DRIFT', 'plan.md'), planCanonical);
  writePlanJson(join(dp, 'tasks', 'T-DRIFT'), planCanonical);

  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), planCurrent);
  writePlanJson(join(dp, 'tasks', 'current'), planCurrent);

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
    const wrongCurrent = validSpecForTask('T-DRAFT-data-uniform', 'wrong current');
    const wrongCanonical = validSpecForTask('T-DRAFT-data-uniform', 'wrong canonical');

    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), wrongCurrent);
    writeSpecJson(join(cwd, '.docpath', 'tasks', 'current'), wrongCurrent, 'T-DRAFT-data-uniform');

    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'spec.md'), wrongCanonical);
    writeSpecJson(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), wrongCanonical, 'T-DRAFT-data-uniform');

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
    assert.match(next.out, /recommended_command: docpath task drift/);
    assert.match(next.out, /identity_drift_summary:/);
    assert.match(next.out, /declared_task_id: T-DRAFT-data-uniform/);

    const tasksDrift = run(`task drift --cwd ${cwd}`, cwd);
    assert.equal(tasksDrift.code, 1);
    assert.match(tasksDrift.out, /TASK IDENTITY DRIFT DETECTED/);

    // R-305: 身份漂移属不可自愈失败，须在昂贵的 runner 之前 fail-loud
    const full = run(`check --cwd ${cwd}`, cwd);
    assert.notEqual(full.code, 0);
    assert.match(full.out, /TASK IDENTITY DRIFT DETECTED/);
    assert.doesNotMatch(full.out, /编译检查/, '不得进入编译检查段落');
    assert.doesNotMatch(full.out, /测试检查/, '不得进入测试检查段落');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('task drift fails loud on phantom active task state', () => {
    const cwd = mkWorkspace();
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), { recursive: true, force: true });

    const drift = run(`task drift --cwd ${cwd}`, cwd);

    assert.equal(drift.code, 1);
    assert.match(drift.out, /幽灵任务漂移/);
    assert.match(drift.out, /state\.task_id: T-DRIFT/);
    assert.match(drift.out, /current 与 canonical 均缺失: spec\.md, plan\.md/);
    assert.match(drift.out, /不要用 agent step 机械修复/);
    assert.doesNotMatch(drift.out, /tasks sync --from canonical 或/);
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

  it('phantom drift names only the actually missing files (R-305 诊断文案)', () => {
    const cwd = mkWorkspace();
    // 只删 plan.md, spec.md 在 current 与 canonical 两处都保留 —— 旧文案会谎报
    // "spec.md/plan.md 全缺", 把排查引向"整个目录消失"。
    rmSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), { force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT', 'plan.md'), { force: true });

    const drift = run(`task drift --cwd ${cwd}`, cwd);

    assert.equal(drift.code, 1);
    assert.match(drift.out, /plan\.md/, '必须点名实际缺失的 plan.md');
    assert.doesNotMatch(drift.out, /spec\.md\/plan\.md 全缺/, '不得谎报两个文件全缺');

    const check = run(`check --cwd ${cwd} --skip-tests --skip-lint`, cwd);
    assert.equal(check.code, 1);
    assert.match(check.out, /plan\.md/);
    assert.doesNotMatch(check.out, /spec\.md\/plan\.md 全缺/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check fails loud on phantom task BEFORE expensive runners (R-305 早退契约)', () => {
    const cwd = mkWorkspace();
    rmSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'T-DRIFT'), { recursive: true, force: true });

    // 不带 --skip-tests: 早退契约必须生效，不得为注定失败的 check 跑测试套件
    const check = run(`check --cwd ${cwd}`, cwd);

    assert.notEqual(check.code, 0, '幽灵任务必须使 check 失败');
    assert.match(check.out, /PHANTOM TASK DRIFT DETECTED/);
    assert.doesNotMatch(check.out, /编译检查/, '不得进入编译检查段落');
    assert.doesNotMatch(check.out, /测试检查/, '不得进入测试检查段落');
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
    assert.match(failed.out, /docpath task sync --from canonical/);

    const synced = run(`task sync --cwd ${cwd} --from canonical`, cwd);
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

  it('task sync can write current content back to canonical', () => {
    const cwd = mkWorkspace();

    const synced = run(`task sync --cwd ${cwd} --from current`, cwd);

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

    const fixed = runShell(`(sleep 1.5; printf '\\r') | script -q /dev/null node ${BIN} check --cwd ${cwd} --skip-tests --skip-lint`, cwd);

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
