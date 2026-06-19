import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-instant-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: instant-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: '',
    task_title: '',
    phase: 'completed',
    gate: 'review_pass',
    current_step: 'ready',
    started_at: '2026-06-19T00:00:00.000Z',
    updated_at: '2026-06-19T00:00:00.000Z',
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

function readState(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
}

describe('docpath quick --instant (instant profile)', () => {
  it('creates an instant task with profile=instant, level=0', () => {
    const cwd = mkWorkspace();
    const out = run(`quick "Fix typo" --instant --cwd ${cwd}`, cwd);
    assert.match(out, /instant task 已创建/);
    assert.match(out, /profile: instant/);
    assert.match(out, /lite check/);

    const state = readState(cwd);
    assert.equal(state.workflow_profile, 'instant');
    assert.equal(state.level, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('completes an instant task via done (lite check, review skipped)', () => {
    const cwd = mkWorkspace();
    // allow src/engine/*.ts so the small fixture passes scope guard
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'project:',
      '  name: instant-test',
      'quick:',
      '  allow_patterns:',
      '    - src/engine/*.ts',
      '',
    ].join('\n'));
    run(`quick "Allowed engine fixture" --instant --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    mkdirSync(join(cwd, 'src', 'engine'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'engine', 'fixture.ts'), 'export const fixture = true;\n');

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.equal(result.code, 0, `done failed: ${result.out}`);
    // lite check ran (no build/test heavy commands), review skipped by instant policy
    assert.match(result.out, /instant profile/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('still rejects risky instant changes via scope guard', () => {
    const cwd = mkWorkspace();
    run(`quick "Risky patch" --instant --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    mkdirSync(join(cwd, 'src', 'commands'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'commands', 'agent.ts'), 'export const risky = true;\n');

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /core lifecycle command changed/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
