import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function mkExecWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-agent-'));
  fs.mkdirSync(path.join(tmp, '.docpath', 'workspace'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'current'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'T-AGENT'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-AGENT',
    task_title: 'Agent Lifecycle',
    phase: 'executing',
    gate: 'none',
    state: 'executing',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }));
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'current.md'), '# current.md\n## 当前任务\ntest');
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'breadcrumb.md'), [
    '# breadcrumb.md',
    '',
    '### ✅ S1 [T-AGENT] — 2026-06-01T00:00:00.000Z',
    '',
    '---',
    'taskId: T-AGENT',
    'step: S1',
    'status: done',
    'timestamp: 2026-06-01T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: 已完成',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');
  const plan = [
    '## 执行计划',
    '',
    '### S1: Agent lifecycle',
    '- [x] S1: Agent lifecycle',
    '- **描述**: 验证 agent 生命周期',
    '- **验收条件**: agent done 能完成任务',
    '- **依赖**: 无',
    '',
  ].join('\n');
  const spec = [
    '# T-AGENT - Agent Lifecycle',
    '',
    '## 1. 背景与动机',
    '',
    '测试 agent 生命周期。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: agent done 能完成任务',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持测试隔离',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- agent done',
    '',
    '### 不包含',
    '- 真实外部检查',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 测试结构 | 极简 / 标准 | 标准 | 满足结构校验 |',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: agent done 清理 pending-done',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'plan.md'), plan);
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'T-AGENT', 'plan.md'), plan);
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'spec.md'), spec);
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'T-AGENT', 'spec.md'), spec);
  return tmp;
}
function run(args, cwd) {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return ((e.stdout || '') + (e.stderr || '')).toString().trim();
  }
}

describe('docpath agent lifecycle', () => {
  let tmpDir;
  before(() => { tmpDir = mkExecWorkspace(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('agent enter returns context', () => {
    const out = run('agent enter', tmpDir);
    assert.match(out, /agent_context|state|phase/i, `agent enter should return context, got: ${out.slice(0, 120)}`);
    const sentinel = fs.readFileSync(path.join(tmpDir, '.docpath', 'workspace', 'pending-done.md'), 'utf-8');
    const sentinelJson = JSON.parse(fs.readFileSync(path.join(tmpDir, '.docpath', 'workspace', 'pending-done.json'), 'utf-8'));
    assert.match(sentinel, /task_id: T-AGENT/);
    assert.equal(sentinelJson.task_id, 'T-AGENT');
  });

  it('agent enter refuses before a concrete step is executing and does not write pending-done', () => {
    const cwd = mkExecWorkspace();
    const statePath = path.join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.phase = 'planning';
    state.state = 'planning_done';
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const out = run('agent enter', cwd);

    assert.match(out, /agent_context/);
    assert.match(out, /recommended_command:/);
    assert.match(out, /docpath agent enter: 当前 phase=planning 尚未进入执行阶段/);
    assert.equal(fs.existsSync(path.join(cwd, '.docpath', 'workspace', 'pending-done.md')), false);
    assert.equal(fs.existsSync(path.join(cwd, '.docpath', 'workspace', 'pending-done.json')), false);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent step records progress', () => {
    const out = run('agent step --step S1', tmpDir);
    assert.match(out, /step|progress|记录/i, `got: ${out.slice(0, 100)}`);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
  });

  it('agent step done does not leave current_step pinned to the completed step', () => {
    const cwd = mkExecWorkspace();
    const statePath = path.join(cwd, '.docpath', 'workspace', 'state.json');
    const out = run('agent step --step S1', cwd);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    assert.match(out, /S1/);
    assert.notEqual(state.current_step, 'S1');
    assert.match(state.current_step, /步骤已完成|继续下一步/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done completes task', () => {
    const out = run('agent done', tmpDir);
    assert.match(out, /done|完成|物理任务目录归档已延后/i, `got: ${out.slice(0, 100)}`);
    assert.match(out, /journal prompt 已收敛/);
    assert.doesNotMatch(out, /task: journal/);
    assert.match(out, /canonical evidence 保留在 \.docpath\/tasks\/T-AGENT\//);
    assert.equal(fs.existsSync(path.join(tmpDir, '.docpath', 'tasks', 'T-AGENT', 'spec.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, '.docpath', 'tasks', 'done', 'T-AGENT')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.docpath', 'workspace', 'pending-done.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.docpath', 'workspace', 'pending-done.json')), false);
  });

  it('agent done marks the active terminal verification step as done', () => {
    const cwd = mkExecWorkspace();
    const statePath = path.join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.current_step = 'S2';
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    const plan = [
      '## 执行计划',
      '',
      '### S1: Implement feature',
      '- [x] S1: Implement feature',
      '- **描述**: 完成功能实现',
      '- **验收条件**: 功能已实现',
      '- **依赖**: 无',
      '',
      '### S2: 验证门禁并归档',
      '- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。',
      '- **验收条件**: 质量门禁通过，任务状态进入 completed。',
      '- **依赖**: S1',
      '',
      '## Checklist',
      '- [x] S1',
      '- [ ] S2',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), plan);
    fs.writeFileSync(path.join(cwd, '.docpath', 'tasks', 'T-AGENT', 'plan.md'), plan);
    fs.writeFileSync(path.join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), [
      '# breadcrumb.md',
      '',
      '### ✅ S1 [T-AGENT] — 2026-06-01T00:00:00.000Z',
      '',
      '---',
      'taskId: T-AGENT',
      'step: S1',
      'status: done',
      'timestamp: 2026-06-01T00:00:00.000Z',
      '---',
      '',
      '- **状态**: done',
      '- **上下文**: 已完成',
      '',
      '### 🔄 S2 [T-AGENT] — 2026-06-01T00:01:00.000Z',
      '',
      '---',
      'taskId: T-AGENT',
      'step: S2',
      'status: in_progress',
      'timestamp: 2026-06-01T00:01:00.000Z',
      '---',
      '',
      '- **状态**: in_progress',
      '- **上下文**: 开始验证门禁',
      '',
    ].join('\n'));

    const out = run('agent done', cwd);
    const nextPlan = fs.readFileSync(path.join(cwd, '.docpath', 'tasks', 'T-AGENT', 'plan.md'), 'utf-8');
    const breadcrumb = fs.readFileSync(path.join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');

    assert.match(out, /done|完成|物理任务目录归档已延后/i);
    assert.match(out, /canonical evidence 保留在 \.docpath\/tasks\/T-AGENT\//);
    assert.match(nextPlan, /- \[x\] S2/);
    assert.match(breadcrumb, /"step":"S2","status":"done"/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done reuses fresh successful check and review evidence when pass gates are present', () => {
    const cwd = mkExecWorkspace();
    const workspace = path.join(cwd, '.docpath', 'workspace');
    const statePath = path.join(workspace, 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.phase = 'reviewing';
    state.gate = 'review_pass';
    state.current_step = 'S1';
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(workspace, 'last-check.json'), `${JSON.stringify({
      schema_version: 1,
      kind: 'last-check',
      timestamp: now,
      passed: true,
      check_count: 1,
      checks: [{ name: 'fixture', passed: true, output: '' }],
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(workspace, 'review.json'), `${JSON.stringify({
      schema_version: 1,
      kind: 'review',
      timestamp: now,
      files: [],
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      approved: true,
    }, null, 2)}\n`);

    const out = run('agent done', cwd);

    assert.match(out, /check reused/);
    assert.match(out, /review reused/);
    assert.doesNotMatch(out, /质量检查开始/);
    assert.doesNotMatch(out, /代码审查开始/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done recovers check gate when completed plan was reset to planning', () => {
    const cwd = mkExecWorkspace();
    const workspace = path.join(cwd, '.docpath', 'workspace');
    const statePath = path.join(workspace, 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.phase = 'planning';
    state.gate = 'none';
    state.state = 'planning_done';
    state.current_step = 'plan 已写入，下一步: docpath go';
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const out = run('agent done', cwd);
    const nextState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    assert.doesNotMatch(out, /Illegal workflow transition/);
    assert.equal(nextState.phase, 'completed');
    assert.equal(nextState.gate, 'review_pass');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done --skip-tests fails loudly when reason is missing', () => {
    const cwd = mkExecWorkspace();
    const out = run('agent done --skip-tests', cwd);

    assert.match(out, /--skip-tests requires --note/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done --skip-tests records a skip reason when note is provided', () => {
    const cwd = mkExecWorkspace();
    const out = run('agent done --skip-tests --note "CI 环境无测试依赖，先放行 review"', cwd);
    const decisions = fs.readFileSync(path.join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');

    assert.match(out, /done|完成|物理任务目录归档已延后/i);
    assert.match(out, /canonical evidence 保留在 \.docpath\/tasks\/T-AGENT\//);
    assert.match(decisions, /跳过 check/);
    assert.match(decisions, /CI 环境无测试依赖，先放行 review/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  // 回归：无 task_id 绑定时，agent step/done 必须 fail-loud，绝不静默兜底成
  // unknown/runtime 推进生命周期（与 go 门禁同源，参见 FSM 漂移根因）。
  function mkNoTaskWorkspace() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-agent-notask-'));
    fs.mkdirSync(path.join(tmp, '.docpath', 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'current'), { recursive: true });
    // state.json 存在但 task_id 为空；不写 spec.md。
    fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 1, task_id: '', task_title: '', phase: 'executing', gate: 'none',
      state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
    fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb.md\n');
    fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'plan.md'), [
      '## 执行计划', '', '### S1: Orphan step', '- [ ] S1: Orphan step',
      '- **描述**: 无任务绑定的孤儿步骤', '- **验收条件**: 不应被执行', '- **依赖**: 无', '',
    ].join('\n'));
    return tmp;
  }

  it('agent step fails loud when no task_id is bound', () => {
    const cwd = mkNoTaskWorkspace();
    const out = run('agent step --step S1', cwd);
    assert.match(out, /无法解析 task_id|无任务/, 'should refuse without a bound task');
    const breadcrumb = fs.readFileSync(path.join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    assert.doesNotMatch(breadcrumb, /status: done/, 'must not record a completed step for an orphan task');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('agent done fails loud when no task_id is bound', () => {
    const cwd = mkNoTaskWorkspace();
    const out = run('agent done', cwd);
    assert.match(out, /无法解析 task_id|无任务/, 'should refuse without a bound task');
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
