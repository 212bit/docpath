import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSessionId, writeTraceEntry, writeTraceEntrySync } from '../dist/utils/trace.js';
import { resolveSessionContext } from '../dist/utils/session.js';

function readLastTraceSession(cwd) {
  const traceFile = join(cwd, '.docpath', 'workspace', 'trace.jsonl');
  assert.ok(existsSync(traceFile), 'trace.jsonl 应已写入');
  const lines = readFileSync(traceFile, 'utf-8').split('\n').filter(Boolean);
  assert.ok(lines.length > 0, 'trace.jsonl 不应为空');
  return JSON.parse(lines[lines.length - 1]).session;
}

function makeTraceableProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-trace-session-'));
  const ws = join(cwd, '.docpath', 'workspace');
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: trace-session\ntrace: true\n');
  writeFileSync(join(ws, 'state.json'), JSON.stringify({
    level: 2, task_id: '', task_title: '', phase: 'idle', state: 'idle', gate: 'none',
    current_step: 'waiting', started_at: '2026-09-07T00:00:00.000Z', updated_at: '2026-09-07T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(ws, 'current.md'), '# Current\n');
  writeFileSync(join(ws, 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function withCleanEnv() {
  return ['DOCPATH_SESSION', 'CLAUDE_SESSION', 'CODEX_SESSION', 'OPENCODE_SESSION']
    .filter((k) => process.env[k] !== undefined)
    .map((k) => [k, process.env[k]]);
}
function clearSessionEnv() {
  ['DOCPATH_SESSION', 'CLAUDE_SESSION', 'CODEX_SESSION', 'OPENCODE_SESSION'].forEach((k) => delete process.env[k]);
}
function restoreSessionEnv(saved) {
  saved.forEach(([k, v]) => { process.env[k] = v; });
}

describe('trace session identity (R-319)', () => {
  it('getSessionId delegates to resolveSessionContext (single source of truth)', () => {
    const saved = withCleanEnv();
    try {
      clearSessionEnv();
      // 无显式会话：trace 默认标识必须与隔离层逐字一致，不再是旧旁路串 'session-default'
      assert.equal(getSessionId(), resolveSessionContext().sessionId);
      assert.equal(getSessionId(), 'default');
      assert.notEqual(getSessionId(), 'session-default');
      // 显式会话：透传生效
      assert.equal(getSessionId('foo'), 'foo');
    } finally {
      restoreSessionEnv(saved);
    }
  });

  it('DOCPATH_SESSION env is honored identically by trace and isolation', () => {
    const saved = withCleanEnv();
    try {
      clearSessionEnv();
      process.env.DOCPATH_SESSION = 'envsess';
      assert.equal(getSessionId(), 'envsess');
      assert.equal(getSessionId(), resolveSessionContext().sessionId);
    } finally {
      restoreSessionEnv(saved);
    }
  });

  it('writeTraceEntrySync records the explicit sessionId into trace.jsonl', () => {
    const saved = withCleanEnv();
    const cwd = makeTraceableProject();
    try {
      clearSessionEnv();
      writeTraceEntrySync(cwd, { cmd: 'status', args: [], durationMs: 1, exitCode: 0 }, 'e2esess');
      assert.equal(readLastTraceSession(cwd), 'e2esess');
      // 无显式入参时回落到统一默认
      writeTraceEntrySync(cwd, { cmd: 'status', args: [], durationMs: 1, exitCode: 0 });
      assert.equal(readLastTraceSession(cwd), 'default');
    } finally {
      restoreSessionEnv(saved);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('async writeTraceEntry also honors explicit sessionId (both writer paths)', async () => {
    const saved = withCleanEnv();
    const cwd = makeTraceableProject();
    try {
      clearSessionEnv();
      await writeTraceEntry(cwd, { cmd: 'status', args: [], durationMs: 1, exitCode: 0 }, 'async-sess');
      assert.equal(readLastTraceSession(cwd), 'async-sess');
    } finally {
      restoreSessionEnv(saved);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
