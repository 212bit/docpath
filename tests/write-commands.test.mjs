import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'drafting', gate = 'none', taskId = 'T-WRITE', taskTitle = 'Write Commands' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-write-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: write-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: taskId,
    task_title: taskTitle,
    phase,
    gate,
    current_step: 'drafting',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Current Spec\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function runWithInput(args, cwd, input) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
  });
}

function runResult(args, cwd) {
  try {
    return {
      code: 0,
      out: run(args, cwd),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function runResultWithInput(args, cwd, input) {
  try {
    return {
      code: 0,
      out: runWithInput(args, cwd, input),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('write commands', () => {
  it('write-spec rejects malformed spec content and keeps file unchanged', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
    writeFileSync(specPath, '# Existing Spec\n');

    const result = runResultWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, '# 缺少结构\n\n只有一行正文\n');

    assert.equal(result.code, 1);
    assert.match(result.out, /spec\.md 结构校验失败/);
    assert.match(result.out, /实际目标: .*\.docpath\/tasks\/T-WRITE\/spec\.md/);
    assert.match(result.out, /current 视图: .*\.docpath\/tasks\/current\/spec\.md/);
    assert.match(result.out, /缺少 `### 功能需求` 章节/);
    assert.match(result.out, /section ## 2\. 需求清单/);
    assert.match(result.out, /缺少至少一条 `FR-\*` 功能需求/);
    assert.match(result.out, /field FR-\*/);
    assert.equal(readFileSync(specPath, 'utf-8'), '# Existing Spec\n');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-spec accepts valid structured spec content', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const spec = [
      '# T-WRITE - 合法 Spec',
      '',
      '> backlog_id: R-WRITE',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 需要结构化校验',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- 写命令校验',
      '',
      '### 不包含',
      '- 模板重写',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 校验 | 非空 / 结构 | 结构 | fail loud |',
      '',
      '## 4.1 重大变更门禁',
      '',
      '### 是否涉及重大变更',
      '- [x] 否',
      '- [ ] 是，需要用户确认',
      '',
      '### 变更类型',
      '- [ ] 工作流 / Agent 行为',
      '',
      '### UI 设计门禁',
      '- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
      '- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）',
      '',
      '### Decision Brief',
      '- 用户确认: 无',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 非法输入会失败',
      '',
    ].join('\n');

    const output = runWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, spec);
    assert.match(output, /spec\.md 已写入/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'), /FR-1/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md'), 'utf-8'), /FR-1/);
    const specJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.json'), 'utf-8'));
    assert.equal(specJson.schema_version, 1);
    assert.equal(specJson.kind, 'spec');
    assert.equal(specJson.task_id, 'T-WRITE');
    assert.equal(specJson.backlog_id, 'R-WRITE');
    assert.equal(specJson.source.kind, 'markdown');
    assert.match(specJson.source.created_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(specJson.source.updated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(specJson.source.content_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(specJson.scope.included, ['写命令校验']);
    assert.deepEqual(specJson.scope.excluded, ['模板重写']);
    assert.equal(specJson.major_change_gate.required, false);
    assert.deepEqual(specJson.major_change_gate.types, []);
    assert.equal(specJson.major_change_gate.user_confirmed, '无');
    assert.equal(specJson.ui_gate.state, 'exempt');
    assert.equal(specJson.functional_requirements[0].id, 'FR-1');
    assert.ok(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.json')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-spec binds a new task id from the spec heading when state has no task id', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none', taskId: '', taskTitle: '' });
    const spec = [
      '# T-NEW-WRITE - New Write Task',
      '',
      '## 1. 背景与动机',
      '',
      '从 spec 标题绑定新任务。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 无 task_id 状态下写入 spec 后绑定任务身份',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持后续 go/plan 可继续',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- write-spec 任务身份绑定',
      '',
      '### 不包含',
      '- 自动重写已有任务身份',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 身份来源 | state / spec heading | spec heading | 无绑定任务时需要从 spec 建立 canonical 目录 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: state.task_id 被绑定为 T-NEW-WRITE',
      '',
    ].join('\n');

    const output = runWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, spec);

    assert.match(output, /spec\.md 已写入/);
    assert.ok(existsSync(join(cwd, '.docpath', 'tasks', 'T-NEW-WRITE', 'spec.md')));
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.task_id, 'T-NEW-WRITE');
    assert.equal(state.task_title, 'New Write Task');
    assert.equal(state.phase, 'drafting');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-spec rejects spec content that declares a different task id', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
    writeFileSync(specPath, '# T-WRITE - Existing Spec\n');
    const spec = [
      '# T-OTHER - Wrong Task',
      '',
      '## 1. 背景与动机',
      '',
      '不应写入旧任务目录。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 阻断身份漂移',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: fail loud',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- artifact sink 身份校验',
      '',
      '### 不包含',
      '- 自动切换任务',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 任务身份 | 自动覆盖 / fail loud | fail loud | 防止污染 canonical evidence |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 不写入错误 task id',
      '',
    ].join('\n');

    const result = runResultWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, spec);

    assert.equal(result.code, 1);
    assert.match(result.out, /task identity mismatch/);
    assert.match(result.out, /state\.task_id: T-WRITE/);
    assert.match(result.out, /spec heading task_id: T-OTHER/);
    assert.equal(readFileSync(specPath, 'utf-8'), '# T-WRITE - Existing Spec\n');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-spec keeps exit 0 when post-write transition fails (R-248)', () => {
    // phase=checking 不在 task.created 的 from 列表里 → transitionWorkflow 抛 Illegal transition。
    // 文件已写入即命令成功，后续步骤失败不应让命令 exit 1 覆盖成功信号。
    const cwd = mkWorkspace({ phase: 'checking', gate: 'check_pass' });
    const spec = [
      '# T-WRITE - 合法 Spec',
      '',
      '> backlog_id: R-WRITE',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 需要结构化校验',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- 写命令校验',
      '',
      '### 不包含',
      '- 模板重写',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 校验 | 非空 / 结构 | 结构 | fail loud |',
      '',
      '## 4.1 重大变更门禁',
      '',
      '### 是否涉及重大变更',
      '- [x] 否',
      '- [ ] 是，需要用户确认',
      '',
      '### 变更类型',
      '- [ ] 工作流 / Agent 行为',
      '',
      '### UI 设计门禁',
      '- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
      '- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程',
      '',
      '### Decision Brief',
      '- 用户确认: 无',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 写入成功后即使 transition 失败也 exit 0',
      '',
    ].join('\n');
    const result = runResultWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, spec);

    assert.equal(result.code, 0, 'write-spec must exit 0 when file written even if transition fails');
    assert.match(result.out, /spec\.md 已写入/);
    // warning 走 stderr；exit 0 时 runResultWithInput 不合并 stderr，用 spawnSync 合并验证
    const combined = spawnSync('node', [BIN, 'write-spec', '--cwd', cwd, '--stdin'], {
      cwd, encoding: 'utf-8', input: spec,
    });
    assert.equal(combined.status, 0);
    const allOut = `${combined.stdout || ''}${combined.stderr || ''}`;
    assert.match(allOut, /文件已写入，但后续步骤失败/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md'), 'utf-8'), /合法 Spec/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-plan writes plan.md and advances to go route', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const content = [
      '## 执行计划',
      '',
      '### S1: implement write-plan',
      '- **描述**: 实现 write-plan',
      '- **验收条件**: plan.md 成功写入',
      '- **依赖**: 无',
      '',
    ].join('\n');
    const output = runWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, content);

    assert.match(output, /plan\.md 已写入/);
    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(plan, /S1: implement write-plan/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.md'), 'utf-8'), /S1: implement write-plan/);
    const planJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.json'), 'utf-8'));
    assert.equal(planJson.schema_version, 1);
    assert.equal(planJson.kind, 'plan');
    assert.equal(planJson.source.kind, 'markdown');
    assert.match(planJson.source.content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(planJson.steps[0].id, 'S1');
    assert.ok(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.json')));

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'planning');

    const next = run(`next --cwd ${cwd} --agent`, cwd);
    assert.match(next, /recommended_command: docpath go --step/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('go reads plan.json before stale plan.md and still fails loud on corrupt plan.json', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const content = [
      '## 执行计划',
      '',
      '### S1: JSON backed step',
      '- **描述**: 从 JSON 真源读取',
      '- **验收条件**: go 输出 JSON 中的步骤名',
      '- **依赖**: 无',
      '',
    ].join('\n');
    runWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, content);

    const stale = [
      '## 执行计划',
      '',
      '### S1: Stale markdown step',
      '- **描述**: 这行不应被 go 读取',
      '- **验收条件**: stale',
      '- **依赖**: 无',
      '',
    ].join('\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), stale);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.md'), stale);

    const drifted = runResult(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.equal(drifted.code, 0);
    assert.match(drifted.out, /JSON backed step/);
    assert.doesNotMatch(drifted.out, /Stale markdown step/);

    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.json'), '{not-json');
    const corrupt = runResult(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.equal(corrupt.code, 1);
    assert.match(corrupt.out, /plan\.json .*不是合法 JSON/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-plan rejects steps missing required fields and keeps file unchanged', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const planPath = join(cwd, '.docpath', 'tasks', 'current', 'plan.md');
    writeFileSync(planPath, '## 执行计划\n\n### S0: keep\n- **描述**: old\n- **验收条件**: old\n- **依赖**: 无\n');

    const invalidPlan = [
      '## 执行计划',
      '',
      '### S1: broken plan',
      '- **描述**: 只有描述',
      '',
    ].join('\n');
    const result = runResultWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, invalidPlan);

    assert.equal(result.code, 1);
    assert.match(result.out, /plan\.md 结构校验失败/);
    assert.match(result.out, /实际目标: .*\.docpath\/tasks\/T-WRITE\/plan\.md/);
    assert.match(result.out, /current 视图: .*\.docpath\/tasks\/current\/plan\.md/);
    assert.match(result.out, /以下步骤缺少 `验收条件`: S1 \(line 3, section S1, field 验收条件\)/);
    assert.match(result.out, /以下步骤缺少 `依赖`: S1 \(line 3, section S1, field 依赖\)/);
    assert.match(readFileSync(planPath, 'utf-8'), /### S0: keep/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-plan in executing phase keeps phase, does not regress to planning (R-251)', () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none' });
    const content = [
      '## 执行计划',
      '',
      '### S1: revised step',
      '- **描述**: 执行中重写计划',
      '- **验收条件**: phase 保持 executing',
      '- **依赖**: 无',
      '',
    ].join('\n');
    const output = runWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, content);

    assert.match(output, /plan\.md 已写入/);
    assert.match(output, /当前阶段为 executing，仅更新 plan 文件，不回退阶段/);
    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.md'), 'utf-8');
    assert.match(plan, /S1: revised step/);
    const planJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.json'), 'utf-8'));
    assert.equal(planJson.steps[0].id, 'S1');

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'executing', 'phase must not regress to planning');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan syncs canonical plan into tasks/current so go can continue immediately', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });

    const spec = [
      '# T-WRITE - 合法 Spec',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 需要计划同步',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- plan 到 go 主路径',
      '',
      '### 不包含',
      '- 新命令',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 同步策略 | current / canonical | current | 保证 go 可直接读取 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: plan 后 go 可继续',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);

    const plan = [
      '## 执行计划',
      '',
      '### S1: continue after plan',
      '- **描述**: plan 后直接 go，覆盖 FR-1',
      '- **验收条件**: AC-1: go 能读取 current plan',
      '- **依赖**: 无',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'plan.md'), plan);

    const output = run(`plan --cwd ${cwd}`, cwd);
    assert.match(output, /next_hint:/);
    assert.match(output, /recommended_command: docpath go --step S1/);

    const currentPlan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(currentPlan, /continue after plan/);

    const goOutput = run(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.match(goOutput, /子任务: S1/);
    assert.doesNotMatch(goOutput, /未找到 plan\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan --dry-run previews without writing plan files or changing state', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, 'spec.md'), '# T-WRITE - Dry Run Spec\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# T-WRITE - Dry Run Spec\n');
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const beforeState = readFileSync(statePath, 'utf-8');

    const output = run(`plan --cwd ${cwd} --dry-run`, cwd);

    assert.match(output, /\[dry-run\]/);
    assert.match(output, /task: plan/);
    assert.match(output, /output_format:/);
    assert.doesNotMatch(output, /plan\.md 已写入/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md')), false);
    assert.equal(existsSync(join(canonicalDir, 'plan.md')), false);
    assert.equal(readFileSync(statePath, 'utf-8'), beforeState);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan ignores stale current plan when canonical plan is missing for the active task', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });

    const spec = [
      '# T-WRITE - 新任务计划',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 新任务功能',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 新计划不能继承旧 checklist',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: Old completed task',
      '- **描述**: stale',
      '- **验收条件**: stale',
      '- **依赖**: 无',
      '',
      '## Checklist',
      '- [x] S1',
      '',
    ].join('\n'));

    const output = run(`plan --cwd ${cwd}`, cwd);

    assert.match(output, /plan\.md 已写入/);
    const currentPlan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    const canonicalPlan = readFileSync(join(canonicalDir, 'plan.md'), 'utf-8');
    assert.match(currentPlan, /新任务功能/);
    assert.doesNotMatch(currentPlan, /Old completed task/);
    assert.doesNotMatch(currentPlan, /- \[x\] S1/);
    assert.equal(canonicalPlan, currentPlan);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan generates a draft plan when no plan.md exists yet', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });

    const spec = [
      '# T-WRITE - 自动计划',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 自动生成计划草案',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- docpath plan 自动写入 plan.md',
      '',
      '### 不包含',
      '- LLM 调用',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 计划生成 | 草案 / 空状态 | 草案 | 减少断点 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: plan 后 go 可直接执行',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);

    const output = run(`plan --cwd ${cwd}`, cwd);

    assert.match(output, /plan\.md 已写入/);
    assert.doesNotMatch(output, /task: plan/);
    assert.doesNotMatch(output, /output_format:/);
    assert.match(output, /next_hint:/);
    assert.match(output, /recommended_command: docpath go --step S1/);
    const currentPlan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(currentPlan, /S1: 梳理 自动生成计划草案/);
    assert.match(currentPlan, /S2: 实现 自动生成计划草案/);
    assert.match(currentPlan, /FR-1/);
    assert.match(currentPlan, /AC-1/);
    assert.doesNotMatch(readFileSync(join(canonicalDir, 'plan.md'), 'utf-8'), /验证门禁并归档/);

    const goOutput = run(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.match(goOutput, /子任务: S1/);
    assert.doesNotMatch(goOutput, /未找到 plan\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan refuses to persist an incomplete generated plan and keeps state unchanged', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });
    const spec = [
      '# T-WRITE - 完整覆盖契约',
      '',
      '## 1. 背景与动机',
      '',
      'plan 必须覆盖所有 id。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 第一项能力',
      '- [ ] FR-2: 第二项能力',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- plan 覆盖校验',
      '',
      '### 不包含',
      '- LLM 调用',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | plan 契约 | 宽松 / fail-loud | fail-loud | 防止写坏 machine truth |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 覆盖第一项验收',
      '- [ ] AC-2: 覆盖第二项验收',
      '',
    ].join('\n');
    const incompletePlan = [
      '## 执行计划',
      '',
      '### S1: 只覆盖第一项',
      '- **描述**: 只处理 FR-1',
      '- **验收条件**: AC-1',
      '- **依赖**: 无',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);
    writeFileSync(join(canonicalDir, 'plan.md'), incompletePlan);

    const result = runResult(`plan --cwd ${cwd}`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /generated plan coverage check failed/);
    assert.match(result.out, /missing functional requirements: FR-2/);
    assert.match(result.out, /missing acceptance criteria: AC-2/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md')), false);
    assert.equal(readFileSync(join(canonicalDir, 'plan.md'), 'utf-8'), incompletePlan);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'drafting');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan generated draft covers all explicit FR and AC ids', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });
    const spec = [
      '# T-WRITE - 多项覆盖',
      '',
      '## 1. 背景与动机',
      '',
      '生成计划必须覆盖多项需求。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 第一项能力',
      '- [ ] FR-2: 第二项能力',
      '- [ ] FR-3: 第三项能力',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- plan 覆盖校验',
      '',
      '### 不包含',
      '- LLM 调用',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | plan 契约 | 宽松 / fail-loud | fail-loud | 防止写坏 machine truth |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 覆盖第一项验收',
      '- [ ] AC-2: 覆盖第二项验收',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);

    const output = run(`plan --cwd ${cwd}`, cwd);
    const plan = readFileSync(join(canonicalDir, 'plan.md'), 'utf-8');
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));

    assert.match(output, /plan\.md 已写入/);
    for (const id of ['FR-1', 'FR-2', 'FR-3', 'AC-1', 'AC-2']) {
      assert.match(plan, new RegExp(id));
    }
    assert.equal(state.phase, 'planning');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-journal appends journal record into spec.md', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    const output = run(`write-journal --cwd ${cwd} --content "### 📝 任务摘要\\n完成断头引用修复"`, cwd);

    assert.match(output, /journal 记录已写入/);
    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /## Journal Record/);
    assert.match(spec, /完成断头引用修复/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md'), 'utf-8'), /## Journal Record/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-analysis writes section files to canonical and current analysis dirs', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const analysis = [
      '# UI Analysis',
      '',
      '- 页面/组件清单: 筛选栏、表格、详情抽屉',
      '- 状态: 空态、错误态、加载态',
      '',
    ].join('\n');

    const output = run(`write-analysis --cwd ${cwd} --section ui --content ${JSON.stringify(analysis)}`, cwd);
    assert.match(output, /analysis\/ui\.md 已写入/);

    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'analysis', 'ui.md'), 'utf-8');
    const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis', 'ui.md'), 'utf-8');
    assert.match(canonical, /详情抽屉/);
    assert.equal(current, canonical);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-analysis keeps legacy analysis.md compatibility when no section is provided', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const analysis = '# Predev Analysis\n\n## UI/UX 分析\n- 表格、详情抽屉\n';

    const output = run(`write-analysis --cwd ${cwd} --content ${JSON.stringify(analysis)}`, cwd);
    assert.match(output, /analysis\.md 已写入/);

    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'analysis.md'), 'utf-8');
    const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis.md'), 'utf-8');
    assert.match(canonical, /UI\/UX 分析/);
    assert.equal(current, canonical);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-analysis fails loud when there is no active task', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.task_id = '';
    state.task_title = '';
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const result = runResult(`write-analysis --cwd ${cwd} --section requirements --content "analysis"`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /当前没有可写入 analysis 的活跃任务/);
    assert.match(result.out, /docpath backlog capture/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'analysis', 'requirements.md')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-design writes stack, brief, handoff, approval, preview and acceptance artifacts', () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none' });
    const artifacts = [
      ['stack', 'frontend-stack.md', '# Frontend Stack\n\n## 选定栈\n- JS 框架: 纯静态\n\n## 被否决备选\n- React - 理由: 当前任务不需要组件运行时\n'],
      ['brief', 'ui-brief.md', '# UI Blueprint\n\n## Screen Contract\n'],
      ['handoff', 'external-design-handoff.md', '# External Design Handoff\n\n## Tool Inputs\n'],
      ['approval', 'design-approval.md', '---\napproval:\n  state: approved\n---\n# Design Approval\n'],
      ['preview', 'design-preview.md', '# Design Preview\n\n布局 状态 响应式 snapshot HTML '.repeat(20)],
      ['acceptance', 'visual-acceptance.md', '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(10)],
    ];

    for (const [kind, file, content] of artifacts) {
      const output = runWithInput(`write-design --cwd ${cwd} --kind ${kind} --stdin`, cwd, content);
      assert.match(output, new RegExp(`${file} 已写入`));
      const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', file), 'utf-8');
      const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', file), 'utf-8');
      assert.match(canonical, new RegExp(content.trim().split('\n')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(current, canonical);
    }

    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-design supports template initialization', () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none' });

    // 1. Test initializing the default canonical kind.
    const outputBrief = run(`write-design --cwd ${cwd} --template`, cwd);
    assert.match(outputBrief, /ui-brief\.md 已初始化/);
    assert.match(outputBrief, /design-approval\.md 已初始化/);
    assert.match(outputBrief, /visual-acceptance\.md 已初始化/);
    assert.doesNotMatch(outputBrief, /frontend-stack\.md 已初始化/);
    const briefContent = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'ui-brief.md'), 'utf-8');
    assert.match(briefContent, /# UI Blueprint/);
    assert.match(briefContent, /High-Fidelity UI Prompt/);

    // 2. Test initializing all canonical kinds at once.
    const outputAll = run(`write-design --cwd ${cwd} --kind all --template`, cwd);
    assert.match(outputAll, /ui-brief\.md 已初始化/);
    assert.match(outputAll, /design-approval\.md 已初始化/);
    assert.match(outputAll, /visual-acceptance\.md 已初始化/);
    assert.doesNotMatch(outputAll, /external-design-handoff\.md 已初始化/);
    assert.doesNotMatch(outputAll, /design-preview\.md 已初始化/);

    // 3. Optional artifacts can still be initialized explicitly.
    const outputStack = run(`write-design --cwd ${cwd} --kind stack --template`, cwd);
    assert.match(outputStack, /frontend-stack\.md 已初始化/);
    const stackContent = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'frontend-stack.md'), 'utf-8');
    assert.match(stackContent, /# Frontend Stack Decision/);

    rmSync(cwd, { recursive: true, force: true });
  });

});
