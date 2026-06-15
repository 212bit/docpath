import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function mkExecWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-runtime-'));
  fs.mkdirSync(path.join(tmp, '.docpath', 'workspace'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'current'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'state.json'), JSON.stringify({ phase: 'executing', gate: 'none', state: 'step_started' }));
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'current.md'), '# current.md\n## 当前任务\nrun test');
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb.md\n');
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'plan.md'), '# Plan\n## 1. Run Step\n- [ ] subtask\n');
  return tmp;
}
function run(args, cwd) {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return ((e.stdout || '') + (e.stderr || '')).toString().trim();
  }
}

function writeCleanupArtifacts(cwd) {
  const workspace = path.join(cwd, '.docpath', 'workspace');
  fs.mkdirSync(path.join(workspace, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'leases'), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, 'check-history.json'),
    JSON.stringify(Array.from({ length: 25 }, (_, index) => ({ timestamp: `2026-06-01T00:${String(index).padStart(2, '0')}:00.000Z`, passed: true, index })), null, 2),
  );
  fs.writeFileSync(
    path.join(workspace, 'breadcrumb.jsonl'),
    Array.from({ length: 510 }, (_, index) => JSON.stringify({
      schema_version: 1,
      kind: 'breadcrumb',
      taskId: 'T-CLEANUP',
      step: `S${index}`,
      status: 'done',
      context: `cleanup fixture ${index}`,
      timestamp: `2026-06-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    })).join('\n') + '\n',
  );
  fs.writeFileSync(path.join(workspace, 'sessions', 'old.json'), JSON.stringify({
    schema_version: 1,
    kind: 'session',
    session_id: 'old',
    pid: 1,
    cwd,
    command: 'test',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }, null, 2));
  fs.writeFileSync(path.join(workspace, 'sessions', 'live.json'), JSON.stringify({
    schema_version: 1,
    kind: 'session',
    session_id: 'live',
    pid: 1,
    cwd,
    command: 'test',
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
  }, null, 2));
  fs.writeFileSync(path.join(workspace, 'leases', 'expired.json'), JSON.stringify({
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
  fs.writeFileSync(path.join(workspace, 'leases', 'live.json'), JSON.stringify({
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
  return fs.readFileSync(file, 'utf-8').split('\n').filter((line) => line.trim()).length;
}

describe('docpath runtime lifecycle', () => {
  let tmpDir;
  before(() => { tmpDir = mkExecWorkspace(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('run start marks execution start', () => {
    const out = run('run start', tmpDir);
    assert.match(out, /run-start|执行开始/i, `got: ${out.slice(0, 100)}`);
  });

  it('run end marks execution done', () => {
    const out = run('run end', tmpDir);
    assert.match(out, /run-end|执行结束|done/i, `got: ${out.slice(0, 100)}`);
  });

  it('compact produces context file', () => {
    const out = run('compact', tmpDir);
    assert.match(out, /compact|压缩|saved/i, `got: ${out.slice(0, 100)}`);
  });

  it('compact cleans workspace runtime state only when explicitly requested', () => {
    const cwd = mkExecWorkspace();
    const workspace = path.join(cwd, '.docpath', 'workspace');
    writeCleanupArtifacts(cwd);

    const defaultOut = run('compact', cwd);
    assert.match(defaultOut, /compact|saved/i);
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'check-history.json'), 'utf-8')).length, 25);
    assert.equal(jsonlCount(path.join(workspace, 'breadcrumb.jsonl')), 510);
    assert.equal(fs.existsSync(path.join(workspace, 'sessions', 'old.json')), true);
    assert.equal(fs.existsSync(path.join(workspace, 'leases', 'expired.json')), true);

    const cleanupOut = run('compact --cleanup', cwd);
    assert.match(cleanupOut, /check-history: pruned 5 entries/);
    assert.match(cleanupOut, /breadcrumb\.jsonl: pruned 10 lines/);
    assert.match(cleanupOut, /sessions: removed 1 stale sessions/);
    assert.match(cleanupOut, /leases: removed 1 expired leases/);
    const history = JSON.parse(fs.readFileSync(path.join(workspace, 'check-history.json'), 'utf-8'));
    assert.equal(history.length, 20);
    assert.equal(history[0].index, 5);
    assert.equal(jsonlCount(path.join(workspace, 'breadcrumb.jsonl')), 500);
    assert.equal(fs.existsSync(path.join(workspace, 'sessions', 'old.json')), false);
    assert.equal(fs.existsSync(path.join(workspace, 'sessions', 'live.json')), true);
    assert.equal(fs.existsSync(path.join(workspace, 'leases', 'expired.json')), false);
    assert.equal(fs.existsSync(path.join(workspace, 'leases', 'live.json')), true);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('discover finds context files', () => {
    const out = run('discover', tmpDir);
    assert.match(out, /Discovery|state\.json|current\.md/i, `got: ${out.slice(0, 100)}`);
  });

  it('next suggests next command', () => {
    const out = run('next', tmpDir);
    assert.match(out, /下一步|建议|next/i, `got: ${out.slice(0, 100)}`);
  });
});
