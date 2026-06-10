import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { mkExecWorkspace } from './helpers.mjs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
let handleDashboardFetch;

before(async () => {
  ({ handleDashboardFetch } = await import('../dist/commands/dashboard.js'));
});

async function request(path, cwd, init = {}) {
  const response = await handleDashboardFetch(
    new Request(`http://localhost${path}`, init),
    { cwd },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function mkDashboardWorkspace() {
  const { dir, workspace } = mkExecWorkspace(mkdtempSync(join(tmpdir(), 'dp-dashboard-')));
  mkdirSync(join(dir, '.docpath', 'backlog'), { recursive: true });
  writeFileSync(join(workspace, 'check-history.json'), JSON.stringify([
    { timestamp: '2026-06-01T00:00:00.000Z', passed: false, failedChecks: ['TypeScript'] },
    { timestamp: '2026-06-01T00:10:00.000Z', passed: true, failedChecks: [] },
  ], null, 2));
  writeFileSync(join(workspace, 'review.md'), '# Review\n\n✅ 代码审查: 0 错误, 1 警告, 0 提示\n');
  writeFileSync(join(dir, '.docpath', 'backlog', 'R-001-dashboard.md'), `---
id: R-001
title: Dashboard
status: accepted
priority: P1
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-06-01
---

Dashboard backlog
`);
  return dir;
}

describe('dashboard readonly API', () => {
  it('registers dashboard in CLI help', () => {
    const commandHelp = execSync(`node ${BIN} dashboard --help`, { encoding: 'utf-8' });
    assert.match(commandHelp, /docpath dashboard/);
    assert.match(commandHelp, /--port <port>/);

    const rootHelp = execSync(`node ${BIN} --help`, { encoding: 'utf-8' });
    assert.match(rootHelp, /dashboard\s+启动本地只读管理仪表盘/);
  });

  it('returns readonly health and project registry shape', async () => {
    const cwd = mkDashboardWorkspace();
    const oldRegistry = process.env.DOCPATH_REGISTRY_DB;
    process.env.DOCPATH_REGISTRY_DB = join(cwd, 'missing-registry.sqlite');

    const health = await request('/api/health', cwd);
    assert.equal(health.status, 200);
    assert.equal(health.body.mode, 'readonly');
    assert.ok(health.body.endpoints.includes('/api/projects'));

    const projects = await request('/api/projects', cwd);
    assert.equal(projects.status, 200);
    assert.deepEqual(projects.body.projects, []);

    if (oldRegistry === undefined) delete process.env.DOCPATH_REGISTRY_DB;
    else process.env.DOCPATH_REGISTRY_DB = oldRegistry;
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reads state, checks, review, and backlog without mutating files', async () => {
    const cwd = mkDashboardWorkspace();
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const beforeState = readFileSync(statePath, 'utf-8');

    const state = await request('/api/state', cwd);
    assert.equal(state.status, 200);
    assert.equal(state.body.projectRoot, cwd);
    assert.equal(state.body.state.task_id, 'T-AGENT');

    const checks = await request('/api/checks', cwd);
    assert.equal(checks.status, 200);
    assert.equal(checks.body.history.length, 2);
    assert.equal(checks.body.history[0].failedChecks[0], 'TypeScript');

    const review = await request('/api/review', cwd);
    assert.equal(review.status, 200);
    assert.equal(review.body.review.summary.status, 'pass');
    assert.equal(review.body.review.summary.warnings, 1);
    assert.match(review.body.review.markdown, /代码审查/);

    const backlog = await request('/api/backlog', cwd);
    assert.equal(backlog.status, 200);
    assert.equal(backlog.body.items.length, 1);
    assert.equal(backlog.body.items[0].title, 'Dashboard');

    assert.equal(readFileSync(statePath, 'utf-8'), beforeState);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects mutation methods and does not expose command execution endpoint', async () => {
    const cwd = mkDashboardWorkspace();

    const postState = await request('/api/state', cwd, { method: 'POST' });
    assert.equal(postState.status, 405);
    assert.equal(postState.body.error, 'method_not_allowed');

    const oldCommandEndpoint = await request('/api/docpath', cwd);
    assert.equal(oldCommandEndpoint.status, 404);
    assert.equal(oldCommandEndpoint.body.error, 'not_found');

    rmSync(cwd, { recursive: true, force: true });
  });
});
