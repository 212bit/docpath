import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

let appendDecision;
let getRecentDecisions;

before(async () => {
  ({ appendDecision, getRecentDecisions } = await import('../dist/governance/decisions.js'));
});

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-decisions-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: decisions-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-ADR',
    task_title: 'ADR support',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n\nUse structured decisions.\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [ ] S1: Add ADR\n');
  return cwd;
}

describe('structured decisions ADR', () => {
  it('writes decisions with stable ADR fields and task linkage', async () => {
    const cwd = mkWorkspace();
    await appendDecision(cwd, 'architecture', '使用 workspace/decisions.md 作为 ADR 索引', '需要长期追踪关键决策', {
      impact: 'context/reveal 可以披露最近决策',
      alternatives: ['每个任务目录单独维护 decision', '只写 journal'],
      relatedFiles: ['.docpath/workspace/decisions.md', 'src/governance/decisions.ts'],
    });
    await appendDecision(cwd, 'review', 'review 通过后追加候选 decision');

    const decisions = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
    assert.match(decisions, /## ADR-\d{8}-001 — architecture/);
    assert.match(decisions, /## ADR-\d{8}-002 — review/);
    assert.match(decisions, /- task_id: T-ADR/);
    assert.match(decisions, /### 背景/);
    assert.match(decisions, /### 决策/);
    assert.match(decisions, /### 影响/);
    assert.match(decisions, /### 替代方案/);
    assert.match(decisions, /### 相关文件/);
    assert.match(decisions, /.docpath\/workspace\/decisions.md/);

    const recent = await getRecentDecisions(cwd, 1);
    assert.equal(recent.length, 1);
    assert.match(recent[0], /ADR-\d{8}-002/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('includes recent decisions in reveal level 2 context', async () => {
    const cwd = mkWorkspace();
    await appendDecision(cwd, 'architecture', 'Reveal 需要包含最近 ADR', 'Agent 恢复时需要知道设计取舍', {
      relatedFiles: ['src/commands/reveal.ts'],
    });

    const output = execSync(`node ${BIN} reveal --cwd ${cwd} --level 2 --format raw`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
    });

    assert.match(output, /相关决策摘要 \(decisions\)/);
    assert.match(output, /ADR-\d{8}-001 — architecture/);
    assert.match(output, /Reveal 需要包含最近 ADR/);
    assert.match(output, /task_id: T-ADR/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
