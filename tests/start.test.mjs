import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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
  const cwd = mkdtempSync(join(tmpdir(), 'dp-start-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: start-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

describe('docpath start: 一键冷启动任务', () => {
  it('start R-xxx --draft 一键完成 promote + plan + go S1', () => {
    const cwd = mkRepo();
    try {
      // 1. 添加一条 backlog
      run(['backlog', 'add', '--title', '测试一键启动功能', '--priority', 'P1', '--level', '1', '--background', '真实背景描述', '--acceptance', 'AC-1: 功能正常工作'], cwd);

      // 2. 获取创建的 backlog ID
      const backlogFiles = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      const backlogId = backlogFiles[0].replace('.md', '').split('-').slice(0, 2).join('-');

      // 3. 执行 docpath start <id> --draft
      const out = run(['start', backlogId, '--draft'], cwd);
      assert.match(out, /docpath start/);
      assert.match(out, /已拉起并启动步骤 S1/);

      // 4. 验证状态机
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start "<title>" --draft 一键完成 auto-capture + promote + plan + go S1', () => {
    const cwd = mkRepo();
    try {
      // 执行 docpath start "<title>" --draft
      const out = run(['start', '从零标题直接一键拉起任务', '--draft'], cwd);
      assert.match(out, /检测到任务标题 "从零标题直接一键拉起任务"，自动创建 Backlog 并一键拉起/);
      assert.match(out, /已拉起并启动步骤 S1/);

      // 验证状态机与生成的任务
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
      assert.match(state.task_id, /^T-/);

      // 验证 backlog 确实被创建并与 task 绑定
      const backlogFiles = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      assert.equal(backlogFiles.length, 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

