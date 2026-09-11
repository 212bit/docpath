/**
 * R-334 agent_flow 特性测试
 *
 * 覆盖 FR-1 (config), FR-6 (evidence types), FR-7 (CJK unquote)
 * FR-3 (plan compression) / FR-4 (completion) / FR-2 (major gate) 由
 * docpath check 端到端覆盖（需完整生命周期基础设施）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ─── FR-6: evidence narrow union + parse validators ─── */

describe('parseCheckCategory / parseCheckSeverity (FR-6)', async () => {
  const { parseCheckCategory, parseCheckSeverity } = await import('../dist/utils/workspace-evidence.js');
  const { CHECK_CATEGORIES, CHECK_SEVERITIES } = await import('../dist/commands/check/types.js');

  it('returns valid category for known values', () => {
    for (const cat of CHECK_CATEGORIES) {
      assert.equal(parseCheckCategory(cat), cat);
    }
  });

  it('returns undefined for unknown category', () => {
    assert.equal(parseCheckCategory('unknown'), undefined);
  });

  it('returns undefined for undefined input', () => {
    assert.equal(parseCheckCategory(undefined), undefined);
  });

  it('returns valid severity for known values', () => {
    assert.equal(parseCheckSeverity('error'), 'error');
    assert.equal(parseCheckSeverity('warning'), 'warning');
  });

  it('returns undefined for unknown severity', () => {
    assert.equal(parseCheckSeverity('fatal'), undefined);
    assert.equal(parseCheckSeverity(undefined), undefined);
  });
});

/* ─── FR-1: config readAgentFlow ─── */

describe('readAgentFlow config (FR-1)', async () => {
  const { readAgentFlow } = await import('../dist/utils/config.js');

  it('returns false when workflow.agent_flow is not set', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'r334-no-agent-'));
    mkdirSync(join(cwd, '.docpath'), { recursive: true });
    writeFileSync(join(cwd, '.docpath/config.yaml'), 'default_level: 1\n');
    assert.equal(await readAgentFlow(cwd), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns true when workflow.agent_flow is set to true', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'r334-agent-'));
    mkdirSync(join(cwd, '.docpath'), { recursive: true });
    writeFileSync(join(cwd, '.docpath/config.yaml'), 'workflow:\n  agent_flow: true\n');
    assert.equal(await readAgentFlow(cwd), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns false when workflow.agent_flow is false', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'r334-explicit-false-'));
    mkdirSync(join(cwd, '.docpath'), { recursive: true });
    writeFileSync(join(cwd, '.docpath/config.yaml'), 'workflow:\n  agent_flow: false\n');
    assert.equal(await readAgentFlow(cwd), false);
    rmSync(cwd, { recursive: true, force: true });
  });
});

/* ─── FR-7: CJK path unquote (git-dirty-guard) ─── */

describe('CJK path recognition (FR-7)', async () => {
  const { detectDirtyWorktree } = await import('../dist/utils/git-dirty-guard.js');

  function mkGitRepo() {
    const cwd = mkdtempSync(join(tmpdir(), 'r334-cjk-'));
    execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test'], { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'a.txt'), 'init\n');
    execFileSync('git', ['add', 'a.txt'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd, stdio: 'ignore' });
    return cwd;
  }

  it('correctly parses CJK untracked filenames', () => {
    const cwd = mkGitRepo();
    writeFileSync(join(cwd, '测试中文.md'), 'test');
    const report = detectDirtyWorktree(cwd);
    assert.ok(report.files.includes('测试中文.md'), `Expected CJK file in files, got: ${report.files}`);
    assert.ok(report.nonDocPathFiles.includes('测试中文.md'), 'CJK file should be in nonDocPathFiles');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('correctly parses CJK filenames in staged changes', () => {
    const cwd = mkGitRepo();
    writeFileSync(join(cwd, '提交记录.md'), 'test');
    execFileSync('git', ['add', '提交记录.md'], { cwd, stdio: 'ignore' });
    const report = detectDirtyWorktree(cwd);
    assert.ok(report.files.includes('提交记录.md'), `Expected staged CJK file, got: ${report.files}`);
    rmSync(cwd, { recursive: true, force: true });
  });
});

/* ─── FR-3: renderDraftPlan agentFlow compression ─── */

describe('renderDraftPlan agentFlow (FR-3)', async () => {
  const { renderDraftPlan } = await import('../dist/commands/plan.js');

  const spec = '# T-20260911-test\n\n## 2. 需求\n\n### 功能需求\n- [ ] FR-1: 小功能\n- [ ] FR-2: 另一个功能\n\n## 5. 验收标准\n\n- [ ] AC-1: 能跑就行\n';

  it('level-2 without agentFlow generates 3-step plan', () => {
    const plan = renderDraftPlan(spec, 2, false);
    assert.ok(plan.includes('### S1:'), 'Should have S1');
    assert.ok(plan.includes('### S2:'), 'Should have S2');
    assert.ok(plan.includes('### S3:'), 'Should have S3');
  });

  it('level-2 with agentFlow generates single-step plan', () => {
    const plan = renderDraftPlan(spec, 2, true);
    assert.ok(plan.includes('### S1:'), 'Should have S1');
    assert.ok(!plan.includes('### S2:'), 'Should NOT have S2');
    assert.ok(plan.includes('R-334'), 'Should note R-334 compression');
  });

  it('level-1 always generates single-step plan', () => {
    const plan = renderDraftPlan(spec, 1, false);
    assert.ok(plan.includes('### S1:'));
    assert.ok(!plan.includes('### S2:'));
  });
});
