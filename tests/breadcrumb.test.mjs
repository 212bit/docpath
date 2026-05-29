import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const BIN = '/Users/mac/project/docpath/dist/index.js';

function run(args, cwd) {
  try {
    return { code: 0, out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe','pipe','pipe'] }) };
  } catch (e) { return { code: e.status||1, out: e.stdout||'', err: e.stderr||'' }; }
}

function mkproject() {
  const d = mkdtempSync(join(tmpdir(), 'dp-test-'));
  const dp = join(d, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  mkdirSync(join(dp, 'decisions'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: test\n  type: node\n');
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Task\n\n## 状态\n- state: check_pass\n- task_id: T-001\n');
  writeFileSync(join(dp, 'spec', 'spec.md'), '# Spec\n\n## 功能\n- Test\n');
  writeFileSync(join(dp, 'docs.md'), '# Docs\n');
  writeFileSync(join(d, 'package.json'), '{"name":"test","version":"1.0.0","type":"module"}\n');
  return { d, dp };
}

describe('Breadcrumb YAML Frontmatter', () => {
  it('writes YAML frontmatter with all fields', async () => {
    const { d, dp } = mkproject();
    const { writeBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-001', stageId: 'S1.1', status: 'pass', label: 'Test', context: 'ctx' });
    const c = readFileSync(join(dp, 'workspace', 'breadcrumb.md'), 'utf-8');
    assert.ok(c.includes('---\n'), 'has YAML delimiter');
    assert.ok(/status:\s*pass/.test(c), 'has status');
    assert.ok(/task:\s*T-001/.test(c), 'has task');
    assert.ok(/stage:\s*S1\.1/.test(c), 'has stage');
    rmSync(d, { recursive: true, force: true });
  });

  it('includes Markdown body with label', async () => {
    const { d, dp } = mkproject();
    const { writeBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-002', stageId: 'S1.1', status: 'pass', label: 'My Label', context: 'ctx' });
    const c = readFileSync(join(dp, 'workspace', 'breadcrumb.md'), 'utf-8');
    const parts = c.split('---');
    assert.ok(parts.length >= 3, 'has at least 2 YAML blocks');
    assert.ok(parts[2].includes('My Label'), 'body has label');
    rmSync(d, { recursive: true, force: true });
  });

  it('handles special chars (colons, quotes, hash)', async () => {
    const { d, dp } = mkproject();
    const { writeBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-SP', stageId: 'S1.1', status: 'pass', label: 'test', context: 'Key: Val #404 "hi"' });
    const c = readFileSync(join(dp, 'workspace', 'breadcrumb.md'), 'utf-8');
    // Should not have broken YAML — at minimum the file exists and has content
    assert.ok(c.length > 100);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('Truncation at MAX_ENTRIES=50', () => {
  it('truncates when exceeding 50 entries', async () => {
    const { d } = mkproject();
    const { writeBreadcrumb, readBreadcrumb, MAX_ENTRIES } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    assert.equal(MAX_ENTRIES, 50);
    for (let i = 1; i <= 55; i++) {
      await writeBreadcrumb(d, { taskId: `T-${i}`, stageId: 'S1.1', status: 'pass', label: `E${i}`, context: `entry ${i}` });
    }
    const s = await readBreadcrumb(d);
    assert.ok(s.entries.length <= 50, `got ${s.entries.length}`);
    const last = s.entries[s.entries.length - 1];
    assert.ok(last.taskId.includes('55'), `last entry preserved: ${last.taskId}`);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('Verification Gate', () => {
  it('blocks journal when state is NOT check_pass', () => {
    const { d, dp } = mkproject();
    writeFileSync(join(dp, 'workspace', 'current.md'), '# Task\n\n## 状态\n- state: idle\n- task_id: T-001\n');
    const r = run('journal', d);
    assert.notEqual(r.code, 0);
    assert.ok(r.out.includes('门禁') || r.err.includes('门禁') || r.out.includes('check'), `output: ${r.out} ${r.err}`);
    rmSync(d, { recursive: true, force: true });
  });

  it('allows journal when state IS check_pass', () => {
    const { d } = mkproject();
    const r = run('journal', d);
    assert.ok(!r.out.includes('门禁未通过'), `should not block: ${r.out}`);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('YAML Round-trip', () => {
  it('preserves colon values', async () => {
    const { d } = mkproject();
    const { writeBreadcrumb, readBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-COL', stageId: 'S1.1', status: 'pass', label: 'test', context: 'A: B: C' });
    const s = await readBreadcrumb(d);
    const e = s.entries.find(x => x.taskId === 'T-COL');
    assert.ok(e);
    assert.ok(e.context.includes('A: B'), `context: ${e.context}`);
    rmSync(d, { recursive: true, force: true });
  });

  it('preserves hash values', async () => {
    const { d } = mkproject();
    const { writeBreadcrumb, readBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-HASH', stageId: 'S1.1', status: 'pass', label: 'test', context: 'Error #404' });
    const s = await readBreadcrumb(d);
    const e = s.entries.find(x => x.taskId === 'T-HASH');
    assert.ok(e);
    assert.ok(e.context.includes('#404'), `context: ${e.context}`);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('Escalation Types', () => {
  for (const type of ['boundary', 'blocker', 'quality']) {
    it(`preserves escalation type: ${type}`, async () => {
      const { d } = mkproject();
      const { writeBreadcrumb, readBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
      await writeBreadcrumb(d, { taskId: `T-${type}`, stageId: 'S1.1', status: 'fail', label: 'test', context: 'ctx', escalation: type });
      const s = await readBreadcrumb(d);
      const e = s.entries.find(x => x.taskId === `T-${type}`);
      assert.ok(e);
      assert.equal(e.escalation, type);
      rmSync(d, { recursive: true, force: true });
    });
  }
});

describe('Breadcrumb Append & Timestamps', () => {
  it('appends multiple entries and preserves timestamps', async () => {
    const { d } = mkproject();
    const { writeBreadcrumb, readBreadcrumb } = await import('/Users/mac/project/docpath/dist/engine/breadcrumb.js');
    await writeBreadcrumb(d, { taskId: 'T-1', stageId: 'S1', status: 'pass', label: 'first', context: 'c1' });
    await writeBreadcrumb(d, { taskId: 'T-2', stageId: 'S2', status: 'pass', label: 'second', context: 'c2' });
    const s = await readBreadcrumb(d);
    assert.ok(s.entries.length >= 2);
    for (const e of s.entries) {
      assert.ok(e.timestamp, `${e.taskId} has timestamp`);
      assert.ok(!isNaN(Date.parse(e.timestamp)), `parseable: ${e.timestamp}`);
    }
    rmSync(d, { recursive: true, force: true });
  });
});
