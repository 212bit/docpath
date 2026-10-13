import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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
  const cwd = mkdtempSync(join(tmpdir(), 'dp-done-commit-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: commit-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

describe('docpath done --commit & quick --commit: 一键收口并提交', () => {
  it('quick --adopt --commit 自动认领、完成并提交到 Git', () => {
    const cwd = mkRepo();
    try {
      // 创建业务改动
      writeFileSync(join(cwd, 'readme.txt'), 'hello world\n');

      // 执行 quick --adopt --commit
      const out = run(['quick', 'fix readme', '--adopt', '--commit'], cwd);
      assert.match(out, /task 已创建/);
      assert.match(out, /Commit created successfully/);

      // 验证 Git HEAD 提交记录
      const log = git(cwd, ['log', '-1', '--oneline']);
      assert.match(log, /fix readme/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('done --commit 在存在 index.lock 时预检拦截，防止门禁后提交失败悬空', () => {
    const cwd = mkRepo();
    try {
      // 启动一个常规任务
      run(['start', 'test preflight', '--draft'], cwd);
      writeFileSync(join(cwd, 'test.txt'), 'content\n');
      run(['go', '--step', 'S1', '--accept-dirty', 'work'], cwd);
      run(['step-pass', '--step', 'S1'], cwd);

      // 人工制造 index.lock 模拟后台进程占用或崩溃遗留锁
      writeFileSync(join(cwd, '.git', 'index.lock'), '');

      // 执行 done --commit 必须在门禁前被预检拦截
      assert.throws(() => {
        run(['done', '--commit'], cwd);
      }, /Git 提交环境预检失败|index\.lock/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

