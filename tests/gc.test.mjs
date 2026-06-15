import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-gc-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260601-active'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260531-old'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260530-orphan'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-20260529-done'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-20260601-active',
    task_title: 'Active',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'backlog', 'R-001-active.md'), [
    '---',
    'id: R-001',
    'title: Active',
    'status: active',
    'priority: P1',
    'level: 2',
    'source: test',
    'links:',
    '  task: T-20260601-active',
    '  spec: tasks/T-20260601-active/spec.md',
    'created_at: 2026-06-01',
    '---',
    '',
    'active',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'tasks', 'T-20260531-old', 'spec.md'), '# Old\n');
  writeFileSync(join(dp, 'tasks', 'T-20260530-orphan', 'spec.md'), '# Orphan\n');
  return cwd;
}

function writeWorkspaceCleanupArtifacts(cwd, { corrupt = false } = {}) {
  const workspace = join(cwd, '.docpath', 'workspace');
  mkdirSync(join(workspace, 'sessions'), { recursive: true });
  mkdirSync(join(workspace, 'leases'), { recursive: true });
  writeFileSync(
    join(workspace, 'check-history.json'),
    JSON.stringify(Array.from({ length: 35 }, (_, index) => ({
      timestamp: `2026-01-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      passed: true,
      index,
    })), null, 2),
  );
  writeFileSync(
    join(workspace, 'breadcrumb.jsonl'),
    corrupt
      ? '{"schema_version":1,"kind":"breadcrumb","taskId":"T-CLEANUP"\n'
      : Array.from({ length: 510 }, (_, index) => JSON.stringify({
        schema_version: 1,
        kind: 'breadcrumb',
        taskId: 'T-CLEANUP',
        step: `S${index}`,
        status: 'done',
        context: `cleanup fixture ${index}`,
        timestamp: `2026-01-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      })).join('\n') + '\n',
  );
  writeFileSync(join(workspace, 'breadcrumb.md'), '# breadcrumb.md\n');
  writeFileSync(join(workspace, 'sessions', 'old.json'), JSON.stringify({
    schema_version: 1,
    kind: 'session',
    session_id: 'old',
    pid: 1,
    cwd,
    command: 'test',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'sessions', 'live.json'), JSON.stringify({
    schema_version: 1,
    kind: 'session',
    session_id: 'live',
    pid: 1,
    cwd,
    command: 'test',
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'sessions', 'bad.json'), '{bad json');
  writeFileSync(join(workspace, 'leases', 'expired.json'), JSON.stringify({
    schema_version: 1,
    kind: 'lease',
    resource: 'task:T-OLD',
    session_id: 'old',
    pid: 1,
    command: 'test',
    task_id: 'T-OLD',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T01:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'leases', 'live.json'), JSON.stringify({
    schema_version: 1,
    kind: 'lease',
    resource: 'task:T-LIVE',
    session_id: 'live',
    pid: 1,
    command: 'test',
    task_id: 'T-LIVE',
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
    expires_at: '2099-01-01T01:00:00.000Z',
  }, null, 2));
}

function jsonlCount(file) {
  return readFileSync(file, 'utf-8').split('\n').filter((line) => line.trim()).length;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('gc command', () => {
  it('dry-run previews historical task dirs without moving them', () => {
    const cwd = mkWorkspace();

    const out = run(`gc --cwd ${cwd}`, cwd);

    assert.match(out, /模式: dry-run/);
    assert.match(out, /Workspace cleanup/);
    assert.match(out, /T-20260531-old/);
    assert.match(out, /T-20260530-orphan/);
    assert.doesNotMatch(out, /T-20260601-active\n/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260531-old')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('dry-run previews workspace cleanup without mutating workspace artifacts', () => {
    const cwd = mkWorkspace();
    const workspace = join(cwd, '.docpath', 'workspace');
    writeWorkspaceCleanupArtifacts(cwd);
    const beforeHistory = readFileSync(join(workspace, 'check-history.json'), 'utf-8');
    const beforeBreadcrumbJsonl = readFileSync(join(workspace, 'breadcrumb.jsonl'), 'utf-8');
    const beforeBreadcrumbMd = readFileSync(join(workspace, 'breadcrumb.md'), 'utf-8');

    const out = run(`gc --cwd ${cwd}`, cwd);

    assert.match(out, /mode: dry-run/);
    assert.match(out, /check-history: rewrite 5 entries/);
    assert.match(out, /breadcrumb: rewrite 10 entries/);
    assert.match(out, /sessions: delete 1 files/);
    assert.match(out, /leases: delete 1 files/);
    assert.equal(readFileSync(join(workspace, 'check-history.json'), 'utf-8'), beforeHistory);
    assert.equal(readFileSync(join(workspace, 'breadcrumb.jsonl'), 'utf-8'), beforeBreadcrumbJsonl);
    assert.equal(readFileSync(join(workspace, 'breadcrumb.md'), 'utf-8'), beforeBreadcrumbMd);
    assert.equal(existsSync(join(workspace, 'sessions', 'old.json')), true);
    assert.equal(existsSync(join(workspace, 'leases', 'expired.json')), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('force archives historical task dirs and keeps active/current/done', () => {
    const cwd = mkWorkspace();

    const out = run(`gc --cwd ${cwd} --force`, cwd);

    assert.match(out, /已归档 2 个历史任务目录/);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260601-active')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'T-20260531-old')), false);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old')), true);
    assert.equal(readFileSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-old', 'spec.md'), 'utf-8'), '# Old\n');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260529-done')), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('force cleans workspace artifacts and is idempotent', () => {
    const cwd = mkWorkspace();
    const workspace = join(cwd, '.docpath', 'workspace');
    writeWorkspaceCleanupArtifacts(cwd);

    const out = run(`gc --cwd ${cwd} --force`, cwd);

    assert.match(out, /mode: force/);
    assert.match(out, /check-history: rewrite 5 entries/);
    assert.match(out, /breadcrumb: rewrite 10 entries/);
    assert.match(out, /sessions: delete 1 files/);
    assert.match(out, /leases: delete 1 files/);
    const history = JSON.parse(readFileSync(join(workspace, 'check-history.json'), 'utf-8'));
    assert.equal(history.length, 30);
    assert.equal(history[0].index, 5);
    assert.equal(jsonlCount(join(workspace, 'breadcrumb.jsonl')), 500);
    assert.match(readFileSync(join(workspace, 'breadcrumb.md'), 'utf-8'), /cleanup fixture 509/);
    assert.equal(existsSync(join(workspace, 'sessions', 'old.json')), false);
    assert.equal(existsSync(join(workspace, 'sessions', 'live.json')), true);
    assert.equal(existsSync(join(workspace, 'sessions', 'bad.json')), true);
    assert.equal(existsSync(join(workspace, 'leases', 'expired.json')), false);
    assert.equal(existsSync(join(workspace, 'leases', 'live.json')), true);

    const again = run(`gc --cwd ${cwd} --force`, cwd);
    assert.match(again, /candidates: 0/);
    assert.match(again, /候选目录: 0/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports corrupted cleanup candidates without deleting them', () => {
    const cwd = mkWorkspace();
    const workspace = join(cwd, '.docpath', 'workspace');
    writeWorkspaceCleanupArtifacts(cwd, { corrupt: true });
    const badBreadcrumb = readFileSync(join(workspace, 'breadcrumb.jsonl'), 'utf-8');
    const badSession = readFileSync(join(workspace, 'sessions', 'bad.json'), 'utf-8');

    const out = run(`gc --cwd ${cwd} --force`, cwd);

    assert.match(out, /skipped:/);
    assert.match(out, /breadcrumb: error/);
    assert.match(out, /sessions: error/);
    assert.equal(readFileSync(join(workspace, 'breadcrumb.jsonl'), 'utf-8'), badBreadcrumb);
    assert.equal(readFileSync(join(workspace, 'sessions', 'bad.json'), 'utf-8'), badSession);
    rmSync(cwd, { recursive: true, force: true });
  });
});
