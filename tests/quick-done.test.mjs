import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

// R-340: quick-done 一键收口 = done 门禁序列 + changes --agent 提交准备报告。

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  });
  return {
    code: result.status ?? 0,
    out: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initGitRepo(cwd) {
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'initial']);
}

// done 门禁序列要求 phase=checking / gate=check_pass（与 done-soft-reminder 夹具一致），
// mkExecWorkspace 给的是 executing/none，收口测试需要覆写状态。
function tuneForDone(cwd) {
  const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
  writeFileSync(statePath, JSON.stringify({
    level: 2,
    task_id: 'T-AGENT',
    task_title: 'Agent Lifecycle',
    phase: 'checking',
    state: 'in_progress',
    gate: 'check_pass',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2));
}

describe('docpath quick-done (R-340)', () => {
  it('runs done gate sequence then prints commit-readiness report in one call', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-done-'));
    try {
      mkExecWorkspace(cwd);
      tuneForDone(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'app.ts'), 'export const answer = 42;\n');

      const result = run(
        ['quick-done', '--skip-check', '--skip-review', '--note', 'test: skip heavy gates', '--no-dirty-reminder'],
        cwd,
      );
      assert.equal(result.code, 0, `quick-done failed: ${result.out}`);
      // 阶段 1：done 门禁序列（底层 agent done）
      assert.match(result.out, /quick-done: 一键收口/);
      assert.match(result.out, /任务完成流程已执行/);
      // 阶段 2：提交准备报告（复用 changes --agent 视图）
      assert.match(result.out, /提交准备 \(changes --agent\)/);
      assert.match(result.out, /suggested_commit_message|closeout_context/);
      // 收尾指引
      assert.match(result.out, /docpath commit --stage/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not reach commit prep when done gates fail', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-done-fail-'));
    try {
      mkExecWorkspace(cwd);
      tuneForDone(cwd);
      // skip-check 无 --note → requireSkipReason 报错，必须中断在阶段 1
      const result = run(['quick-done', '--skip-check'], cwd);
      assert.notEqual(result.code, 0);
      assert.match(result.out, /requires --note/);
      assert.doesNotMatch(result.out, /─── 提交准备 \(changes --agent\) ───/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails loud without a bound task', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-done-none-'));
    try {
      const result = run(['quick-done', '--note', 'no task'], cwd);
      assert.notEqual(result.code, 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('records lesson candidate when --gotcha is provided', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-done-gotcha-'));
    try {
      mkExecWorkspace(cwd);
      tuneForDone(cwd);
      initGitRepo(cwd);

      const result = run(
        [
          'quick-done',
          '--skip-check',
          '--skip-review',
          '--note',
          'test: skip gates',
          '--no-dirty-reminder',
          '--gotcha',
          '在处理文件路径时必须使用 path.join 避免跨平台路径分隔符错误',
        ],
        cwd,
      );
      assert.equal(result.code, 0, `quick-done failed: ${result.out}`);
      assert.match(result.out, /Lesson\/Gotcha 候选已记录/);

      const candidateContent = spawnSync('cat', [join(cwd, '.docpath', 'workspace', 'lesson-candidates.md')], { encoding: 'utf-8' }).stdout;
      assert.match(candidateContent, /跨平台路径分隔符错误/);
      assert.match(candidateContent, /source: quick-done/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
