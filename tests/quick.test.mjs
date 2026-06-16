import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: quick-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: '',
    task_title: '',
    phase: 'completed',
    gate: 'review_pass',
    current_step: 'ready',
    started_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function nextAgent(cwd) {
  return parse(run(`next --cwd ${cwd} --agent`, cwd));
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function initGitRepo(cwd) {
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');
  git(cwd, 'add .');
  git(cwd, 'commit -m initial');
}

describe('docpath quick', () => {
  it('creates an active quick task and routes next directly to done', () => {
    const cwd = mkWorkspace();

    const out = run(`quick "Fix typo in docs" --cwd ${cwd}`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const taskId = state.task_id;
    const next = nextAgent(cwd);

    assert.match(out, /quick task 已创建/);
    assert.match(taskId, /^T-\d{8}-quick-fix-typo-in-docs/);
    assert.equal(state.workflow_profile, 'quick');
    assert.equal(state.level, 1);
    assert.equal(state.phase, 'executing');
    assert.equal(next.workflow_profile, 'quick');
    assert.equal(next.recommended_command, 'docpath done');
    assert.match(next.next_action, /quick/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', taskId, 'quick.md'), 'utf-8'), /workflow_profile: quick/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'quick.md'), 'utf-8'), /check: required/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('done completes a quick task without requiring full review', () => {
    const cwd = mkWorkspace();
    run(`quick "Fix typo" --cwd ${cwd}`, cwd);

    const out = run(`done --cwd ${cwd}`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const decisions = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.match(out, /review skipped by quick profile|quick profile policy/);
    assert.equal(state.phase, 'completed');
    assert.equal(state.workflow_profile, 'quick');
    assert.match(decisions, /quick profile: full review skipped/);
    assert.match(lastCheck, /PASS/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('blocks quick closeout when the change scope is too large', () => {
    const cwd = mkWorkspace();
    run(`quick "Tiny patch" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    for (const file of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      writeFileSync(join(cwd, file), 'changed\n');
    }

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /scope exceeds quick profile boundaries/);
    assert.match(result.out, /Upgrade path/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
