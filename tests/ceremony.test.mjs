import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseBreadcrumbEvents,
  isGateEvent,
  median,
  extractTaskIds,
  parseGitLogSegments,
  computeTaskMetrics,
  buildCeremonyReport,
} from '../dist/utils/ceremony.js';

function event(taskId, step, status, timestamp) {
  return JSON.stringify({ schema_version: 1, kind: 'breadcrumb', taskId, step, status, timestamp });
}

function makeCeremonyProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-ceremony-'));
  const done = join(cwd, '.docpath', 'tasks', 'done');
  mkdirSync(join(done, 'T-20260901-quick-fix-a'), { recursive: true });
  mkdirSync(join(done, 'T-20260902-feature-b'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
  writeFileSync(
    join(done, 'T-20260901-quick-fix-a', 'breadcrumb.jsonl'),
    [
      event('T-20260901-quick-fix-a', 'check', 'in_progress', '2026-09-01T01:00:00.000Z'),
      event('T-20260901-quick-fix-a', 'check', 'blocked', '2026-09-01T02:00:00.000Z'),
      event('T-20260901-quick-fix-a', 'done', 'done', '2026-09-01T03:00:00.000Z'),
    ].join('\n'),
  );
  writeFileSync(
    join(done, 'T-20260902-feature-b', 'breadcrumb.jsonl'),
    [
      event('T-20260902-feature-b', 'S1', 'in_progress', '2026-09-02T01:00:00.000Z'),
      event('T-20260902-feature-b', 'check', 'blocked', '2026-09-02T02:00:00.000Z'),
      event('T-20260902-feature-b', 'check', 'blocked', '2026-09-02T03:00:00.000Z'),
      event('T-20260902-feature-b', 'review', 'done', '2026-09-02T04:00:00.000Z'),
      'not-json-line',
    ].join('\n'),
  );
  return cwd;
}

describe('ceremony: breadcrumb parsing (R-329)', () => {
  it('parses valid events and tolerates broken lines', () => {
    const raw = [
      event('T-1', 'check', 'blocked', '2026-09-01T00:00:00.000Z'),
      'garbage {',
      '',
      event('T-1', 'S1', 'in_progress', '2026-09-01T01:00:00.000Z'),
    ].join('\n');
    const events = parseBreadcrumbEvents(raw);
    assert.equal(events.length, 2);
    assert.equal(events[0].step, 'check');
    assert.equal(events[0].status, 'blocked');
  });

  it('isGateEvent matches only check/review steps', () => {
    const mk = (step) => isGateEvent({ taskId: 'T-1', step, status: 'done', timestamp: '' });
    assert.equal(mk('check'), true);
    assert.equal(mk('review'), true);
    assert.equal(mk('S1'), false);
    assert.equal(mk('done'), false);
  });
});

describe('ceremony: math helpers (R-329)', () => {
  it('median handles odd/even/empty', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
    assert.equal(median([Number.NaN, 5]), 5);
  });

  it('extractTaskIds finds unique T- ids', () => {
    assert.deepEqual(
      extractTaskIds('chore: T-20260901-quick-a closeout — 任务 T-20260901-quick-a'),
      ['T-20260901-quick-a'],
    );
    assert.deepEqual(extractTaskIds('no id here'), []);
  });
});

describe('ceremony: git log segment parsing (R-329)', () => {
  it('attributes files to task ids without cross-commit leakage', () => {
    const stdout = [
      '@@abc123 chore(backlog): R-1 相关 T-20260901-quick-a',
      'src/a.ts',
      'src/b.ts',
      '',
      '@@def456 chore: closeout T-20260902-feature-b',
      'src/c.ts',
      '',
    ].join('\n');
    const map = parseGitLogSegments(stdout);
    assert.deepEqual([...map.get('T-20260901-quick-a')].sort(), ['src/a.ts', 'src/b.ts']);
    assert.deepEqual([...map.get('T-20260902-feature-b')], ['src/c.ts']);
  });

  it('does not treat commit subject as a touched file', () => {
    const stdout = '@@abc123 fix: T-20260901-quick-a 仪式密度指标修正\nsrc/a.ts\n';
    const map = parseGitLogSegments(stdout);
    const files = [...map.get('T-20260901-quick-a')];
    assert.equal(files.length, 1);
    assert.equal(files[0], 'src/a.ts');
  });
});

describe('ceremony: task metrics (R-329)', () => {
  it('computes blocked ratio, gate share and density; nulls without diff data', () => {
    const events = parseBreadcrumbEvents(
      [
        event('T-20260902-feature-b', 'S1', 'in_progress', '2026-09-02T01:00:00.000Z'),
        event('T-20260902-feature-b', 'check', 'blocked', '2026-09-02T02:00:00.000Z'),
        event('T-20260902-feature-b', 'review', 'done', '2026-09-02T04:00:00.000Z'),
      ].join('\n'),
    );
    const noFiles = computeTaskMetrics('T-20260902-feature-b', events, null, []);
    assert.equal(noFiles.profile, 'standard');
    assert.equal(noFiles.totalEvents, 3);
    assert.equal(noFiles.blockedEvents, 1);
    assert.ok(Math.abs(noFiles.blockedRatio - 1 / 3) < 1e-9);
    assert.ok(Math.abs(noFiles.gateEventShare - 2 / 3) < 1e-9);
    assert.equal(noFiles.ceremonyDensity, null);

    const withFiles = computeTaskMetrics('T-20260902-feature-b', events, 3, []);
    assert.ok(Math.abs(withFiles.ceremonyDensity - 1) < 1e-9);
  });

  it('classifies quick profile by task id', () => {
    const events = parseBreadcrumbEvents(event('T-20260901-quick-fix-a', 'done', 'done', '2026-09-01T03:00:00.000Z'));
    const m = computeTaskMetrics('T-20260901-quick-fix-a', events, null, []);
    assert.equal(m.profile, 'quick');
  });
});

describe('ceremony: report aggregation (R-329)', () => {
  it('aggregates archived tasks by profile without git telemetry', async () => {
    const cwd = makeCeremonyProject();
    try {
      const report = await buildCeremonyReport(cwd);
      assert.equal(report.archived.length, 2);
      assert.equal(report.telemetryEnabled, false);
      assert.ok(report.notes.some((n) => n.includes('trace 遥测未开启')));

      const quick = report.aggregates.find((a) => a.profile === 'quick');
      const standard = report.aggregates.find((a) => a.profile === 'standard');
      assert.equal(quick.taskCount, 1);
      assert.equal(quick.medianEvents, 3);
      assert.ok(Math.abs(quick.medianBlockedRatio - 1 / 3) < 1e-9);
      assert.equal(standard.taskCount, 1);
      assert.equal(standard.medianEvents, 4);
      assert.ok(Math.abs(standard.medianBlockedRatio - 0.5) < 1e-9);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('computes ceremony density from git history when commits reference the task', async () => {
    const cwd = makeCeremonyProject();
    try {
      execSync(
        'git -c init.defaultBranch=main init -q && ' +
          'git -c user.email=t@t -c user.name=t add -A && ' +
          'git -c user.email=t@t -c user.name=t commit -qm "chore: closeout T-20260902-feature-b 仪式成本"',
        { cwd, stdio: 'ignore' },
      );
      const report = await buildCeremonyReport(cwd);
      const standard = report.archived.find((t) => t.taskId === 'T-20260902-feature-b');
      assert.ok(standard.filesTouched >= 2, '至少应统计到 breadcrumb 与 spec 文件');
      assert.ok(standard.ceremonyDensity > 0);
      assert.ok(standard.ceremonyDensity < standard.totalEvents);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
