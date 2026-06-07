import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status ?? 1,
      out: `${error.stdout?.toString() || ''}${error.stderr?.toString() || ''}`,
    };
  }
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function mkGitWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-changes-'));
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');

  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: changes-test\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-CHANGES',
    task_title: '新增 changes 命令',
    phase: 'executing',
    gate: 'review_pass',
    current_step: 'S2',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2) + '\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'current.md'), '# current\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'review.md'), '# Review\n\n✅ 代码审查: 0 错误, 0 警告, 0 提示\n');
  writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# spec\n');
  writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), '# plan\n');
  writeFileSync(join(cwd, 'README.md'), '# test\n');

  git(cwd, 'add .');
  git(cwd, 'commit -m initial');
  return cwd;
}

describe('changes command', () => {
  it('fails loudly outside a git repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-changes-nongit-'));
    const result = runResult('changes', cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /不是 git 仓库/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('groups dirty and untracked files in human output', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, 'src'), { recursive: true });
    mkdirSync(join(cwd, 'tests'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'feature.ts'), 'export const x = 1;\n');
    writeFileSync(join(cwd, 'tests', 'feature.test.mjs'), 'import assert from "node:assert";\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb\n');
    writeFileSync(join(cwd, 'docs.md'), '# docs\n');

    const out = run('changes', cwd);

    assert.match(out, /DocPath 变更收口/);
    assert.match(out, /源码/);
    assert.match(out, /src\/feature\.ts/);
    assert.match(out, /测试/);
    assert.match(out, /tests\/feature\.test\.mjs/);
    assert.match(out, /DocPath 运行态/);
    assert.match(out, /.docpath\/workspace\/breadcrumb\.md/);
    assert.match(out, /模板\/文档/);
    assert.match(out, /docs\.md/);
    assert.match(out, /存在未跟踪文件/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports ready_to_commit in agent output when evidence is complete and tracked changes exist', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, '.docpath', 'workspace', 'review.md'), '# Code Review Report\n\n- [WARN] src/a.ts: 函数较长\n');
    writeFileSync(join(cwd, 'README.md'), '# changed\n');
    const out = run('changes --agent', cwd);

    assert.match(out, /ready_to_commit: true/);
    assert.match(out, /task_id: "T-CHANGES"/);
    assert.match(out, /total: 2/);
    assert.match(out, /.docpath\/workspace\/review\.md/);
    assert.match(out, /suggested_commit_message: "docs: 新增 changes 命令"/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('blocks readiness when check or review evidence is missing', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ❌ FAIL\n');
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const out = run('changes --agent', cwd);

    assert.match(out, /ready_to_commit: false/);
    assert.match(out, /last-check\.md 未显示 PASS/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('changes --json emits parseable JSON for automation', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const out = run('changes --json', cwd);
    const parsed = JSON.parse(out);

    assert.equal(parsed.mode, 'worktree');
    assert.equal(parsed.since, null);
    assert.equal(parsed.ready_to_commit, true);
    assert.equal(parsed.groups.templates_docs.includes('README.md'), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('changes --since summarizes diff files from a git ref', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'feature.ts'), 'export const x = 1;\n');
    git(cwd, 'add src/feature.ts');
    git(cwd, 'commit -m feature');

    const out = run('changes --since HEAD~1 --agent', cwd);

    assert.match(out, /mode: "since"/);
    assert.match(out, /since: "HEAD~1"/);
    assert.match(out, /src\/feature\.ts/);
    assert.doesNotMatch(out, /存在未跟踪文件/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
