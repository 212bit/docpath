import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function runResult(args, cwd) {
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

function mkBaseWorkspace({ phase = 'checking', state = 'in_progress', taskId = 'T-TEST', taskTitle = 'Test Task' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-done-reminder-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', taskId), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: done-reminder-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: taskId,
    task_title: taskTitle,
    phase,
    state,
    gate: 'check_pass',
    current_step: 'S1',
    started_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-06-18T00:00:00.000Z',
  }, null, 2));

  writeFileSync(join(dp, 'workspace', 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-06-18T00:00:00.000Z',
    '**结果**: ✅ PASS',
    '**检查项**: 1',
    '',
  ].join('\n'));

  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');

  // Spec file is required to be read by some sub-commands
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), `# ${taskId} - ${taskTitle}\n\n## 5. 验收标准\n- [ ] AC-1\n`);
  writeFileSync(join(dp, 'tasks', taskId, 'spec.md'), `# ${taskId} - ${taskTitle}\n\n## 5. 验收标准\n- [ ] AC-1\n`);

  return cwd;
}

describe('done command soft dirty reminder', () => {
  it('prints warning banner, file list, commit suggestion, and disclaimer on dirty business files, exit 0', () => {
    const cwd = mkBaseWorkspace();
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'app.ts'), 'console.log("dirty");\n');

      const result = runResult(['done', '--skip-check', '--skip-review', '--note', 'skip gates'], cwd);
      if (result.code !== 0) {
        console.log('--- CLI ERROR OUTPUT ---', result.out);
      }
      assert.equal(result.code, 0);
      // Warning Banner
      assert.match(result.out, /警告: 存在未提交的业务代码\/测试文件变动/);
      // File list
      assert.match(result.out, /src\/app\.ts/);
      // Suggestion
      assert.match(result.out, /docpath changes --agent/);
      // Disclaimer
      assert.match(result.out, /免责声明: 这些文件可能混合了多个任务\/Agent 的改动/);
      // Operations Audit
      assert.match(result.out, /未提交业务文件: 1/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not print dirty reminder when --no-dirty-reminder flag is passed, but audit count shows 1, exit 0', () => {
    const cwd = mkBaseWorkspace();
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'app.ts'), 'console.log("dirty");\n');

      const result = runResult(['done', '--skip-check', '--skip-review', '--note', 'skip gates', '--no-dirty-reminder'], cwd);

      assert.equal(result.code, 0);
      assert.doesNotMatch(result.out, /警告: 存在未提交的业务代码\/测试文件变动/);
      assert.match(result.out, /未提交业务文件: 1/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not print warning when only .docpath files are dirty, audit count is 0, exit 0', () => {
    const cwd = mkBaseWorkspace();
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, '.docpath', 'dummy.md'), 'dirty\n');

      const result = runResult(['done', '--skip-check', '--skip-review', '--note', 'skip gates'], cwd);
      if (result.code !== 0) {
        console.log('--- CLI ERROR OUTPUT ---', result.out);
      }
      assert.equal(result.code, 0);
      assert.doesNotMatch(result.out, /警告: 存在未提交的业务代码\/测试文件变动/);
      assert.match(result.out, /未提交业务文件: 0/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('agent done command supports --no-dirty-reminder and behaves correctly', () => {
    const cwd = mkBaseWorkspace();
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'app.ts'), 'console.log("dirty");\n');

      // Test default agent done prints reminder
      const resultDefault = runResult(['agent', 'done', '--skip-check', '--skip-review', '--note', 'skip gates'], cwd);
      if (resultDefault.code !== 0) {
        console.log('--- CLI ERROR OUTPUT ---', resultDefault.out);
      }
      assert.equal(resultDefault.code, 0);
      assert.match(resultDefault.out, /警告: 存在未提交的业务代码\/测试文件变动/);

      // Reset state.json because agent done might have completed the task
      writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        level: 2,
        task_id: 'T-TEST',
        task_title: 'Test Task',
        phase: 'checking',
        state: 'in_progress',
        gate: 'check_pass',
        current_step: 'S1',
        started_at: '2026-06-18T00:00:00.000Z',
        updated_at: '2026-06-18T00:00:00.000Z',
      }, null, 2));

      // Test agent done with --no-dirty-reminder does not print reminder
      const resultMuted = runResult(['agent', 'done', '--skip-check', '--skip-review', '--note', 'skip gates', '--no-dirty-reminder'], cwd);
      if (resultMuted.code !== 0) {
        console.log('--- CLI ERROR OUTPUT ---', resultMuted.out);
      }
      assert.equal(resultMuted.code, 0);
      assert.doesNotMatch(resultMuted.out, /警告: 存在未提交的业务代码\/测试文件变动/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
