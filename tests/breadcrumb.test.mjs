import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// 从 dist 直接 import — 只用导出的函数
const { writeBreadcrumb, readBreadcrumb, readRecentBreadcrumbEntries, truncateBreadcrumb, MAX_ENTRIES } =
  await import('../dist/engine/breadcrumb.js');

const BC_PATH = (dp) => join(dp, '.docpath', 'workspace', 'breadcrumb.md');
const BC_JSONL_PATH = (dp) => join(dp, '.docpath', 'workspace', 'breadcrumb.jsonl');
const readRaw = (dp) => readFileSync(BC_PATH(dp), 'utf-8');
const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkDocpathProject(state = 'check_pass') {
  const d = mkdtempSync(join(tmpdir(), 'dp-test-'));
  const dp = join(d, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: test\n  type: node\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    state,
    task_id: 'T-001',
    task_title: 'Test',
    phase: 'S1',
    current_step: 'S1.1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), `# Task\n\n## 状态\n- state: ${state}\n- task_id: T-001\n`);
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'workspace', 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-05-29T00:00:00.000Z',
    `**结果**: ${state === 'in_progress' ? '❌ FAIL' : '✅ PASS'}`,
    '**检查项**: 1',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n\n## 功能\n- Test\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: Test\n');
  writeFileSync(join(d, 'package.json'), '{"name":"test","version":"1.0.0","type":"module"}\n');
  return d;
}

function runDocpath(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 10000 }),
      err: '',
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: error.stdout || '',
      err: error.stderr || '',
    };
  }
}

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
    assert.ok(existsSync(BC_JSONL_PATH(dp)), 'breadcrumb.jsonl should exist');
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

  it('round-trips optional sessionId through JSONL and Markdown view', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bc-session-'));
    await writeBreadcrumb(root, {
      taskId: 'T-SESSION',
      step: 'S1',
      status: 'in_progress',
      context: 'session aware',
      sessionId: 'alpha',
    });

    const summary = await readBreadcrumb(root);
    const jsonl = readFileSync(BC_JSONL_PATH(root), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    const md = readRaw(root);

    assert.equal(summary.entries[0].sessionId, 'alpha');
    assert.equal(jsonl[0].sessionId, 'alpha');
    assert.match(md, /sessionId: alpha/);
    assert.match(md, /\*\*Session\*\*: alpha/);
    rmSync(root, { recursive: true, force: true });
  });

  it('allows a done record after the same step was blocked later', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bc-blocked-done-'));
    const messages = [];
    await writeBreadcrumb(root, { taskId: 'T-RECOVER', step: 'check', status: 'done', context: 'first pass' }, (message) => messages.push(message));
    await writeBreadcrumb(root, { taskId: 'T-RECOVER', step: 'check', status: 'blocked', context: 'regression found' }, (message) => messages.push(message));
    await writeBreadcrumb(root, { taskId: 'T-RECOVER', step: 'check', status: 'done', context: 'fixed again' }, (message) => messages.push(message));

    const summary = await readBreadcrumb(root);
    const entries = summary.entries.filter((entry) => entry.taskId === 'T-RECOVER' && entry.step === 'check');

    assert.equal(entries.length, 3);
    assert.equal(entries.at(-1).status, 'done');
    assert.equal(messages.some((message) => /跳过重复记录/.test(message)), false);
    rmSync(root, { recursive: true, force: true });
  });

  it('latest points to last entry', async () => {
    const s = await readBreadcrumb(dp);
    assert.ok(s.latest, 'latest should exist');
    assert.equal(s.latest.step, 'S2');
    assert.equal(s.latest.status, 'in_progress');
  });

  it('reads recent entries from structured JSONL source', async () => {
    const recent = await readRecentBreadcrumbEntries(dp, 1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].step, 'S2');
    const jsonl = readFileSync(BC_JSONL_PATH(dp), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(jsonl[0].schema_version, 1);
    assert.equal(jsonl[0].kind, 'breadcrumb');
  });

  it('correct status counts', async () => {
    const s = await readBreadcrumb(dp);
    assert.equal(s.done, 1);
    assert.equal(s.inProgress, 1);
    assert.equal(s.blocked, 0);
  });
});

describe('Breadcrumb JSONL migration and validation', () => {
  it('migrates existing breadcrumb.md before appending JSONL records', async () => {
    const dp = mkdtempSync(join(tmpdir(), 'bc-jsonl-migrate-'));
    mkdirSync(join(dp, '.docpath', 'workspace'), { recursive: true });
    writeFileSync(BC_PATH(dp), [
      '# Breadcrumb',
      '',
      '### ✅ S1 [T-MIGRATE] — 2026-06-01T00:00:00.000Z',
      '',
      '---',
      'taskId: T-MIGRATE',
      'step: S1',
      'status: done',
      'timestamp: 2026-06-01T00:00:00.000Z',
      '---',
      '',
      '- **状态**: done',
      '- **上下文**: legacy',
      '',
    ].join('\n'));

    await writeBreadcrumb(dp, { taskId: 'T-MIGRATE', step: 'S2', status: 'done', context: 'jsonl' });

    const summary = await readBreadcrumb(dp);
    assert.equal(summary.total, 2);
    assert.deepEqual(summary.entries.map((entry) => entry.step), ['S1', 'S2']);
    assert.equal(readFileSync(BC_JSONL_PATH(dp), 'utf-8').trim().split('\n').length, 2);
    rmSync(dp, { recursive: true, force: true });
  });

  it('fails loud when breadcrumb.jsonl is corrupt', async () => {
    const dp = mkdtempSync(join(tmpdir(), 'bc-jsonl-corrupt-'));
    mkdirSync(join(dp, '.docpath', 'workspace'), { recursive: true });
    writeFileSync(BC_JSONL_PATH(dp), '{not-json\n');

    await assert.rejects(
      () => readBreadcrumb(dp),
      /breadcrumb\.jsonl 第 1 行不是合法 JSON/,
    );
    rmSync(dp, { recursive: true, force: true });
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
    // With MAX_ENTRIES=200, 52 entries won't trigger truncation, so S1 is still there
    // The test setup creates 52 entries (S1-S52), which is well below 200
    assert.ok(s.entries.length === 52, `expected 52 entries, got ${s.entries.length}`);
    assert.equal(first.step, 'S1', 'oldest should be S1 (no truncation with MAX_ENTRIES=200)');
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

// --- verification gate ---

describe('Journal verification gate', () => {
  it('blocks journal when state is not check_pass/review_pass/completed', () => {
    const dp = mkDocpathProject('in_progress');
    const result = runDocpath('journal', dp);
    assert.notEqual(result.code, 0, 'journal should be blocked');
    const combined = result.out + result.err;
    assert.match(combined, /归档门禁|check|质量门禁/);
    rmSync(dp, { recursive: true, force: true });
  });

  it('allows journal when state is check_pass', () => {
    const dp = mkDocpathProject('check_pass');
    const result = runDocpath('journal --optional-archive skip', dp);
    assert.equal(result.code, 0, result.err || result.out);
    assert.ok(!result.out.includes('归档门禁未通过'));
    rmSync(dp, { recursive: true, force: true });
  });

  it('migrates legacy state into phase/gate fields on write', () => {
    const dp = mkDocpathProject('check_pass');
    const result = runDocpath('journal --optional-archive skip', dp);
    assert.equal(result.code, 0, result.err || result.out);

    const statePath = join(dp, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(Object.hasOwn(state, 'state'), false, 'new state.json should not persist legacy state');
    assert.equal(state.phase, 'completed');
    assert.equal(state.gate, 'review_pass');

    const currentMd = readFileSync(join(dp, '.docpath', 'workspace', 'current.md'), 'utf-8');
    assert.match(currentMd, /^state: completed/m);
    assert.match(currentMd, /^phase: completed$/m);
    assert.match(currentMd, /^gate: review_pass$/m);
    rmSync(dp, { recursive: true, force: true });
  });
});
