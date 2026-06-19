import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  statSync,
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

function run(args, cwd, { expectFailure = false, env = {} } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
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
  mkdirSync(join(dp, 'tasks', 'done', 'T-OLD'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'journal'), { recursive: true });

  // Match the real hybrid contract (option C):
  //   backlog        live-shared  (gitignored in main, symlinked in worktrees)
  //   rules          merge-mediated (tracked)
  //   tasks/done     merge-mediated (tracked)
  //   workspace      isolated (gitignored)
  //   tasks/current  isolated (gitignored)
  //   journal        isolated (untracked runtime)
  writeFileSync(join(cwd, '.gitignore'), [
    '/.docpath/workspace/',
    '/.docpath/tasks/current/',
    '/.docpath/backlog',
    '/.worktrees/',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'config.yaml'), 'default_level: 2\n');
  writeFileSync(join(dp, 'backlog', 'backlog.md'), '# Backlog\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'docs.md'), '# Docs Index\n');
  writeFileSync(join(dp, 'docs-index.json'), '{"version":1,"entries":[]}\n');
  writeFileSync(join(dp, 'tasks', 'done', 'T-OLD', 'spec.md'), '# T-OLD - Old task\n');
  writeFileSync(join(dp, 'tasks', 'done', 'T-OLD', 'plan.md'), '## 执行计划\n');
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

// Variant where backlog is tracked (old-style) to exercise the doctor's
// "tracked copy is not live-shared" warning path.
function mkRepoTrackedBacklog() {
  const cwd = mkRepo();
  // Force backlog into git despite the gitignore, then commit.
  git(cwd, ['add', '-f', '.docpath/backlog/backlog.md']);
  git(cwd, ['commit', '-m', 'track backlog']);
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
    assert.match(out, /docpath worktree doctor feature-a/);
    assert.match(out, /export DOCPATH_SESSION=codex-feature-a/);
    assert.equal(existsSync(worktreePath), true);
    assert.equal(existsSync(join(subdir, '.worktrees')), false, 'must anchor .worktrees at git root');
    assert.equal(
      git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']),
      '',
      'new DocPath worktree must not start with tracked .docpath deletions or runtime modifications',
    );

    const backlogResource = join(worktreePath, '.docpath', 'backlog');
    assert.equal(lstatSync(backlogResource).isSymbolicLink(), true, 'backlog must be a live-shared symlink');
    assert.equal(statSync(backlogResource).isDirectory(), true, 'symlinked backlog must resolve to a directory');
    const rulesResource = join(worktreePath, '.docpath', 'rules');
    assert.equal(lstatSync(rulesResource).isSymbolicLink(), false, 'rules must be a merge-mediated tracked copy, not a symlink');
    assert.equal(lstatSync(rulesResource).isDirectory(), true);
    assert.equal(
      git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all', '--', '.docpath/backlog', '.docpath/rules']),
      '',
      'backlog symlink must be gitignored and rules tracked copy must stay clean',
    );
    assert.equal(
      git(worktreePath, ['ls-files', '--', '.docpath/tasks/current']).trim(),
      '',
      'tasks/current must be untracked (isolated) in the worktree',
    );
    assert.equal(
      git(worktreePath, ['ls-files', '--', '.docpath/tasks/done']).trim().length > 0,
      true,
      'tasks/done must stay tracked (merge-mediated) in the worktree',
    );

    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'state.json')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'current.md')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'breadcrumb.md')), true);

    const next = run(['next', '--agent'], worktreePath).output;
    assert.match(next, /agent_view: next/);

    const list = run(['worktree', 'list'], subdir).output;
    assert.match(list, /feature-a/);
    assert.match(list, /docpath: idle \(no active task\)/);
    assert.match(list, /managed_by_docpath: true/);
    assert.match(list, /dirty: false/);
    assert.match(list, /safe_to_remove: false/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('anchors nested creates from a linked worktree at the main checkout', () => {
    const cwd = mkRepo();
    const parentPath = join(cwd, '.worktrees', 'parent-feature');
    const childPath = join(cwd, '.worktrees', 'child-feature');

    run(['worktree', 'create', 'parent-feature'], cwd);
    const out = run(['worktree', 'create', 'child-feature'], parentPath).output;

    assert.match(out, /worktree 已创建/);
    assert.equal(existsSync(childPath), true);
    assert.equal(
      existsSync(join(parentPath, '.worktrees', 'child-feature')),
      false,
      'linked worktree create must not nest .worktrees under the invoking worktree',
    );
    assert.equal(
      git(childPath, ['status', '--porcelain=v1', '--untracked-files=all']),
      '',
      'nested-created DocPath worktree must start clean',
    );

    const list = run(['worktree', 'list'], parentPath).output;
    assert.match(list, new RegExp(`${cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(main\\)`));
    assert.doesNotMatch(list, new RegExp(`${parentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(main\\)`));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('doctors worktree readiness without mutating files', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-doctor');
    run(['worktree', 'create', 'feature-doctor'], cwd);
    const before = git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);

    const named = run(['worktree', 'doctor', 'feature-doctor'], cwd, { env: { DOCPATH_SESSION: '' } }).output;
    assert.match(named, /Worktree doctor: feature-doctor/);
    assert.match(named, /live-shared backlog: symlink/);
    assert.match(named, /merge-mediated rules: tracked copy/);
    assert.match(named, /isolated tasks\/current: .*isolated/);
    assert.match(named, /set DOCPATH_SESSION=codex-feature-doctor/);
    assert.match(named, /worktree doctor passed/);

    const current = run(['worktree', 'doctor'], worktreePath, { env: { DOCPATH_SESSION: '' } }).output;
    assert.match(current, /Worktree doctor: feature-doctor/);
    assert.match(current, /managed_by_docpath: true/);
    assert.match(current, /safe_to_remove: false/);
    assert.match(current, /worktree doctor passed/);

    const after = git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);
    assert.equal(after, before);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('warns when a tracked backlog is not live-shared', () => {
    const cwd = mkRepoTrackedBacklog();
    const worktreePath = join(cwd, '.worktrees', 'feature-stale');
    run(['worktree', 'create', 'feature-stale'], cwd);
    const out = run(['worktree', 'doctor', 'feature-stale'], cwd, { env: { DOCPATH_SESSION: 'codex-feature-stale' } }).output;
    // Tracked backlog copy is a stale snapshot, not a live symlink -> warn, not pass.
    assert.match(out, /⚠️.*live-shared backlog: tracked copy \(not live-shared\)/);
    // rules stays merge-mediated (tracked copy is the expected design, no warning).
    assert.match(out, /✅.*merge-mediated rules: tracked copy/);
    assert.match(out, /worktree doctor passed/);
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
