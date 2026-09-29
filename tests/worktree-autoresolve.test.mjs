import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function run(args, cwd, { expectFailure = false, env = {} } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 60000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!expectFailure && result.status !== 0) {
    throw new Error(`command failed (${result.status}): docpath ${args.join(' ')}\n${output}`);
  }
  return output;
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-wt-auto-'));
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 't@t']);
  git(cwd, ['config', 'user.name', 't']);
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'journal'), { recursive: true });
  writeFileSync(join(dp, 'docs-index.json'), JSON.stringify({ version: 1, entries: [] }));
  writeFileSync(join(dp, 'backlog', 'backlog.md'), '# Backlog\n\n| id | title |\n|---|---|\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({ level: 1, task_id: '', phase: 'idle' }));
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', 'init']);
  return cwd;
}

function commitFile(cwd, relPath, content, message) {
  mkdirSync(join(cwd, relPath, '..'), { recursive: true });
  writeFileSync(join(cwd, relPath), content);
  git(cwd, ['add', relPath]);
  git(cwd, ['commit', '-q', '-m', message]);
}

describe('worktree merge auto-resolution (R-345)', () => {
  it('auto-resolves rebuildable index conflicts in the closeout direction', () => {
    const cwd = mkRepo();
    const name = 'auto-closeout';
    run(['worktree', 'create', name], cwd);
    const wt = join(cwd, '.worktrees', name);

    // 两侧各自刷新 docs-index.json 制造内容冲突（可再生索引）
    const mainIndex = JSON.stringify({ version: 1, entries: [{ path: 'main-side.md' }] });
    const wtIndex = JSON.stringify({ version: 1, entries: [{ path: 'branch-side.md' }] });
    commitFile(cwd, '.docpath/docs-index.json', mainIndex, 'main refreshes docs index');
    commitFile(wt, '.docpath/docs-index.json', wtIndex, 'branch refreshes docs index');

    // worktree 任务标记 completed，走收口方向
    writeFileSync(join(wt, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-R345', backlog_id: 'R-345', phase: 'completed',
    }));

    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const out = run(['worktree', 'merge', activeBranch], wt, { env: { CODE_MERGE_TARGET: activeBranch } });

    assert.match(out, /冲突文件全部为可重建索引，自动消解/);
    assert.match(out, /worktree-merge 完成/);
    // 主仓合并后 docs-index.json 存在且为合法 JSON（已消解）
    const merged = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
    // R-439: docs-index schema version 1→2；消解走 refreshProjectDocumentIndex 重建，落盘为当前 schema 版本
    assert.equal(merged.version, 2);
    // 主仓无 mid-merge 残留
    assert.equal(existsSync(join(cwd, '.git', 'MERGE_HEAD')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not auto-resolve when conflicts include non-rebuildable files (abort, no mid-merge)', () => {
    const cwd = mkRepo();
    const name = 'auto-closeout-src';
    run(['worktree', 'create', name], cwd);
    const wt = join(cwd, '.worktrees', name);

    commitFile(cwd, 'src/shared.ts', 'export const v = 1;\n', 'main version');
    commitFile(wt, 'src/shared.ts', 'export const v = 2;\n', 'branch version');

    writeFileSync(join(wt, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-R345', backlog_id: 'R-345', phase: 'completed',
    }));

    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const out = run(['worktree', 'merge', activeBranch], wt, {
      expectFailure: true,
      env: { CODE_MERGE_TARGET: activeBranch },
    });

    // 冲突在同步方向（FR-3）即被拦截：不可消解 → abort + 干净现场（all-or-nothing）
    assert.match(out, /合并目标分支 main 时发生冲突/);
    assert.match(out, /merge --abort/);
    assert.match(out, /src\/shared\.ts/);
    // worktree 不残留 mid-merge
    const status = git(wt, ['status', '--porcelain=v1']);
    assert.equal(status, '', 'worktree must be clean after aborted sync merge');
    // 主仓也未被触碰
    assert.equal(existsSync(join(cwd, '.git', 'MERGE_HEAD')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('auto-resolves rebuildable index conflicts in the sync direction and aborts cleanly otherwise', () => {
    const cwd = mkRepo();
    const name = 'auto-sync';
    run(['worktree', 'create', name], cwd);
    const wt = join(cwd, '.worktrees', name);
    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

    // 场景 A：仅索引冲突 → 同步方向自动消解
    commitFile(cwd, '.docpath/backlog/backlog.md', '# Backlog\n\n| id | title | new col |\n', 'main backlog refresh');
    commitFile(wt, '.docpath/backlog/backlog.md', '# Backlog\n\n| id | title | branch col |\n', 'branch backlog refresh');
    writeFileSync(join(wt, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-R345', backlog_id: 'R-345', phase: 'executing',
    }));
    const syncOut = run(['worktree', 'merge', activeBranch], wt, { env: { CODE_MERGE_TARGET: activeBranch } });
    assert.match(syncOut, /自动消解并完成合并/);
    assert.match(syncOut, /当前任务 phase=executing/);
    assert.equal(existsSync(join(wt, '.git', 'MERGE_HEAD')) || existsSync(join(wt, '..', '..', '.git', 'worktrees', name, 'MERGE_HEAD')), false);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('sync direction with non-rebuildable conflicts aborts cleanly (no mid-merge left)', () => {
    const cwd = mkRepo();
    const name = 'auto-sync-src';
    run(['worktree', 'create', name], cwd);
    const wt = join(cwd, '.worktrees', name);
    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

    commitFile(cwd, 'src/only-main.ts', 'main\n', 'main only');
    // 制造同一文件分叉 + 主仓先行提交 → 同步方向必然冲突
    commitFile(wt, 'src/conflict.ts', 'branch\n', 'branch version');
    commitFile(cwd, 'src/conflict.ts', 'main\n', 'main version');

    writeFileSync(join(wt, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-R345', backlog_id: 'R-345', phase: 'executing',
    }));
    const out = run(['worktree', 'merge', activeBranch], wt, {
      expectFailure: true,
      env: { CODE_MERGE_TARGET: activeBranch },
    });

    assert.match(out, /merge --abort/);
    // worktree 无 mid-merge 残留
    const status = git(wt, ['status', '--porcelain=v1']);
    assert.equal(status, '', 'worktree must be clean after aborted sync merge');
    rmSync(cwd, { recursive: true, force: true });
  });
});
