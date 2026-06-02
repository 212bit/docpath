import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
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
    phase: 'drafting',
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

    const debug = run('debug reproduce', cwd);
    assert.equal(debug.code, 0);
    assert.match(debug.out, /调试会话/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
