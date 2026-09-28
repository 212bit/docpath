import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-positional-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: positional-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-POS',
    task_title: 'Positionals',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n### S1: step\n- **描述**: step\n- **验收条件**: step\n- **依赖**: 无\n');
  writeFileSync(join(cwd, 'req.md'), '# 需求\n\n- 补齐未知位置参数校验\n');
  writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-06-01
---

Alpha
`);
  return cwd;
}

function run(args, cwd) {
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(BIN)} ${args}`;
  const result = spawnSync(command, {
    cwd,
    encoding: 'utf-8',
    shell: true,
    timeout: 20000,
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

describe('CLI positional argument guards', () => {
  it('fails loud on unknown positionals for commands without positional args', () => {
    const cwd = mkWorkspace();
    const result = run('status foo', cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /未声明的位置参数/);
    assert.match(result.out, /docpath --help/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loud on extra positionals after a matched command', () => {
    const cwd = mkWorkspace();
    const result = run('agent enter extra', cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /未声明的位置参数/);
    assert.match(result.out, /extra/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps declared positional args working for valid commands', () => {
    const cwd = mkWorkspace();

    const brainstorm = run('brainstorm req.md --dry-run', cwd);
    assert.equal(brainstorm.code, 0);
    assert.match(brainstorm.out, /需求/);

    const refine = run('refine req.md --dry-run', cwd);
    assert.equal(refine.code, 0);
    assert.match(refine.out, /需求文档预览/);

    const agent = run('agent enter', cwd);
    assert.equal(agent.code, 0);
    assert.match(agent.out, /agent_context|state|phase/i);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loud on invalid command contract options', () => {
    const cwd = mkWorkspace();
    const cases = [
      ['review --scope stage', /review --scope: 参数非法/],
      ['context --max-tokens nope', /context --max-tokens: 参数非法/],
      ['reveal --level nope', /reveal --level: 参数非法/],
      ['reveal --level 4', /reveal --level: 参数非法/],
    ];

    for (const [command, pattern] of cases) {
      const result = run(command, cwd);
      assert.equal(result.code, 1, command);
      assert.match(result.out, pattern, command);
    }

    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not register the removed dashboard command', () => {
    const cwd = mkWorkspace();
    const result = run('dashboard', cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /未知命令: dashboard/);
    rmSync(cwd, { recursive: true, force: true });
  });

  // R-314: 单字母别名 s/st/c 是给人类省敲键盘的，Agent 一律走全名（trace 1460 次零命中）。
  it('does not register the removed single-letter aliases', () => {
    const cwd = mkWorkspace();

    for (const alias of ['s', 'st', 'c']) {
      const result = run(alias, cwd);
      assert.equal(result.code, 1, alias);
      assert.match(result.out, new RegExp(`未知命令: ${alias}`), alias);
    }

    const status = run('status', cwd);
    assert.equal(status.code, 0, 'status 全名仍可用');

    rmSync(cwd, { recursive: true, force: true });
  });

  // R-314: tasks 是 R-299 的 deprecated 兼容转发，版本周期已过；drift/sync 实现已下沉到 task。
  it('does not register the removed tasks forwarder', () => {
    const cwd = mkWorkspace();

    const drift = run('tasks drift', cwd);
    assert.equal(drift.code, 1);
    assert.match(drift.out, /未知命令: tasks/);

    const sync = run('tasks sync', cwd);
    assert.equal(sync.code, 1);
    assert.match(sync.out, /未知命令: tasks/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not expose stale no-op command flags', () => {
    const cwd = mkWorkspace();

    const reviewHelp = run('review --help', cwd);
    assert.equal(reviewHelp.code, 0);
    assert.doesNotMatch(reviewHelp.out, /--no-ai/);
    assert.match(reviewHelp.out, /--force/);

    const reviewForce = run('review --force --dry-run', cwd);
    assert.equal(reviewForce.code, 0);
    assert.doesNotMatch(reviewForce.out, /Unknown option|未知/);

    const staleReviewFlag = run('review --no-ai', cwd);
    assert.equal(staleReviewFlag.code, 1);
    assert.match(staleReviewFlag.out, /Unknown option|未知|--no-ai/);

    const staleWriteSpecFlag = run('write-spec --section requirements --content "# Spec"', cwd);
    assert.equal(staleWriteSpecFlag.code, 1);
    assert.match(staleWriteSpecFlag.out, /Unknown option|未知|--section/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('shows a curated default help surface with advanced and deprecated routes', () => {
    const cwd = mkWorkspace();

    const rootHelp = run('--help', cwd);
    assert.equal(rootHelp.code, 0);
    assert.match(rootHelp.out, /Core workflow commands:/);
    assert.match(rootHelp.out, /next\s+Read the recommended next route/);
    assert.match(rootHelp.out, /agent\s+Agent lifecycle/);
    assert.match(rootHelp.out, /changes\s+Read-only git closeout view/);
    assert.match(rootHelp.out, /docpath help advanced/);
    assert.doesNotMatch(rootHelp.out, /run\s+Low-level runtime/);
    assert.doesNotMatch(rootHelp.out, /brainstor\s+Typo compatibility/);

    const advancedHelp = run('help advanced', cwd);
    assert.equal(advancedHelp.code, 0);
    assert.match(advancedHelp.out, /Advanced and maintenance commands:/);
    assert.doesNotMatch(advancedHelp.out, /dashboard\s+Start the read-only dashboard/);
    assert.match(advancedHelp.out, /run\s+Low-level runtime lifecycle primitive/);

    const deprecatedHelp = run('help deprecated', cwd);
    assert.equal(deprecatedHelp.code, 0);
    assert.match(deprecatedHelp.out, /Deprecated compatibility commands:/);
    assert.doesNotMatch(deprecatedHelp.out, /tasks\s+Deprecated forward to task drift/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects newline-containing arguments loudly (R-304 输出契约)', () => {
    const cwd = mkWorkspace();
    const result = run("backlog edit R-1 --evidence-decision 'line1\nline2'", cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /参数包含换行符/);
    assert.match(result.out, /--stdin 或 --body-file/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('emitNextHint ends with a meaningful final line, no trailing blank (R-304)', async () => {
    const cwd = mkWorkspace();
    const { emitNextHint } = await import('../dist/engine/next-hint.js');
    const lines = [];
    const original = console.log;
    console.log = (msg = '') => lines.push(String(msg));
    try {
      await emitNextHint(cwd);
    } finally {
      console.log = original;
    }
    assert.ok(lines.length > 0);
    assert.notEqual(lines[lines.length - 1], '', '末行不得为空行（曾致链式脚本 tail 读空误判）');
    assert.match(lines[lines.length - 1], /exit_criteria/, '末行应为 next_hint 的收尾字段');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('removed commands fail loud as unknown (R-299 命令面收缩)', () => {
    const cwd = mkWorkspace();

    for (const removed of ['brainstor', 'disclosure', 'tdd', 'resume', 'export', 'compact', 'discover', 'retry', 'unblock']) {
      const result = run(removed, cwd);
      assert.notEqual(result.code, 0, `${removed} 应已删除`);
      assert.match(result.out, /未知命令/, `${removed} 应报未知命令`);
    }

    const removedForward = run('tasks drift', cwd);
    assert.notEqual(removedForward.code, 0, 'tasks 转发应已删除 (R-314)');
    assert.match(removedForward.out, /未知命令: tasks/);

    rmSync(cwd, { recursive: true, force: true });
  });
});

// R-333: check 的 --force（压制无会话警告）曾只在 CheckOptions 存在而未注册，
// 警告文案还引导用户加这个 flag —— 纯 CLI 契约缺口，双向锁行为。
describe('check --force registration (R-333)', () => {
  function mkIdleWorkspace() {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-force-idle-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'workspace'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: force-test\n');
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 1,
      task_id: null,
      task_title: null,
      phase: 'idle',
      gate: 'none',
      current_step: '',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
    return cwd;
  }

  it('accepts --force and suppresses the no-session warning', () => {
    const cwd = mkIdleWorkspace();
    const result = run('check --force --skip-tests --skip-lint', cwd);

    assert.doesNotMatch(result.out, /Unknown option/);
    assert.doesNotMatch(result.out, /无活跃 agent 会话/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('still warns without --force (flag carries real behavior)', () => {
    const cwd = mkIdleWorkspace();
    const result = run('check --skip-tests --skip-lint', cwd);

    assert.match(result.out, /无活跃 agent 会话/);
    assert.match(result.out, /--force/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
