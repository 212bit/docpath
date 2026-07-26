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
    JSON.stringify(Array.from({ length: 35 }, (_, index) => ({ timestamp: `2026-01-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`, passed: true, index })), null, 2),
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

  it('read-only agent views do not run workspace cleanup', () => {
    const cwd = mkExecWorkspace();
    const workspace = path.join(cwd, '.docpath', 'workspace');
    writeCleanupArtifacts(cwd);
    const beforeHistory = fs.readFileSync(path.join(workspace, 'check-history.json'), 'utf-8');
    const beforeBreadcrumbJsonl = fs.readFileSync(path.join(workspace, 'breadcrumb.jsonl'), 'utf-8');
    const beforeBreadcrumbMd = fs.readFileSync(path.join(workspace, 'breadcrumb.md'), 'utf-8');

    const statusOut = run('status --agent', cwd);
    const nextOut = run('next --agent', cwd);
    run('context --max-tokens 5000 --topic cleanup', cwd);
    run('reveal --level 1 --topic cleanup', cwd);
    run('changes --agent', cwd);

    assert.match(statusOut, /agent_view: status|state:/);
    assert.match(nextOut, /agent_view: next/);
    assert.equal(fs.readFileSync(path.join(workspace, 'check-history.json'), 'utf-8'), beforeHistory);
    assert.equal(fs.readFileSync(path.join(workspace, 'breadcrumb.jsonl'), 'utf-8'), beforeBreadcrumbJsonl);
    assert.equal(fs.readFileSync(path.join(workspace, 'breadcrumb.md'), 'utf-8'), beforeBreadcrumbMd);
    assert.equal(fs.existsSync(path.join(workspace, 'sessions', 'old.json')), true);
    assert.equal(fs.existsSync(path.join(workspace, 'leases', 'expired.json')), true);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('status migrates legacy current.md only when state.json is missing', () => {
    const cwd = mkExecWorkspace();
    const workspace = path.join(cwd, '.docpath', 'workspace');
    fs.rmSync(path.join(workspace, 'state.json'), { force: true });
    fs.writeFileSync(path.join(workspace, 'current.md'), [
      '# Legacy Current',
      '',
      '```yaml',
      'level: 2',
      'workflow_profile: standard',
      'state: executing',
      'task_id: T-LEGACY',
      'task_title: Legacy Migration',
      'phase: executing',
      'gate: none',
      'current_step: S1',
      'started_at: 2026-06-01T00:00:00.000Z',
      'updated_at: 2026-06-01T00:00:00.000Z',
      '```',
      '',
    ].join('\n'));

    const out = run('status --agent', cwd);
    const state = JSON.parse(fs.readFileSync(path.join(workspace, 'state.json'), 'utf-8'));

    assert.match(out, /task_id: T-LEGACY/);
    assert.equal(state.task_id, 'T-LEGACY');
    assert.equal(state.phase, 'executing');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('next suggests next command', () => {
    const out = run('next', tmpDir);
    assert.match(out, /下一步|建议|next/i, `got: ${out.slice(0, 100)}`);
  });
});

describe('trace rotation (R-302: 零丢失轮转)', () => {
  let writeTraceEntry;

  before(async () => {
    ({ writeTraceEntry } = await import('../dist/utils/trace.js'));
  });

  it('archives dropped entries to a monthly file instead of discarding', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-trace-rot-'));
    const wsDir = path.join(cwd, '.docpath', 'workspace');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: trace-rot\ntrace: true\n');
    const tracePath = path.join(wsDir, 'trace.jsonl');
    const seeded = Array.from({ length: 2001 }, (_, i) => JSON.stringify({ ts: '2026-07-01T00:00:00.000Z', command: 'seed', seq: i })).join('\n');
    fs.writeFileSync(tracePath, `${seeded}\n`);

    await writeTraceEntry(cwd, { command: 'trigger', args: [], durationMs: 1, exitCode: 0 });

    const remaining = fs.readFileSync(tracePath, 'utf-8').split('\n').filter(Boolean).length;
    assert.ok(remaining <= 1001, `主文件应截到窗口内（实际 ${remaining}）`);
    const month = new Date().toISOString().slice(0, 7);
    const archive = path.join(wsDir, `trace-${month}.jsonl`);
    assert.ok(fs.existsSync(archive), '裁掉的条目必须归档而非丢弃');
    const archived = fs.readFileSync(archive, 'utf-8').split('\n').filter(Boolean).length;
    assert.ok(archived >= 1000, `归档条数应为被裁量级（实际 ${archived}）`);
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
