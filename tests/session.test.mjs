import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkExecWorkspace } from './helpers.mjs';

import {
  DEFAULT_SESSION_ID,
  acquireExecutionLease,
  acquireLease,
  releaseExecutionLease,
  resolveSessionContext,
  taskLeaseResource,
} from '../dist/utils/session.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function mkProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-session-'));
  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: session-test\n');
  return cwd;
}

function leaseFile(cwd, resource) {
  const file = encodeURIComponent(resource).replace(/%/g, '_');
  return join(cwd, '.docpath', 'workspace', 'leases', `${file}.json`);
}

describe('session and lease utilities', () => {
  it('uses a compatibility default session when no explicit session is provided', () => {
    const previous = process.env.DOCPATH_SESSION;
    delete process.env.DOCPATH_SESSION;
    assert.deepEqual(resolveSessionContext(), { sessionId: DEFAULT_SESSION_ID, source: 'default' });
    if (previous === undefined) delete process.env.DOCPATH_SESSION;
    else process.env.DOCPATH_SESSION = previous;
  });

  it('prevents another session from claiming a live task lease', async () => {
    const cwd = mkProject();
    await acquireExecutionLease(cwd, {
      sessionId: 'alpha',
      taskId: 'T-LEASE',
      step: 'S1',
      command: 'test',
    });

    await assert.rejects(
      () => acquireExecutionLease(cwd, {
        sessionId: 'beta',
        taskId: 'T-LEASE',
        step: 'S1',
        command: 'test',
      }),
      /session lease conflict/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows a stale lease to be taken over', async () => {
    const cwd = mkProject();
    const resource = taskLeaseResource('T-STALE');
    await acquireLease(cwd, {
      sessionId: 'alpha',
      taskId: 'T-STALE',
      command: 'test',
    }, resource);

    const path = leaseFile(cwd, resource);
    const stale = JSON.parse(readFileSync(path, 'utf-8'));
    stale.updated_at = '2026-01-01T00:00:00.000Z';
    stale.expires_at = '2026-01-01T00:00:01.000Z';
    writeFileSync(path, `${JSON.stringify(stale, null, 2)}\n`);

    const [record] = await acquireExecutionLease(cwd, {
      sessionId: 'beta',
      taskId: 'T-STALE',
      step: 'S1',
      command: 'test',
    });
    assert.equal(record.session_id, 'beta');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('releases only leases held by the same session', async () => {
    const cwd = mkProject();
    await acquireExecutionLease(cwd, {
      sessionId: 'alpha',
      taskId: 'T-RELEASE',
      step: 'S1',
      command: 'test',
    });

    await releaseExecutionLease(cwd, {
      sessionId: 'beta',
      taskId: 'T-RELEASE',
      step: 'S1',
      command: 'test',
    });
    await assert.rejects(
      () => acquireExecutionLease(cwd, {
        sessionId: 'beta',
        taskId: 'T-RELEASE',
        step: 'S1',
        command: 'test',
      }),
      /session lease conflict/,
    );

    await releaseExecutionLease(cwd, {
      sessionId: 'alpha',
      taskId: 'T-RELEASE',
      step: 'S1',
      command: 'test',
    });
    await acquireExecutionLease(cwd, {
      sessionId: 'beta',
      taskId: 'T-RELEASE',
      step: 'S1',
      command: 'test',
    });
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('session-aware CLI flow', () => {
  it('blocks another session while a task lease is held and releases after completion', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-session-cli-'));
    const { tasks, workspace } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: First step',
      '- [ ] S1: First step',
      '- **描述**: first',
      '- **验收条件**: first works',
      '- **依赖**: 无',
      '',
      '### S2: Second step',
      '- [ ] S2: Second step',
      '- **描述**: second',
      '- **验收条件**: second works',
      '- **依赖**: S1',
      '',
    ].join('\n'));

    const start = run('go --step S1 --session alpha', cwd);
    assert.equal(start.code, 0, start.out);

    const blocked = run('go --step S2 --session beta', cwd);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.out, /session lease conflict/);
    assert.match(blocked.out, /session=alpha/);

    const breadcrumbJsonl = readFileSync(join(workspace, 'breadcrumb.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(breadcrumbJsonl.at(-1).sessionId, 'alpha');

    const done = run('go --step S1 --status done --session alpha', cwd);
    assert.equal(done.code, 0, done.out);

    const next = run('go --step S2 --session beta', cwd);
    assert.equal(next.code, 0, next.out);
    rmSync(cwd, { recursive: true, force: true });
  });
});

import { listActiveSessions, touchSession } from '../dist/utils/session.js';
import { generateAgentOutput } from '../dist/utils/agent-output.js';

describe('listActiveSessions and concurrency outputs', () => {
  it('correctly filters active, stale and non-surviving PID sessions', async () => {
    const cwd = mkProject();

    // 1. Alpha session: active
    await touchSession(cwd, {
      sessionId: 'alpha',
      taskId: 'T-ACTIVE',
      command: 'test',
    });

    // 2. Beta session: stale (updated_at expired)
    const betaSessionPath = join(cwd, '.docpath', 'workspace', 'sessions', 'beta.json');
    const timestamp = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago
    const betaRecord = {
      schema_version: 1,
      kind: 'session',
      session_id: 'beta',
      pid: process.pid,
      cwd,
      command: 'test',
      task_id: 'T-ACTIVE',
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(betaSessionPath), { recursive: true });
    writeFileSync(betaSessionPath, JSON.stringify(betaRecord, null, 2));

    // 3. Gamma session: dead PID
    const gammaSessionPath = join(cwd, '.docpath', 'workspace', 'sessions', 'gamma.json');
    const gammaRecord = {
      schema_version: 1,
      kind: 'session',
      session_id: 'gamma',
      pid: 999999, // Highly likely non-existent PID
      cwd,
      command: 'test',
      task_id: 'T-ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeFileSync(gammaSessionPath, JSON.stringify(gammaRecord, null, 2));

    // Test listActiveSessions filtering
    const active = await listActiveSessions(cwd);
    const sessionIds = active.map(s => s.session_id);
    assert.ok(sessionIds.includes('alpha'));
    assert.ok(!sessionIds.includes('beta'));
    assert.ok(!sessionIds.includes('gamma'));

    // Test excludeSelf
    const activeExclude = await listActiveSessions(cwd, { excludeSelf: true, selfSessionId: 'alpha' });
    const sessionIdsExclude = activeExclude.map(s => s.session_id);
    assert.ok(!sessionIdsExclude.includes('alpha'));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('generateAgentOutput appends concurrency fields when active sessions exist', async () => {
    const cwd = mkProject();

    // Setup active session other than default
    const sessionPath = join(cwd, '.docpath', 'workspace', 'sessions', 'other.json');
    const record = {
      schema_version: 1,
      kind: 'session',
      session_id: 'other',
      pid: process.pid,
      cwd,
      command: 'test',
      task_id: 'T-ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(record, null, 2));

    const output = await generateAgentOutput(cwd, { view: 'next' });
    const parsed = (await import('yaml')).parse(output);

    assert.ok(Array.isArray(parsed.active_sessions));
    assert.equal(parsed.active_sessions.length, 1);
    assert.equal(parsed.active_sessions[0].session_id, 'other');
    assert.equal(parsed.state_freshness, 'potentially_stale');
    assert.match(parsed.concurrent_session_warning, /检测到/);

    rmSync(cwd, { recursive: true, force: true });
  });
});

