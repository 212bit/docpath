import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-handoff-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: handoff-test\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: done\n- [ ] S2: blocked work\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-HANDOFF',
    task_title: 'Handoff package',
    phase: 'executing',
    gate: 'check_fail',
    current_step: 'S2',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-05-29T00:00:00.000Z',
    '**结果**: ❌ FAIL',
    '**检查项**: 1',
    '',
    '- ❌ TypeScript 编译',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-HANDOFF] — 2026-05-29T00:00:00.000Z',
    '',
    '---',
    'taskId: T-HANDOFF',
    'step: S1',
    'status: done',
    'timestamp: 2026-05-29T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: completed setup',
    '',
    '### 🚫 S2 [T-HANDOFF] — 2026-05-29T00:10:00.000Z',
    '',
    '---',
    'taskId: T-HANDOFF',
    'step: S2',
    'status: blocked',
    'timestamp: 2026-05-29T00:10:00.000Z',
    '---',
    '',
    '- **状态**: blocked',
    '- **上下文**: compiler failure',
    '',
  ].join('\n'));
  return cwd;
}

function mkPassingWorkspace() {
  const cwd = mkWorkspace();
  const dp = join(cwd, '.docpath');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-HANDOFF',
    task_title: 'Handoff package',
    phase: 'reviewing',
    gate: 'review_pass',
    current_step: 'review',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:30:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: done\n- [x] S2: verified\n');
  writeFileSync(join(dp, 'workspace', 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-05-29T00:20:00.000Z',
    '**结果**: ✅ PASS',
    '**检查项**: 2',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'review.md'), [
    '# Code Review Report',
    '',
    '**时间**: 2026-05-29T00:25:00.000Z',
    '**状态**: ✅ PASS',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-HANDOFF] — 2026-05-29T00:00:00.000Z',
    '',
    '---',
    'taskId: T-HANDOFF',
    'step: S1',
    'status: done',
    'timestamp: 2026-05-29T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: completed setup',
    '',
    '### ✅ S2 [T-HANDOFF] — 2026-05-29T00:10:00.000Z',
    '',
    '---',
    'taskId: T-HANDOFF',
    'step: S2',
    'status: done',
    'timestamp: 2026-05-29T00:10:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: verified work',
    '',
  ].join('\n'));
  return cwd;
}

describe('agent handoff package', () => {
  it('writes a resumable compact context with next route, blockers, and evidence', () => {
    const cwd = mkWorkspace();
    execSync(`node ${BIN} agent handoff --cwd ${cwd} --max-entries 5`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const handoff = readFileSync(join(cwd, '.docpath', 'workspace', 'compact-context.md'), 'utf-8');
    assert.match(handoff, /# Context Handoff — T-HANDOFF/);
    assert.match(handoff, /## Current State: executing \/ check_fail/);
    assert.match(handoff, /## Goal: Handoff package/);
    assert.match(handoff, /## Progress: 1\/2/);
    assert.match(handoff, /## Recent Failures/);
    assert.match(handoff, /S2: compiler failure/);
    assert.match(handoff, /## Next Action/);
    assert.match(handoff, /recommended_command: docpath debug reproduce/);
    assert.match(handoff, /## Handoff Readiness/);
    assert.match(handoff, /status: blocked/);
    assert.match(handoff, /不要直接继续完成任务/);
    assert.match(handoff, /## Remaining Risks/);
    assert.match(handoff, /check 未通过或缺失/);
    assert.match(handoff, /review 未通过或缺失/);
    assert.match(handoff, /## Verification Status/);
    assert.match(handoff, /review: 未找到 review\.md/);
    assert.match(handoff, /## Change Scope/);
    assert.match(handoff, /git_status: unavailable/);
    assert.match(handoff, /## Required Reading/);
    assert.match(handoff, /.docpath\/workspace\/last-check.md/);
    assert.match(handoff, /## Resume Protocol/);
    assert.match(handoff, /Start with `docpath next --agent`/);
    assert.match(handoff, /Treat `next --agent` as advisory routing/);
    assert.match(handoff, /Explicit deterministic commands may run directly/);
    assert.match(handoff, /Use `docpath status --agent` only for explicit status\/debug snapshots/);
    assert.match(handoff, /handoff summary, not as a replacement for the CLI route/);
    assert.match(handoff, /## Current Goal/);
    assert.match(handoff, /## Current Blockers/);
    assert.match(handoff, /## Verification Evidence/);
    assert.match(handoff, /❌ FAIL/);
    assert.match(handoff, /TypeScript 编译/);
    assert.match(handoff, /plan: 1\/2 完成/);
    assert.match(handoff, /## Required Files Before Resume/);
    assert.match(handoff, /.docpath\/workspace\/breadcrumb.md/);
    assert.match(handoff, /.docpath\/workspace\/review.md/);
    assert.match(handoff, /.docpath\/tasks\/current\/plan.md/);
    assert.match(handoff, /## Next Agent Route/);
    assert.match(handoff, /```yaml/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('marks a verified handoff as ready and keeps team takeover cues', () => {
    const cwd = mkPassingWorkspace();
    execSync(`node ${BIN} agent handoff --cwd ${cwd} --max-entries 5`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const handoff = readFileSync(join(cwd, '.docpath', 'workspace', 'compact-context.md'), 'utf-8');
    assert.match(handoff, /## Handoff Readiness/);
    assert.match(handoff, /status: ready_for_handoff/);
    assert.match(handoff, /## Verification Status/);
    assert.match(handoff, /last_check: ✅ PASS/);
    assert.match(handoff, /review: ✅ PASS/);
    assert.match(handoff, /## Remaining Risks/);
    assert.match(handoff, /未发现阻塞态/);
    assert.match(handoff, /## Change Scope/);
    assert.match(handoff, /git_status: unavailable/);
    assert.match(handoff, /## Resume Protocol/);
    assert.match(handoff, /Start with `docpath next --agent`/);
    assert.match(handoff, /Treat `next --agent` as advisory routing/);
    assert.match(handoff, /Explicit deterministic commands may run directly/);
    assert.match(handoff, /Use `docpath status --agent` only for explicit status\/debug snapshots/);
    assert.match(handoff, /plan: 2\/2 完成/);
    assert.doesNotMatch(handoff, /不要直接继续完成任务/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
