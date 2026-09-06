import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const dirs = [];

function runResult(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function spec({ confirmed = false } = {}) {
  const required = confirmed ? 'x' : ' ';
  const userConfirmed = confirmed ? '2026-06-15 用户确认重大 workflow 变更' : '';
  const decisionBrief = confirmed
    ? [
        '- 当前问题: 测试重大变更前置门禁',
        '- 目标: 执行前阻断未确认的 workflow 变更',
        '- 背景: 测试',
        '- 可选方案: 后置 check / 前置 gate',
        '- 推荐方案: 前置 gate',
        '- 不做什么: 不改变输出兼容性',
        '- 成本: 测试 fixture',
        '- 风险: 误拦截',
        '- 回滚方案: 移除前置 gate',
        `- 用户确认: ${userConfirmed}`,
      ]
    : [
        '- 当前问题:',
        '- 目标:',
        '- 用户确认:',
      ];
  return [
    '# T-MAJOR - Major Gate',
    '',
    '## 1. 背景与动机',
    '',
    '测试重大变更门禁。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: 前置阻断重大变更',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持测试隔离',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- workflow gate',
    '',
    '### 不包含',
    '- 外部服务',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 测试 | 前置 / 后置 | 前置 | 防止 check 才发现 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    '- [ ] 否',
    `- [${required}] 是，需要用户确认`,
    '',
    '### 变更类型',
    `- [${required}] 工作流 / Agent 行为`,
    '',
    '### Decision Brief',
    ...decisionBrief,
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 前置门禁行为正确',
    '',
  ].join('\n');
}

function mkWorkspace({ phase = 'planning', gate = 'none', confirmed = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-major-gate-'));
  dirs.push(cwd);
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(cwd, 'templates'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: major-gate-test\n');
  writeFileSync(join(dp, '.install-meta.json'), JSON.stringify({ target: 'universal' }));
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 3,
    task_id: 'T-MAJOR',
    task_title: 'Major Gate',
    state: phase,
    phase,
    gate,
    current_step: 'S1',
    started_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), spec({ confirmed }));
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: Implement gate',
    '- [ ] S1: Implement gate',
    '- **描述**: 实现门禁',
    '- **验收条件**: 门禁生效',
    '- **依赖**: 无',
    '',
    '## Checklist',
    '- [ ] S1',
    '',
  ].join('\n'));
  writeFileSync(join(cwd, 'templates', 'AGENTS.md'), '# Agent protocol\n');
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');
  git(cwd, 'add .');
  git(cwd, 'commit -m initial');
  writeFileSync(join(cwd, 'templates', 'AGENTS.md'), '# Agent protocol\n\nChanged workflow.\n');
  return cwd;
}

describe('major change preflight gate', () => {
  after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it('next routes unconfirmed major changes to spec completion instead of execution', () => {
    const cwd = mkWorkspace({ phase: 'planning', confirmed: false });
    const result = runResult(`next --cwd ${cwd} --agent`, cwd);
    assert.equal(result.code, 0);
    const route = parse(result.out);
    assert.equal(route.recommended_command, 'docpath write-spec --stdin');
    assert.match(route.next_action, /重大变更门禁未完成/);
  });

  it('plan fails before writing when major change gate is unconfirmed', () => {
    const cwd = mkWorkspace({ phase: 'drafting', confirmed: false });
    const result = runResult(`plan --cwd ${cwd}`, cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /docpath plan: 重大变更门禁未完成/);
    assert.match(result.out, /Agent 协议模板变更/);
  });

  it('go fails before starting a step when major change gate is unconfirmed', () => {
    const cwd = mkWorkspace({ phase: 'planning', confirmed: false });
    const result = runResult(`go --cwd ${cwd} --step S1`, cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /docpath go: 重大变更门禁未完成/);
    assert.doesNotMatch(result.out, /执行子任务/);
  });

  it('agent enter fails before entering execution context when major change gate is unconfirmed', () => {
    const cwd = mkWorkspace({ phase: 'planning', confirmed: false });
    const result = runResult(`agent enter --cwd ${cwd}`, cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /docpath agent enter: 重大变更门禁未完成/);
    assert.doesNotMatch(result.out, /agent_context/);
  });

  it('allows execution route when major change gate is confirmed', () => {
    const cwd = mkWorkspace({ phase: 'planning', confirmed: true });
    const result = runResult(`next --cwd ${cwd} --agent`, cwd);
    assert.equal(result.code, 0);
    const route = parse(result.out);
    assert.equal(route.recommended_command, 'docpath go --step S1');
  });

  it('failure message is detailed and lists signal files and two outlets', () => {
    const cwd = mkWorkspace({ phase: 'planning', confirmed: false });
    const result = runResult(`go --cwd ${cwd} --step S1`, cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /检测到未提交的重大变更/);
    assert.match(result.out, /两种合法出路/);
    assert.match(result.out, /docpath write-spec --stdin/);
    assert.match(result.out, /手改 spec\.md 会被自愈覆盖/);
    assert.match(result.out, /git commit/);
  });
});

