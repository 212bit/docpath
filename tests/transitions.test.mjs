import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let transitionWorkflow;

before(async () => {
  ({ transitionWorkflow } = await import('../dist/engine/transitions.js'));
});

function mkWorkspace({ phase = 'executing', gate = 'none' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-transition-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: transition-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-TRANS',
    task_title: 'Transition test',
    phase,
    gate,
    current_step: 'S1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  return cwd;
}

function readState(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
}

describe('transitionWorkflow', () => {
  it('creates missing workspace directory before acquiring the state lock', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-transition-missing-workspace-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(dp, { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: transition-test\n');

    const next = await transitionWorkflow(cwd, 'task.created', {
      taskId: 'T-MISSING-WORKSPACE',
      taskTitle: 'Missing workspace',
    });
    const persisted = readState(cwd);

    assert.equal(next.phase, 'drafting');
    assert.equal(persisted.phase, 'drafting');
    assert.equal(persisted.task_id, 'T-MISSING-WORKSPACE');
    assert.equal(existsSync(join(dp, 'workspace', 'current.md')), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes check.passed as checking/check_pass without legacy state', async () => {
    const cwd = mkWorkspace();
    const next = await transitionWorkflow(cwd, 'check.passed', { currentStep: 'checks passed' });
    const persisted = readState(cwd);

    assert.equal(next.state, 'check_pass');
    assert.equal(next.phase, 'checking');
    assert.equal(next.gate, 'check_pass');
    assert.equal(persisted.phase, 'checking');
    assert.equal(persisted.gate, 'check_pass');
    assert.equal(Object.hasOwn(persisted, 'state'), false);
    assert.equal(persisted.current_step, 'checks passed');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes review.failed as reviewing/review_fail', async () => {
    const cwd = mkWorkspace({ phase: 'checking', gate: 'check_pass' });
    await transitionWorkflow(cwd, 'review.failed');
    const persisted = readState(cwd);

    assert.equal(persisted.phase, 'reviewing');
    assert.equal(persisted.gate, 'review_fail');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records a failed re-check from completed state', async () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    await transitionWorkflow(cwd, 'check.failed', { currentStep: 're-check failed' });
    const persisted = readState(cwd);

    assert.equal(persisted.phase, 'checking');
    assert.equal(persisted.gate, 'check_fail');
    assert.equal(persisted.current_step, 're-check failed');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes journal.archived as completed/review_pass', async () => {
    const cwd = mkWorkspace({ phase: 'reviewing', gate: 'review_pass' });
    await transitionWorkflow(cwd, 'journal.archived');
    const persisted = readState(cwd);

    assert.equal(persisted.phase, 'completed');
    assert.equal(persisted.gate, 'review_pass');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects unsupported events clearly', async () => {
    const cwd = mkWorkspace();
    await assert.rejects(
      () => transitionWorkflow(cwd, 'unknown.event'),
      /Unsupported workflow event/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects illegal phase transitions clearly', async () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none' });
    await assert.rejects(
      () => transitionWorkflow(cwd, 'journal.archived'),
      /Illegal workflow transition: journal\.archived cannot run from phase=executing/,
    );
    await assert.rejects(
      () => transitionWorkflow(cwd, 'journal.archived'),
      /允许来源: checking, reviewing, journaling, completed/,
    );
    await assert.rejects(
      () => transitionWorkflow(cwd, 'journal.archived'),
      /建议下一步: docpath check 或 docpath review/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });
});
