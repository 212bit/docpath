import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// Import from TS source via tsx (handles ESM + TS natively)
const bc = await import('/Users/mac/project/docpath/src/engine/breadcrumb.ts');
const { writeBreadcrumb, readBreadcrumb, truncateBreadcrumb, MAX_ENTRIES } = bc;

const BIN = '/Users/mac/project/docpath/dist/index.js';

function run(args: string, cwd: string) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 10000 }),
    };
  } catch (e: any) {
    return { code: e.status || 1, out: e.stdout || '', err: e.stderr || '' };
  }
}

function mkproject() {
  const d = mkdtempSync(join(tmpdir(), 'dp-test-'));
  const dp = join(d, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  mkdirSync(join(dp, 'decisions'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: test\n  type: node\n');
  // state.json is the primary state source (方案 B)
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1, state: 'check_pass', task_id: 'T-001', task_title: 'Test',
    phase: 'S1', current_step: 'S1.1', started_at: '2026-05-29T00:00:00', updated_at: '2026-05-29T00:00:00',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Task\n\n## 状态\n- state: check_pass\n- task_id: T-001\n');
  writeFileSync(join(dp, 'spec', 'spec.md'), '# Spec\n\n## 功能\n- Test\n');
  writeFileSync(join(dp, 'docs.md'), '# Docs\n');
  writeFileSync(join(d, 'package.json'), '{"name":"test","version":"1.0.0","type":"module"}\n');
  return { d, dp };
}

// ─── P0: Breadcrumb YAML Frontmatter + Markdown Body ───

describe('P0: Breadcrumb YAML Frontmatter + Markdown Body', () => {
  it('writes YAML frontmatter with taskId, step, status, timestamp', async () => {
    const { d, dp } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-001', step: 'S1.1', status: 'done', context: 'Completed feature X',
    });
    const c = readFileSync(join(dp, 'workspace', 'breadcrumb.md'), 'utf-8');
    // YAML frontmatter delimited by ---
    const parts = c.split('---');
    assert.ok(parts.length >= 3, 'has at least 2 YAML delimiters (3+ parts)');
    const yamlSection = parts[1];
    assert.ok(/taskId:\s*T-001/.test(yamlSection), 'YAML has taskId');
    assert.ok(/step:\s*S1\.1/.test(yamlSection), 'YAML has step');
    assert.ok(/status:\s*done/.test(yamlSection), 'YAML has status');
    assert.ok(/timestamp:/.test(yamlSection), 'YAML has timestamp');
    rmSync(d, { recursive: true, force: true });
  });

  it('body section contains status and context', async () => {
    const { d, dp } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-002', step: 'S2.1', status: 'in_progress', context: 'Working on auth',
    });
    const c = readFileSync(join(dp, 'workspace', 'breadcrumb.md'), 'utf-8');
    const parts = c.split('---');
    const body = parts.slice(2).join('---'); // everything after 2nd delimiter
    assert.ok(body.includes('in_progress') || body.includes('🔄'), 'body has status indicator');
    assert.ok(body.includes('Working on auth'), 'body has context text');
    rmSync(d, { recursive: true, force: true });
  });

  it('handles special YAML chars (colons, quotes, hash) safely', async () => {
    const { d } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-SP', step: 'S1.1', status: 'blocked', context: 'Key: Val #404 "hi"',
    });
    const s = await readBreadcrumb(d);
    const e = s.entries.find((x: any) => x.taskId === 'T-SP');
    assert.ok(e, 'entry found');
    assert.ok(e!.context!.includes('Key: Val'), `context preserved: ${e!.context}`);
    rmSync(d, { recursive: true, force: true });
  });
});

// ─── P0: Truncation at MAX_ENTRIES=50 ───

describe('P0: Truncation at MAX_ENTRIES=50', () => {
  it('truncates when exceeding 50 entries, preserving latest', async () => {
    const { d } = mkproject();
    assert.equal(MAX_ENTRIES, 50, 'MAX_ENTRIES should be 50');
    for (let i = 1; i <= 55; i++) {
      await writeBreadcrumb(d, {
        taskId: `T-${i}`, step: `S1.${i}`, status: 'done', context: `entry ${i}`,
      });
    }
    const s = await readBreadcrumb(d);
    assert.ok(s.entries.length <= 50, `expected <=50, got ${s.entries.length}`);
    const last = s.entries[s.entries.length - 1];
    assert.ok(last.taskId.includes('55'), `last entry preserved: ${last.taskId}`);
    rmSync(d, { recursive: true, force: true });
  });
});

// ─── P0: Verification Gate (check_pass required) ───

describe('P0: Verification Gate (check_pass required)', () => {
  it('blocks journal when state is NOT check_pass', () => {
    const { d, dp } = mkproject();
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 1, state: 'in_progress', task_id: 'T-001', task_title: 'Test',
      phase: 'S1', current_step: 'S1.1', started_at: '2026-05-29T00:00:00', updated_at: '2026-05-29T00:00:00',
    }, null, 2));
    writeFileSync(
      join(dp, 'workspace', 'current.md'),
      '# Task\n\n## 状态\n- state: in_progress\n- task_id: T-001\n',
    );
    const r = run('journal', d);
    assert.notEqual(r.code, 0, 'should exit non-zero');
    const combined = r.out + (r as any).err;
    assert.ok(
      combined.includes('门禁') || combined.includes('check') || combined.includes('Verification'),
      `should mention gate: ${combined.slice(0, 200)}`,
    );
    rmSync(d, { recursive: true, force: true });
  });

  it('allows journal when state IS check_pass', () => {
    const { d } = mkproject(); // default current.md has check_pass
    const r = run('journal', d);
    assert.equal(r.code, 0, 'should exit 0');
    assert.ok(!r.out.includes('门禁未通过'), `should not block: ${r.out.slice(0, 200)}`);
    rmSync(d, { recursive: true, force: true });
  });
});

// ─── P1: YAML Round-trip (special values) ───

describe('P1: YAML Round-trip (special values)', () => {
  it('preserves colon in context values after round-trip', async () => {
    const { d } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-COL', step: 'S1.1', status: 'done', context: 'A: B: C',
    });
    const s = await readBreadcrumb(d);
    const e = s.entries.find((x: any) => x.taskId === 'T-COL');
    assert.ok(e, 'entry found');
    assert.ok(e!.context!.includes('A: B'), `colon preserved: ${e!.context}`);
    rmSync(d, { recursive: true, force: true });
  });

  it('preserves hash in context values after round-trip', async () => {
    const { d } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-HASH', step: 'S1.1', status: 'done', context: 'Error #404',
    });
    const s = await readBreadcrumb(d);
    const e = s.entries.find((x: any) => x.taskId === 'T-HASH');
    assert.ok(e, 'entry found');
    assert.ok(e!.context!.includes('#404'), `hash preserved: ${e!.context}`);
    rmSync(d, { recursive: true, force: true });
  });
});

// ─── P1: Status types round-trip ───

describe('P1: Status types (done/in_progress/blocked/skipped)', () => {
  for (const status of ['done', 'in_progress', 'blocked', 'skipped'] as const) {
    it(`preserves status: ${status}`, async () => {
      const { d } = mkproject();
      await writeBreadcrumb(d, {
        taskId: `T-${status}`, step: 'S1.1', status, context: `status test ${status}`,
      });
      const s = await readBreadcrumb(d);
      const e = s.entries.find((x: any) => x.taskId === `T-${status}`);
      assert.ok(e, 'entry found');
      assert.equal(e!.status, status);
      rmSync(d, { recursive: true, force: true });
    });
  }
});

// ─── Breadcrumb Append & Timestamps ───

describe('Breadcrumb Append & Timestamps', () => {
  it('appends multiple entries with valid ISO timestamps', async () => {
    const { d } = mkproject();
    await writeBreadcrumb(d, {
      taskId: 'T-1', step: 'S1', status: 'done', context: 'first',
    });
    await writeBreadcrumb(d, {
      taskId: 'T-2', step: 'S2', status: 'in_progress', context: 'second',
    });
    const s = await readBreadcrumb(d);
    assert.ok(s.entries.length >= 2, `has entries: ${s.entries.length}`);
    for (const e of s.entries) {
      assert.ok(e.timestamp, `${e.taskId} has timestamp`);
      assert.ok(!isNaN(Date.parse(e.timestamp)), `parseable ISO: ${e.timestamp}`);
    }
    rmSync(d, { recursive: true, force: true });
  });
});

// ─── readBreadcrumb summary ───

describe('readBreadcrumb summary', () => {
  it('returns correct counts', async () => {
    const { d } = mkproject();
    await writeBreadcrumb(d, { taskId: 'T-a', step: 'S1', status: 'done', context: 'a' });
    await writeBreadcrumb(d, { taskId: 'T-b', step: 'S2', status: 'done', context: 'b' });
    await writeBreadcrumb(d, { taskId: 'T-c', step: 'S3', status: 'in_progress', context: 'c' });
    const s = await readBreadcrumb(d);
    assert.equal(s.total, 3, 'total = 3');
    assert.equal(s.done, 2, 'done = 2');
    assert.equal(s.inProgress, 1, 'inProgress = 1');
    assert.equal(s.latest!.taskId, 'T-c', 'latest is T-c');
    rmSync(d, { recursive: true, force: true });
  });
});
