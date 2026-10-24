import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const {
  canonicalBacklogId,
  extractBacklogIds,
  parseGitLogOutput,
  findStaleBacklogCommitWarnings,
  diagnoseBacklogCommitDrift,
} = await import('../dist/engine/backlog-commit-drift.js');
const { checkBacklogCommitDrift } = await import('../dist/commands/check/validators.js');

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function item(partial) {
  return {
    id: 'R-010',
    status: 'proposed',
    title: '开放需求',
    created_at: '2026-10-01',
    ...partial,
  };
}

function commit(partial) {
  return {
    sha: 'abcdef1234567890',
    committedAt: '2026-10-24T00:00:00Z',
    subject: 'feat: ship R-010',
    body: '',
    ...partial,
  };
}

function lookupFrom(items) {
  const map = new Map(items.map((entry) => [entry.id, entry]));
  return (id) => map.get(id) ?? null;
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

function writeBacklog(cwd, id, status, createdAt = '2026-10-01') {
  const dir = join(cwd, '.docpath', 'backlog', status === 'done' || status === 'dropped' ? 'archived' : '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}-item.md`), `---
id: ${id}
title: ${id} title
status: ${status}
priority: P2
level: 1
source: test
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: ${createdAt}
---

## 背景

- 清楚的背景

## 验收

- 清楚的验收
`);
}

describe('backlog commit drift pure checks', () => {
  it('canonicalizes and extracts backlog ids without splitting longer numbers', () => {
    assert.equal(canonicalBacklogId('010'), 'R-010');
    assert.equal(canonicalBacklogId('503'), 'R-503');
    assert.equal(canonicalBacklogId('0'), null);
    assert.deepEqual(extractBacklogIds('修复 r-010 与 R-010，另见 R-1000。'), ['R-010', 'R-1000']);
    assert.deepEqual(extractBacklogIds('XR-010 不是编号'), []);
  });

  it('parses git log records with multiline bodies', () => {
    const raw = [
      'aaa\x1f2026-10-24T01:00:00Z\x1ffeat: R-010\x1fline one\nline two\x1e',
      'bbb\x1f2026-10-23T01:00:00Z\x1fchore: none\x1f\x1e',
    ].join('');
    const records = parseGitLogOutput(raw);
    assert.equal(records.length, 2);
    assert.equal(records[0].sha, 'aaa');
    assert.equal(records[0].body, 'line one\nline two');
    assert.equal(records[1].subject, 'chore: none');
  });

  it('warns only for open-like statuses cited in the window', () => {
    const commits = [
      commit({ sha: '1111111', subject: 'feat: R-010 body', body: 'also R-011' }),
      commit({ sha: '2222222', subject: 'done R-012', committedAt: '2026-10-20T00:00:00Z' }),
      commit({ sha: '3333333', subject: 'drop R-013' }),
      commit({ sha: '4444444', subject: 'missing R-099' }),
    ];
    const warnings = findStaleBacklogCommitWarnings(commits, lookupFrom([
      item({ id: 'R-010', status: 'proposed' }),
      item({ id: 'R-011', status: 'active' }),
      item({ id: 'R-012', status: 'done' }),
      item({ id: 'R-013', status: 'dropped' }),
    ]), 50);

    assert.deepEqual(warnings.map((warning) => warning.id), ['R-010', 'R-011']);
    assert.equal(warnings[0].status, 'proposed');
    assert.match(warnings[0].message, /1111111/);
    assert.match(warnings[0].message, /仍为 proposed/);
    assert.equal(warnings.every((warning) => warning.suggestion.includes('docpath backlog done')), true);
  });

  it('includes commits older than lastN when they are on or after created_at', () => {
    const commits = [
      commit({ sha: 'newnew1', subject: 'unrelated', committedAt: '2026-10-24T00:00:00Z' }),
      commit({ sha: 'oldold1', subject: 'land R-010', committedAt: '2026-10-02T00:00:00Z' }),
      commit({ sha: 'prepre1', subject: 'mention R-010', committedAt: '2026-09-01T00:00:00Z' }),
    ];
    const warnings = findStaleBacklogCommitWarnings(
      commits,
      lookupFrom([item({ created_at: '2026-10-01' })]),
      1,
    );
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0].commits.map((entry) => entry.sha), ['oldold1']);
  });

  it('still warns for a lastN hit even when the commit predates created_at', () => {
    const warnings = findStaleBacklogCommitWarnings(
      [commit({ sha: 'early01', subject: 'R-010', committedAt: '2026-09-01T00:00:00Z' })],
      lookupFrom([item({ created_at: '2026-10-21' })]),
      50,
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].commits[0].sha, 'early01');
  });

  it('accepts accepted and planned as open-like', () => {
    const warnings = findStaleBacklogCommitWarnings(
      [
        commit({ sha: 'a1', subject: 'R-021' }),
        commit({ sha: 'b1', subject: 'R-022' }),
      ],
      lookupFrom([
        item({ id: 'R-021', status: 'accepted' }),
        item({ id: 'R-022', status: 'planned' }),
      ]),
    );
    assert.deepEqual(warnings.map((warning) => warning.id), ['R-021', 'R-022']);
  });
});

describe('diagnoseBacklogCommitDrift git boundaries', () => {
  it('returns unavailable instead of throwing when git history cannot be read', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-no-git-'));
    try {
      const missing = await diagnoseBacklogCommitDrift(cwd);
      assert.equal(missing.available, false);
      assert.deepEqual(missing.warnings, []);

      const thrown = await diagnoseBacklogCommitDrift(cwd, {
        readLog: async () => {
          throw new Error('spawn git ENOENT');
        },
      });
      assert.equal(thrown.available, false);
      assert.deepEqual(thrown.warnings, []);

      const explicitNull = await diagnoseBacklogCommitDrift(cwd, {
        readLog: async () => null,
      });
      assert.equal(explicitNull.available, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('warns from a local git log and stays quiet once the entry is done', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-commit-drift-'));
    try {
      git(cwd, ['init', '-q']);
      git(cwd, ['config', 'user.email', 'test@example.com']);
      git(cwd, ['config', 'user.name', 'Test']);
      writeFileSync(join(cwd, 'README.md'), 'hello\n');
      git(cwd, ['add', 'README.md']);
      git(cwd, ['commit', '-q', '-m', 'feat: close the loop for R-010']);
      writeBacklog(cwd, 'R-010', 'proposed');

      const open = await diagnoseBacklogCommitDrift(cwd);
      assert.equal(open.available, true);
      assert.equal(open.scannedCommits, 1);
      assert.equal(open.warnings.length, 1);
      assert.equal(open.warnings[0].id, 'R-010');
      assert.equal(open.warnings[0].status, 'proposed');

      const checkResults = await checkBacklogCommitDrift(cwd);
      assert.equal(checkResults.length, 1);
      assert.equal(checkResults[0].passed, true);
      assert.equal(checkResults[0].severity, 'warning');
      assert.match(checkResults[0].output, /R-010/);

      rmSync(join(cwd, '.docpath', 'backlog', 'R-010-item.md'));
      writeBacklog(cwd, 'R-010', 'done');
      const closed = await diagnoseBacklogCommitDrift(cwd);
      assert.deepEqual(closed.warnings, []);
      assert.deepEqual(await checkBacklogCommitDrift(cwd), []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('doctor and groom warn without failing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-commit-drift-cli-'));
    try {
      git(cwd, ['init', '-q']);
      git(cwd, ['config', 'user.email', 'test@example.com']);
      git(cwd, ['config', 'user.name', 'Test']);
      mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: drift\n');
      writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        level: 1,
        phase: 'idle',
        gate: 'none',
      }));
      writeFileSync(join(cwd, 'README.md'), 'hello\n');
      git(cwd, ['add', 'README.md']);
      git(cwd, ['commit', '-q', '-m', 'fix: R-010 still open']);
      writeBacklog(cwd, 'R-010', 'proposed');
      writeFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), '# Backlog\n');

      const doctor = execFileSync('node', [BIN, 'doctor', '--json', '--cwd', cwd], {
        cwd,
        encoding: 'utf-8',
      });
      const doctorJson = JSON.parse(doctor);
      assert.equal(doctorJson.passed, true);
      assert.equal(doctorJson.backlog_commit_drift.warnings.length, 1);
      assert.equal(doctorJson.backlog_commit_drift.warnings[0].id, 'R-010');

      const groom = execFileSync('node', [BIN, 'backlog', 'groom', '--agent', '--cwd', cwd], {
        cwd,
        encoding: 'utf-8',
      });
      const groomYaml = parse(groom);
      assert.equal(groomYaml.passed, true);
      assert.equal(groomYaml.issue_count, 0);
      assert.ok(groomYaml.warnings.some((warning) => warning.id === 'R-010' && warning.field === 'git.commit'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
