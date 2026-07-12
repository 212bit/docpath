import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let stateMachine;

before(async () => {
  stateMachine = await import('../dist/engine/state-machine.js');
});

describe('workflow state contract', () => {
  it('maps representative runtime states to phase and gate snapshots', () => {
    assert.deepEqual(stateMachine.snapshotFromState('drafting'), {
      phase: 'drafting',
      gate: 'none',
      state: 'drafting',
    });
    assert.deepEqual(stateMachine.snapshotFromState('check_pass'), {
      phase: 'checking',
      gate: 'check_pass',
      state: 'check_pass',
    });
    assert.deepEqual(stateMachine.snapshotFromState('review_skipped'), {
      phase: 'reviewing',
      gate: 'review_skipped',
      state: 'review_skipped',
    });
    assert.deepEqual(stateMachine.snapshotFromState('completed'), {
      phase: 'completed',
      gate: 'review_pass',
      state: 'completed',
    });
  });

  it('derives compatibility states from phase and gate pairs', () => {
    assert.equal(stateMachine.stateFromPhaseGate('planning', 'none'), 'planning_done');
    assert.equal(stateMachine.stateFromPhaseGate('checking', 'check_pass'), 'check_pass');
    assert.equal(stateMachine.stateFromPhaseGate('checking', 'check_fail'), 'check_fail');
    assert.equal(stateMachine.stateFromPhaseGate('reviewing', 'review_fail'), 'check_fail');
    assert.equal(stateMachine.stateFromPhaseGate('completed', 'review_skipped'), 'completed');
  });

  it('rejects unknown states and normalizes explicit phase/gate input', () => {
    assert.equal(stateMachine.normalizeWorkflowState('step_started'), null);
    assert.equal(stateMachine.snapshotFromState('step_started'), null);
    assert.deepEqual(stateMachine.normalizeWorkflowSnapshot({
      phase: 'reviewing',
      gate: 'review_pass',
      state: 'checking',
    }), {
      phase: 'reviewing',
      gate: 'review_pass',
      state: 'review_pass',
    });
  });
});
