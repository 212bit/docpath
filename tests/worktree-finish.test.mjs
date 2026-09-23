import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const argList = Array.isArray(args) ? args : args.split(/\s+/);
  return execFileSync('node', [BIN, ...argList], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-wt-finish-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: wt-finish-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

describe('docpath worktree finish: 合并并清理 worktree', () => {
  it('worktree finish <name> 一键合并回主分支并移除 worktree', () => {
    const cwd = mkRepo();
    try {
      // 1. 创建 worktree
      run(['worktree', 'create', 'feat-test'], cwd);
      const wtDir = join(cwd, '.worktrees', 'feat-test');
      assert.equal(existsSync(wtDir), true);

      // 2. 在 worktree 中提交一个改动并标记 completed
      writeFileSync(join(wtDir, 'feat.txt'), 'feature content\n');
      git(wtDir, ['add', '-A']);
      git(wtDir, ['commit', '-qm', 'add feat']);

      // 写入 completed 状态
      writeFileSync(join(wtDir, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        task_id: 'T-FEAT',
        phase: 'completed',
        gate: 'review_pass',
      }));

      // 3. 在主仓执行 docpath worktree finish feat-test
      const out = run(['worktree', 'finish', 'feat-test'], cwd);
      assert.match(out, /已成功合并回主分支并完成工作区清理/);
      assert.equal(existsSync(wtDir), false);
      assert.equal(existsSync(join(cwd, 'feat.txt')), true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
