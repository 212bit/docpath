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

  it('start "<title>" 在工作区存在未提交改动且未传 --adopt 时严格报错拦截', () => {
    const cwd = mkRepo();
    try {
      // 在起手前先修改一个文件
      writeFileSync(join(cwd, 'uncommitted.ts'), 'export const hello = "world";\n');

      // 执行 docpath start "<title>"（未显式传递 --adopt）应该抛错
      assert.throws(
        () => run(['start', '已有未提交改动未加adopt启动', '--draft'], cwd),
        /存在未提交变更，拒绝在 dirty worktree 上启动新任务/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start "<title>" --adopt 显式传参时成功认领已有改动并启动执行', () => {
    const cwd = mkRepo();
    try {
      writeFileSync(join(cwd, 'uncommitted.ts'), 'export const hello = "world";\n');

      // 执行 docpath start "<title>" --adopt --draft
      const out = run(['start', '已有未提交改动显式认领启动', '--adopt', '--draft'], cwd);
      assert.match(out, /已启用 --adopt 模式/);
      assert.match(out, /已拉起并启动步骤 S1/);

      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start 在已有活跃任务处于 executing 期时前置拦截禁止覆盖', () => {
    const cwd = mkRepo();
    try {
      // 启动第一个任务
      run(['start', '第一个进行中任务'], cwd);

      // 尝试在未完成状态下启动第二个任务
      assert.throws(
        () => run(['start', '尝试覆盖启动第二个任务'], cwd),
        /当前已有活跃任务/
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start 支持多词无引号输入 (docpath start Fix bug in auth)', () => {
    const cwd = mkRepo();
    try {
      const out = run(['start', 'Fix', 'bug', 'in', 'auth'], cwd);
      assert.match(out, /检测到任务标题 "Fix bug in auth"，自动创建 Backlog 并一键拉起/);
      assert.match(out, /已拉起并启动步骤 S1/);

      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
      assert.equal(state.task_title, 'Fix bug in auth');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start 智能识别标题中内嵌的（R-xxx）/ [R-xxx]，复用既有 Backlog 而不产生身份漂移与重复创建', () => {
    const cwd = mkRepo();
    try {
      // 1. 预先创建 R-180 backlog 条目
      run(['backlog', 'add', '--title', 'dead-drop 机密性信封：候选区加密', '--priority', 'P2', '--level', '2', '--background', '加密载荷背景', '--acceptance', 'AC-1: 密文不可读'], cwd);

      const backlogFilesBefore = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      assert.equal(backlogFilesBefore.length, 1);
      const originalId = backlogFilesBefore[0].replace('.md', '').split('-').slice(0, 2).join('-');

      // 2. 使用含中文全角括号的标题执行 start
      const out = run(['start', `dead-drop 机密性信封：候选区加密（${originalId}）`, '--draft'], cwd);
      assert.match(out, /从标题中识别到既有 Backlog 条目:/);
      assert.match(out, new RegExp(`一键拉起任务并启动执行 \\(${originalId}\\)`));
      assert.match(out, /已拉起并启动步骤 S1/);

      // 3. 验证没有创建重复的 R-(N+1) 条目
      const backlogFilesAfter = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      assert.equal(backlogFilesAfter.length, 1, '不应创建多余的 Backlog 条目');

      // 4. 验证状态机绑定的是既有 ID
      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.backlog_id, originalId);
      assert.equal(state.phase, 'executing');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('start 智能匹配既有活跃 Backlog 标题，避免重复创建条目', () => {
    const cwd = mkRepo();
    try {
      // 1. 预先创建 backlog 条目
      run(['backlog', 'add', '--title', '优化生命周期调度器', '--priority', 'P1', '--level', '1', '--background', '调度优化', '--acceptance', 'AC-1: 调度正常'], cwd);

      const backlogFilesBefore = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      const originalId = backlogFilesBefore[0].replace('.md', '').split('-').slice(0, 2).join('-');

      // 2. 传入同名标题（不带 ID）
      const out = run(['start', '优化生命周期调度器', '--draft'], cwd);
      assert.match(out, /匹配到既有活跃 Backlog 条目:/);
      assert.match(out, new RegExp(`一键拉起任务并启动执行 \\(${originalId}\\)`));

      // 3. 验证未创建重复条目
      const backlogFilesAfter = readdirSync(join(cwd, '.docpath', 'backlog')).filter(f => f.startsWith('R-') && f.endsWith('.md'));
      assert.equal(backlogFilesAfter.length, 1);

      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.backlog_id, originalId);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

