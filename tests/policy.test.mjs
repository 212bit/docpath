import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let evaluateCompletionPolicy;
let recordSkipReason;

before(async () => {
  ({ evaluateCompletionPolicy, recordSkipReason } = await import('../dist/engine/policy.js'));
});

function mkWorkspace({ gate = 'check_pass', lastCheck = 'pass' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-policy-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: policy-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-POLICY',
    task_title: 'Policy test',
    phase: gate === 'review_pass' ? 'reviewing' : 'checking',
    gate,
    current_step: 'policy test',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  if (lastCheck) {
    writeFileSync(join(dp, 'workspace', 'last-check.md'), [
      '# Last Check Evidence',
      '',
      '**时间**: 2026-05-29T00:00:00.000Z',
      `**结果**: ${lastCheck === 'pass' ? '✅ PASS' : '❌ FAIL'}`,
      '**检查项**: 1',
      '',
    ].join('\n'));
  }
  return cwd;
}

describe('completion policy', () => {
  it('blocks completion when last-check.md is missing', async () => {
    const cwd = mkWorkspace({ gate: 'check_pass', lastCheck: null });
    const verdict = await evaluateCompletionPolicy(cwd);

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reasons.some((reason) => reason.includes('last-check.md')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('blocks completion when last-check.md is failing', async () => {
    const cwd = mkWorkspace({ gate: 'check_fail', lastCheck: 'fail' });
    const verdict = await evaluateCompletionPolicy(cwd);

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reasons.some((reason) => reason.includes('未显示 PASS')));
    assert.ok(verdict.reasons.some((reason) => reason.includes('check_fail')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows completion after check pass when review is not required', async () => {
    const cwd = mkWorkspace({ gate: 'check_pass', lastCheck: 'pass' });
    const verdict = await evaluateCompletionPolicy(cwd);

    assert.equal(verdict.allowed, true, verdict.reasons.join('; '));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('requires review_pass when review is required', async () => {
    const cwd = mkWorkspace({ gate: 'check_pass', lastCheck: 'pass' });
    const verdict = await evaluateCompletionPolicy(cwd, { requireReview: true });

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reasons.some((reason) => reason.includes('review_pass')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records skip reasons in decisions.md', async () => {
    const cwd = mkWorkspace({ gate: 'check_pass', lastCheck: 'pass' });
    await recordSkipReason(cwd, 'review', 'manual approval in maintenance window');
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');

    assert.equal(existsSync(decisionsPath), true);
    const decisions = readFileSync(decisionsPath, 'utf-8');
    assert.match(decisions, /跳过 review/);
    assert.match(decisions, /manual approval in maintenance window/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
