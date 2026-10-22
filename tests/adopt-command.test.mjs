import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI_PATH = join(process.cwd(), 'dist', 'index.js');

function run(args, cwd, env = {}) {
  return execFileSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function runResult(args, cwd, env = {}) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { code: 0, out: stdout };
  } catch (err) {
    const stdout = err.stdout?.toString?.() || '';
    const stderr = err.stderr?.toString?.() || '';
    return { code: err.status ?? 1, out: `${stdout}\n${stderr}`.trim() };
  }
}

function initGitRepo(cwd) {
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@docpath.local'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'DocPath Tester'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial commit', '--allow-empty'], { cwd, stdio: 'ignore' });
}

describe('docpath adopt and go --adopt', () => {
  it('go --adopt allows dirty worktree and records breadcrumb', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-adopt-go-'));
    try {
      // 1. 初始化 docpath
      run(['init', '--level', '1'], cwd);
      initGitRepo(cwd);

      // 2. 启动一个任务
      run(['start', 'Test Adopt Task', '--draft'], cwd);

      // 3. 在工作区制造 dirty 文件
      writeFileSync(join(cwd, 'app.ts'), 'console.log("dirty edit");\n');

      // 4. 普通 go 应该会被 dirty worktree 拦截
      const normalGo = runResult(['go', '--step', 'S1'], cwd);
      assert.equal(normalGo.code, 1);
      assert.match(normalGo.out, /当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更/);
      assert.match(normalGo.out, /docpath go --step S1 --adopt/);

      // 5. 使用 go --adopt 应当顺利通过
      const adoptGo = runResult(['go', '--step', 'S1', '--adopt'], cwd);
      assert.equal(adoptGo.code, 0);
      assert.match(adoptGo.out, /--adopt 已认领工作区变更至步骤 S1/);

      // 6. 验证 breadcrumb
      const breadcrumbPath = join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl');
      assert.ok(existsSync(breadcrumbPath));
      const breadcrumbContent = readFileSync(breadcrumbPath, 'utf-8');
      assert.match(breadcrumbContent, /go --adopt: claimed working tree changes into S1/);
      assert.doesNotMatch(breadcrumbContent, /accept-dirty/);
      assert.doesNotMatch(adoptGo.out, /accept-dirty/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath adopt claims into current active task without args', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-adopt-cmd-'));
    try {
      run(['init', '--level', '1'], cwd);
      initGitRepo(cwd);
      run(['start', 'Active Task For Adopt', '--draft'], cwd);

      writeFileSync(join(cwd, 'feature.ts'), 'export const active = true;\n');

      // 运行 docpath adopt
      const res = runResult(['adopt'], cwd);
      assert.equal(res.code, 0);
      assert.match(res.out, /检测到进行中的活跃任务/);
      assert.match(res.out, /--adopt 已认领工作区变更至步骤/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath adopt "title" creates and starts new task with adopt when idle', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-adopt-new-'));
    try {
      run(['init', '--level', '1'], cwd);
      initGitRepo(cwd);

      // 随手改了代码，此时无任务
      writeFileSync(join(cwd, 'utils.ts'), 'export function helper() {}\n');

      // 运行 docpath adopt "Helper feature"
      const res = runResult(['adopt', 'Helper feature'], cwd);
      assert.equal(res.code, 0);
      assert.match(res.out, /正在就地认领代码并启动新任务: "Helper feature"/);
      assert.match(res.out, /一键拉起任务并启动执行/);

      const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath adopt without title warns and provides guidance when uncommitted files exist', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-adopt-guide-'));
    try {
      run(['init', '--level', '1'], cwd);
      initGitRepo(cwd);

      writeFileSync(join(cwd, 'scratch.ts'), 'const scratch = 1;\n');

      const res = runResult(['adopt'], cwd);
      assert.equal(res.code, 1);
      assert.match(res.out, /当前没有活跃任务，无法直接将变更认领至步骤/);
      assert.match(res.out, /scratch\.ts/);
      assert.match(res.out, /认领并创建新任务: docpath adopt "<任务标题>"/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
