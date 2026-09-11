import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'planning', gate = 'none', planDone = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-hooks-'));
  const workspace = path.join(cwd, '.docpath', 'workspace');
  const current = path.join(cwd, '.docpath', 'tasks', 'current');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(current, { recursive: true });
  fs.writeFileSync(path.join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: hooks-test\n');
  fs.writeFileSync(path.join(workspace, 'state.json'), JSON.stringify({
    level: 3,
    workflow_profile: 'standard',
    state: phase,
    task_id: 'T-HOOKS',
    task_title: 'Hooks Bridge',
    phase,
    gate,
    current_step: 'S1',
    started_at: '2026-07-13T00:00:00.000Z',
    updated_at: '2026-07-13T00:00:00.000Z',
  }, null, 2));
  fs.writeFileSync(path.join(workspace, 'current.md'), '# Current\n');
  fs.writeFileSync(path.join(workspace, 'breadcrumb.md'), '# Breadcrumb\n');
  fs.writeFileSync(path.join(current, 'spec.md'), [
    '# T-HOOKS - Hooks Bridge',
    '',
    '## 1. 背景与动机',
    'Test hooks bridge.',
    '',
    '## 2. 需求清单',
    '### 功能需求',
    '- [ ] FR-1: hooks status',
    '',
    '## 5. 验收标准',
    '- [ ] AC-1: snapshot is generated',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(current, 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: Build snapshot',
    `- [${planDone ? 'x' : ' '}] S1: Build snapshot`,
    '- **描述**: Generate snapshot',
    '- **验收条件**: snapshot generated',
    '- **依赖**: 无',
    '',
    '### S2: Next step',
    '- [ ] S2: Next step',
    '- **描述**: Continue',
    '- **验收条件**: continues',
    '- **依赖**: S1',
    '',
  ].join('\n'));
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
}

function runFail(args, cwd) {
  try {
    run(args, cwd);
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`;
  }
  throw new Error(`expected command to fail: ${args}`);
}

describe('hooks snapshot bridge', () => {
  it('emits an agent snapshot with canonical transition events', () => {
    const cwd = mkWorkspace({ phase: 'checking', gate: 'check_pass' });
    const out = run('hooks status --agent', cwd);
    const snapshot = parse(out);

    assert.equal(snapshot.kind, 'agent_snapshot');
    assert.equal(snapshot.phase, 'checking');
    assert.equal(snapshot.gate, 'check_pass');
    assert.equal(snapshot.current_step, 'S1');
    assert.equal(typeof snapshot.recommended_command, 'string');
    assert.equal(snapshot.drift_lock, false);
    assert.ok(snapshot.next_valid_events.some((event) => event.event === 'review.passed'));
    assert.ok(fs.existsSync(path.join(cwd, '.docpath', 'workspace', 'agent-snapshot.json')));
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('raises drift_lock and blocks go when plan/breadcrumb drift exists', () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none', planDone: true });
    const snapshot = parse(run('hooks status --agent', cwd));

    assert.equal(snapshot.drift, true);
    assert.equal(snapshot.drift_lock, true);

    const out = runFail('go --step S2', cwd);
    assert.match(out, /drift_lock active/);
    // R-337 W2: 按漂移类型给直接修复命令
    assert.match(out, /write-plan --stdin|agent step --step/);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('refreshes the persisted snapshot after a go state transition', () => {
    const cwd = mkWorkspace({ phase: 'planning', gate: 'none' });
    run('go --step S1', cwd);
    const snapshotPath = path.join(cwd, '.docpath', 'workspace', 'agent-snapshot.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    assert.equal(snapshot.phase, 'executing');
    assert.equal(snapshot.current_step, 'S1');
    assert.equal(snapshot.drift_lock, false);
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
