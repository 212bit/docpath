import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 从 dist 直接 import — 只用导出的函数
const { writeBreadcrumb, readBreadcrumb, truncateBreadcrumb, MAX_ENTRIES } =
  await import('../dist/engine/breadcrumb.js');

const BC_PATH = (dp) => join(dp, '.docpath', 'workspace', 'breadcrumb.md');
const readRaw = (dp) => readFileSync(BC_PATH(dp), 'utf-8');

// --- write / append / read ---

describe('Breadcrumb write and read', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-wr-'));
    // writeBreadcrumb handles append: reads existing → appends → tranches
    await writeBreadcrumb(dp, { taskId: 'T-001', step: 'S1', status: 'done', context: '步骤1完成' });
    await writeBreadcrumb(dp, { taskId: 'T-001', step: 'S2', status: 'in_progress', context: '步骤2进行中' });
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('file exists after write', () => {
    assert.ok(existsSync(BC_PATH(dp)), 'breadcrumb.md should exist');
  });

  it('reads two entries', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.total, 2, `expected 2, got ${s.total}`);
    assert.equal(s.entries[0].step, 'S1');
    assert.equal(s.entries[1].step, 'S2');
  });

  it('entry has taskId field', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.entries[0].taskId, 'T-001');
  });

  it('latest points to last entry', async () => {
    const s = await readBreadcrumb(dp);
    assert.ok(s.latest, 'latest should exist');
    assert.equal(s.latest.step, 'S2');
    assert.equal(s.latest.status, 'in_progress');
  });

  it('correct status counts', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.done, 1);
    assert.equal(s.inProgress, 1);
    assert.equal(s.blocked, 0);
  });
});

// --- append behavior (multiple writes) ---

describe('Breadcrumb append', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-app-'));
    await writeBreadcrumb(dp, { taskId: 'T-100', step: 'S1.1', status: 'done', context: '第一步' });
    await writeBreadcrumb(dp, { taskId: 'T-100', step: 'S1.2', status: 'done', context: '第二步' });
    await writeBreadcrumb(dp, { taskId: 'T-100', step: 'S1.3', status: 'blocked', context: '阻塞' });
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('appends multiple entries', async () => {
    const md = readRaw(dp);
    assert.ok(md.includes('S1.1'), 'should contain S1.1');
    assert.ok(md.includes('S1.2'), 'should contain S1.2');
    assert.ok(md.includes('S1.3'), 'should contain S1.3');
  });

  it('readBreadcrumb returns all three', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.total, 3);
    assert.equal(s.done, 2);
    assert.equal(s.blocked, 1);
  });

  it('append uses "oneline" text mode', async () => {
    const s = await readBreadcrumb(dp);
    assert.ok(s.entries[2].context, 'should have context');
    assert.equal(s.entries[2].context, '阻塞');
  });
});

// --- YAML escaping ---

describe('YAML escaping', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-yaml-'));
    await writeBreadcrumb(dp, { taskId: 'task: with: colons', step: 'step "quoted"', status: 'done', context: 'ctx' });
    await writeBreadcrumb(dp, { taskId: 'normal-task', step: 'S1', status: 'done', context: 'with "quotes" inside' });
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('escapes values with special chars in YAML fields', async () => {
    const md = readRaw(dp);
    // yamlEscape wraps colons in double quotes: "task: with: colons"
    // The value should still be present, possibly quoted
    assert.ok(md.includes('task: with: colons'), 'taskId value should appear');
    assert.ok(md.includes('step "quoted"') || md.includes('"step \\"quoted\\""'), 'step value should appear');
  });

  it('preserves normal values unchanged', async () => {
    const md = readRaw(dp);
    assert.ok(md.includes('taskId: normal-task'), 'normal taskId should be unquoted');
  });
});

// --- escalation ---

describe('Breadcrumb escalation field', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-esc-'));
    await writeBreadcrumb(dp, { taskId: 'T-E', step: 'S1', status: 'blocked', context: '卡住', escalation: 'ask-user' });
    await writeBreadcrumb(dp, { taskId: 'T-E', step: 'S2', status: 'done', context: '完成' });
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('includes escalation when provided', async () => {
    const md = readRaw(dp);
    assert.ok(md.includes('escalation'), 'should have escalation field');
    assert.ok(md.includes('ask-user'), 'should have escalation value');
  });

  it('omits escalation when not provided', async () => {
    const md = readRaw(dp);
    // S2 has no escalation — the YAML block for S2 should NOT contain "escalation:"
    // Find the S2 block and check
    const s2idx = md.indexOf('step: S1');
    const afterS1 = md.slice(s2idx);
    const s2block = afterS1.slice(afterS1.indexOf('###')); // S2 block
    assert.ok(!s2block.includes('escalation:'), 'S2 should have no escalation line');
  });
});

// --- truncation ---

describe('Breadcrumb truncation', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-trunc-'));
    for (let i = 1; i <= 52; i++) {
      await writeBreadcrumb(dp, { taskId: `T-${i}`, step: `S${i}`, status: 'done', context: `step ${i}` });
    }
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('truncates to MAX_ENTRIES', async () => {
    const s = await readBreadcrumb(dp);
    assert.ok(s.entries.length <= MAX_ENTRIES, `should be <= ${MAX_ENTRIES}, got ${s.entries.length}`);
  });

  it('keeps the most recent entries', async () => {
    const s = await readBreadcrumb(dp);
    const last = s.entries[s.entries.length - 1];
    assert.equal(last.step, 'S52', 'should keep the newest');
  });

  it('drops the oldest entries', async () => {
    const s = await readBreadcrumb(dp);
    const first = s.entries[0];
    assert.equal(first.step, 'S3', 'oldest should be S3 (dropped S1,S2)');
  });
});

// --- summary helper (inline, not relying on unexported function) ---

describe('Breadcrumb summary', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-sum-'));
    await writeBreadcrumb(dp, { taskId: 'T-300', step: 'S1', status: 'done', context: '完成' });
    await writeBreadcrumb(dp, { taskId: 'T-300', step: 'S2', status: 'blocked', context: '阻塞' });
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('counts statuses correctly', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.done, 1, 'should have 1 done');
    assert.equal(s.blocked, 1, 'should have 1 blocked');
    assert.equal(s.total, 2);
  });

  it('contains expected entry content', async () => {
    const s = await readBreadcrumb(dp);
    assert.ok(s.entries[0].context.includes('完成'), 'should have context');
    assert.ok(s.entries[1].context.includes('阻塞'), 'should have context');
  });
});

// --- truncate API ---

describe('truncateBreadcrumb API', () => {
  let dp;

  before(async () => {
    dp = mkdtempSync(join(tmpdir(), 'bc-trunc-api-'));
    for (let i = 1; i <= 5; i++) {
      await writeBreadcrumb(dp, { taskId: `T-${i}`, step: `S${i}`, status: 'done', context: `step ${i}` });
    }
  });

  after(() => { rmSync(dp, { recursive: true, force: true }); });

  it('returns 0 when under limit', async () => {
    const trimmed = await truncateBreadcrumb(dp);
    assert.equal(trimmed, 0, 'should not trim when under MAX_ENTRIES');
  });

  it('entries unchanged after no-op truncate', async () => {
    await truncateBreadcrumb(dp);
    const s = await readBreadcrumb(dp);
    assert.equal(s.entries.length, 5, 'should still have 5 entries');
  });
});
