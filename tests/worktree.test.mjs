import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const WORKTREE_UTIL = pathToFileURL(new URL('../dist/utils/worktree.js', import.meta.url).pathname).href;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function run(args, cwd, { expectFailure = false } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!expectFailure && result.status !== 0) {
    throw new Error(`command failed (${result.status}): docpath ${args.join(' ')}\n${output}`);
  }
  if (expectFailure && result.status === 0) {
    throw new Error(`command unexpectedly succeeded: docpath ${args.join(' ')}\n${output}`);
  }
  return { ...result, output };
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-worktree-'));
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'DocPath Test']);

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  mkdirSync(join(dp, 'tasks'), { recursive: true });
  mkdirSync(join(dp, 'journal'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'default_level: 2\n');
  writeFileSync(join(dp, 'backlog', 'backlog.md'), '# Backlog\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# breadcrumb\n');
  writeFileSync(join(dp, 'workspace', 'current.md'), '# current\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: '',
    task_title: 'Main repo',
    phase: 'idle',
    gate: 'none',
    current_step: '等待下一步',
    started_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(cwd, 'README.md'), '# Test repo\n');

  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'init']);
  return cwd;
}

describe('worktree command', () => {
  it('creates an isolated DocPath runtime with shared symlinks from a subdirectory', () => {
    const cwd = mkRepo();
    const subdir = join(cwd, 'src', 'nested');
    mkdirSync(subdir, { recursive: true });

    const out = run(['worktree', 'create', 'feature-a'], subdir).output;
    const worktreePath = join(cwd, '.worktrees', 'feature-a');

    assert.match(out, /worktree 已创建/);
    assert.equal(existsSync(worktreePath), true);
    assert.equal(existsSync(join(subdir, '.worktrees')), false, 'must anchor .worktrees at git root');

    const backlogLink = join(worktreePath, '.docpath', 'backlog');
    assert.equal(lstatSync(backlogLink).isSymbolicLink(), true);
    assert.equal(realpathSync(backlogLink), realpathSync(join(cwd, '.docpath', 'backlog')));

    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'state.json')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'current.md')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'breadcrumb.md')), true);

    const next = run(['next', '--agent'], worktreePath).output;
    assert.match(next, /agent_view: next/);

    const list = run(['worktree', 'list'], subdir).output;
    assert.match(list, /feature-a/);
    assert.match(list, /docpath: idle \(no active task\)/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects unsafe names before invoking git', () => {
    const cwd = mkRepo();
    for (const name of ['../escape', join(cwd, 'escape'), 'bad/name', 'feature;touch-pwn']) {
      const result = run(['worktree', 'create', name], cwd, { expectFailure: true });
      assert.match(result.output, /非法 worktree 名称|worktree 名称/);
    }
    assert.equal(existsSync(join(cwd, '.worktrees')), false);
    assert.equal(existsSync(join(cwd, 'pwn')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('remove refuses dirty worktrees unless --force is provided', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'dirty-feature');

    run(['worktree', 'create', 'dirty-feature'], cwd);
    writeFileSync(join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    const failed = run(['worktree', 'remove', 'dirty-feature'], cwd, { expectFailure: true });
    assert.match(failed.output, /删除 worktree 失败/);
    assert.equal(existsSync(worktreePath), true);

    run(['worktree', 'remove', 'dirty-feature', '--force'], cwd);
    assert.equal(existsSync(worktreePath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects git worktrees under ESM', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'esm-feature');
    run(['worktree', 'create', 'esm-feature'], cwd);

    const out = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { isInWorktree } from ${JSON.stringify(WORKTREE_UTIL)}; console.log(isInWorktree(process.argv[1]));`,
      worktreePath,
    ], { encoding: 'utf-8' }).trim();

    assert.equal(out, 'true');
    rmSync(cwd, { recursive: true, force: true });
  });
});
