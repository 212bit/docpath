import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let reassessRiskTier;
let recordRiskEscalation;
let appendDecision;

before(async () => {
  ({ reassessRiskTier } = await import('../dist/engine/risk.js'));
  ({ recordRiskEscalation } = await import('../dist/engine/policy.js'));
  ({ appendDecision } = await import('../dist/governance/decisions.js'));
});

describe('risk re-evaluation (R-338 S4)', () => {
  it('never lowers a recorded tier (只升不降)', () => {
    const result = reassessRiskTier(3, { files: ['docs/readme.md'] });
    assert.equal(result.baseline, 3);
    assert.equal(result.tier, 3);
    assert.equal(result.escalated, false);
  });

  it('escalates when the actual diff touches critical paths', () => {
    const result = reassessRiskTier(1, { files: ['.github/workflows/ci.yml'] });
    assert.equal(result.tier, 3);
    assert.equal(result.escalated, true);
    assert.ok(result.reasons.some((r) => r.includes('CI/CD')));
  });

  it('does not flag escalation when tier equals baseline (no audit noise)', () => {
    const result = reassessRiskTier(3, { files: ['.github/workflows/ci.yml'] });
    assert.equal(result.tier, 3);
    assert.equal(result.escalated, false);
  });

  it('falls back unrecorded tasks to R1 baseline without audit noise', () => {
    const quiet = reassessRiskTier(undefined, { files: ['src/app/main.ts'] });
    assert.equal(quiet.baseline, 1);
    assert.equal(quiet.tier, 1);
    assert.equal(quiet.escalated, false);

    const loud = reassessRiskTier(undefined, { files: ['db/migrations/001.sql'] });
    assert.equal(loud.tier, 3);
    assert.equal(loud.escalated, true);
  });

  it('writes an audit record via recordRiskEscalation (governance decisions)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-risk-esc-'));
    try {
      mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
      await recordRiskEscalation(cwd, 1, 3, ['.github/workflows/ci.yml: CI/CD 配置变更']);
      const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
      assert.ok(existsSync(decisionsPath), 'decisions.md should exist');
      const content = readFileSync(decisionsPath, 'utf-8');
      assert.ok(content.includes('R1 → R3'));
      assert.ok(content.includes('CI/CD 配置变更'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('check persists escalated risk_tier into state.json (integration)', { timeout: 60000 }, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-risk-check-'));
    try {
      execSync('git init -q && git config user.email t@t && git config user.name t', { cwd });
      writeFileSync(join(cwd, 'README.md'), '# fixture\n');
      execSync('git add -A && git commit -qm init', { cwd });

      const workspace = join(cwd, '.docpath', 'workspace');
      const tasks = join(cwd, '.docpath', 'tasks', 'current');
      mkdirSync(workspace, { recursive: true });
      mkdirSync(tasks, { recursive: true });
      writeFileSync(join(workspace, 'state.json'), JSON.stringify({
        level: 1,
        workflow_profile: 'quick',
        state: 'executing',
        task_id: 'T-RISK',
        task_title: 'Fix typo in readme',
        phase: 'executing',
        gate: 'none',
        current_step: 'S1',
        started_at: '2026-09-12T00:00:00.000Z',
        updated_at: '2026-09-12T00:00:00.000Z',
      }));
      writeFileSync(join(tasks, 'spec.md'), '# T-RISK - Fix typo in readme\n\n## 需求\n- [ ] FR-1: 修正拼写\n');
      writeFileSync(join(cwd, 'README.md'), '# fixture changed\n');
      // 触碰 CI/CD 路径 → 复评应升 R3 并落盘
      const gh = join(cwd, '.github', 'workflows');
      mkdirSync(gh, { recursive: true });
      writeFileSync(join(gh, 'ci.yml'), 'on: push\n');

      const CLI = new URL('../dist/index.js', import.meta.url).pathname;
      let output = '';
      try {
        output = execSync(`node ${CLI} check`, { cwd, encoding: 'utf-8', timeout: 50000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        output = (e.stdout || '') + '\n' + (e.stderr || '');
      }
      assert.ok(output.includes('风险复评升级'), `expected escalation notice in output:\n${output.slice(0, 2000)}`);

      const state = JSON.parse(readFileSync(join(workspace, 'state.json'), 'utf-8'));
      assert.equal(state.risk_tier, 3);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
