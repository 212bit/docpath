import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function runResult(args, cwd) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 20000 }),
    };
  } catch (error) {
    return {
      code: error.status ?? 1,
      out: `${error.stdout?.toString() || ''}${error.stderr?.toString() || ''}`,
    };
  }
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function mkRepo(ignoreLines) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-doctor-'));
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);

  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'tasks', 'done', 'T-DONE'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
  writeFileSync(join(cwd, '.gitignore'), `${ignoreLines.join('\n')}\n`);
  writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), '{"phase":"idle"}\n');
  writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# current alias\n');
  writeFileSync(join(cwd, '.docpath', 'tasks', 'done', 'T-DONE', 'spec.md'), '# done spec\n');
  writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001.md'), '# backlog\n');

  return cwd;
}

describe('doctor command', () => {
  it('reports tracked ignored runtime files with a git rm --cached suggestion', () => {
    const cwd = mkRepo([
      '/.docpath/workspace/',
      '/.docpath/tasks/current/',
      '/.worktrees/',
    ]);
    git(cwd, ['add', '.gitignore', '.docpath/backlog/R-001.md', '.docpath/tasks/done/T-DONE/spec.md']);
    git(cwd, ['add', '-f', '.docpath/workspace/state.json', '.docpath/tasks/current/spec.md']);
    git(cwd, ['commit', '-m', 'initial']);

    const result = runResult(['doctor', '--cwd', cwd], cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /tracked ignored runtime files: 2/);
    assert.match(result.out, /.docpath\/workspace\/state\.json/);
    assert.match(result.out, /.docpath\/tasks\/current\/spec\.md/);
    assert.match(result.out, /git rm --cached --/);
    assert.doesNotMatch(result.out, /.docpath\/tasks\/done\/T-DONE\/spec\.md/);
    assert.doesNotMatch(result.out, /.docpath\/backlog\/R-001\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps canonical evidence out of runtime-noise classification under broad ignore rules', () => {
    const cwd = mkRepo(['/.docpath/']);
    git(cwd, [
      'add',
      '-f',
      '.gitignore',
      '.docpath/workspace/state.json',
      '.docpath/tasks/current/spec.md',
      '.docpath/tasks/done/T-DONE/spec.md',
      '.docpath/backlog/R-001.md',
    ]);
    git(cwd, ['commit', '-m', 'initial']);

    const result = runResult(['doctor', '--cwd', cwd, '--json'], cwd);
    const parsed = JSON.parse(result.out);

    assert.notEqual(result.code, 0);
    assert.deepEqual(parsed.tracked_ignored.runtime_noise_files.sort(), [
      '.docpath/tasks/current/spec.md',
      '.docpath/workspace/state.json',
    ]);
    assert.equal(parsed.tracked_ignored.non_runtime_docpath_files.includes('.docpath/tasks/done/T-DONE/spec.md'), true);
    assert.equal(parsed.tracked_ignored.non_runtime_docpath_files.includes('.docpath/backlog/R-001.md'), true);
    assert.equal(parsed.tracked_ignored.runtime_noise_files.includes('.docpath/tasks/done/T-DONE/spec.md'), false);
    assert.match(parsed.tracked_ignored.cleanup_command, /git rm --cached --/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
