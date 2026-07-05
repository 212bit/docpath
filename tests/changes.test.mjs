import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
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

function mkTasklessBacklogWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-changes-taskless-'));
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');

  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: changes-taskless-test\n');
  writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
    level: 0,
    task_id: '',
    task_title: '',
    phase: 'idle',
    gate: 'none',
    current_step: 'waiting',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2) + '\n');
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

  it('allows taskless intake closeout for backlog-only evidence changes', () => {
    const cwd = mkTasklessBacklogWorkspace();
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001.md'), '# R-001\n');

    const out = run('changes --agent', cwd);

    assert.match(out, /ready_to_commit: true/);
    assert.match(out, /closeout_context: "taskless_intake"/);
    assert.match(out, /artifact_policy:/);
    assert.match(out, /canonical_default: true/);
    assert.match(out, /current_alias_policy: "tasks\/current is a mutable working alias/);
    assert.doesNotMatch(out, /当前没有关联的 DocPath 任务/);
    assert.doesNotMatch(out, /last-check\.md 未显示 PASS/);
    assert.doesNotMatch(out, /review\.md 未显示通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('uses JSON-only check and review evidence for readiness', () => {
    const cwd = mkGitWorkspace();
    const workspace = join(cwd, '.docpath', 'workspace');
    rmSync(join(workspace, 'last-check.md'), { force: true });
    rmSync(join(workspace, 'review.md'), { force: true });
    writeFileSync(join(workspace, 'last-check.json'), JSON.stringify({
      schema_version: 1,
      kind: 'last-check',
      timestamp: '2026-06-01T00:00:00.000Z',
      passed: true,
      check_count: 1,
      checks: [{ name: 'JSON check', passed: true, output: '' }],
    }, null, 2));
    writeFileSync(join(workspace, 'review.json'), JSON.stringify({
      schema_version: 1,
      kind: 'review',
      timestamp: '2026-06-01T00:00:00.000Z',
      files: ['README.md'],
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      approved: true,
    }, null, 2));
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const out = run('changes --agent --since HEAD', cwd);

    assert.match(out, /ready_to_commit: true/);
    assert.doesNotMatch(out, /last-check\.md 未显示 PASS/);
    assert.doesNotMatch(out, /review\.md 未显示通过/);
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

  it('changes --agent emits compact YAML for clean worktrees', () => {
    const cwd = mkGitWorkspace();

    const out = run('changes --agent', cwd);

    assert.match(out, /ready_to_commit: false/);
    assert.match(out, /当前工作树没有可提交变更/);
    // Compact output no longer includes worktree/canonical_evidence/alias_evidence fields
    assert.doesNotMatch(out, /groups:/);
    assert.doesNotMatch(out, /ignored_evidence:/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('separates expected DocPath worktree isolation noise from commit-relevant files', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'done', 'T-OLD'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), '# tracked backlog\n');
    writeFileSync(join(cwd, '.docpath', 'rules', 'style.md'), '# tracked style\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'done', 'T-OLD', 'spec.md'), '# old spec\n');
    git(cwd, 'add .docpath/backlog .docpath/rules .docpath/tasks/done');
    git(cwd, 'commit -m tracked-docpath');

    const shared = join(cwd, 'shared-docpath');
    mkdirSync(join(shared, 'backlog'), { recursive: true });
    mkdirSync(join(shared, 'rules'), { recursive: true });
    writeFileSync(join(shared, 'backlog', 'backlog.md'), '# shared backlog\n');
    writeFileSync(join(shared, 'rules', 'style.md'), '# shared style\n');
    rmSync(join(cwd, '.docpath', 'backlog'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'rules'), { recursive: true, force: true });
    rmSync(join(cwd, '.docpath', 'tasks', 'done', 'T-OLD'), { recursive: true, force: true });
    symlinkSync(join(shared, 'backlog'), join(cwd, '.docpath', 'backlog'), 'dir');
    symlinkSync(join(shared, 'rules'), join(cwd, '.docpath', 'rules'), 'dir');

    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'feature.ts'), 'export const feature = true;\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'review.md'), '# changed review\n');

    const parsed = JSON.parse(run('changes --json', cwd));
    assert.equal(parsed.worktree_isolation.active, true);
    assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/backlog/backlog.md'), true);
    assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/rules/style.md'), true);
    assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/tasks/done/T-OLD/spec.md'), true);
    assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/workspace/review.md'), true);
    assert.equal(parsed.worktree_isolation.commit_relevant_files.includes('src/feature.ts'), true);

    const agent = run('changes --agent', cwd);
    assert.match(agent, /worktree_isolation:/);
    assert.match(agent, /expected_noise_count: [1-9]/);
    assert.match(agent, /commit_relevant_files:/);
    assert.match(agent, /src\/feature\.ts/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports ignored DocPath evidence with git add -f hints in all output modes', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, '.gitignore'), [
      '.docpath/backlog/',
      '.docpath/tasks/T-CHANGES/',
      '',
    ].join('\n'));
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# spec\n\n> backlog_id: R-999\n');
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-999.md'), '# ignored backlog\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES', 'spec.md'), '# ignored spec\n\n> backlog_id: R-999\n');
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const human = run('changes', cwd);
    assert.match(human, /被 gitignore 忽略的 DocPath evidence \(2\)/);
    assert.match(human, /.docpath\/backlog\/R-999\.md/);
    assert.match(human, /.docpath\/tasks\/T-CHANGES\/spec\.md/);
    assert.match(human, /推荐: docpath commit --stage/);
    assert.match(human, /fallback:/);
    assert.match(human, /git add -f .*\.docpath\/backlog\/R-999\.md .*\.docpath\/tasks\/T-CHANGES\/spec\.md/);
    assert.match(human, /存在被 gitignore 忽略的 DocPath canonical evidence/);

    const agent = run('changes --agent', cwd);
    assert.match(agent, /ignored_evidence:/);
    assert.match(agent, /check: "checked"/);
    assert.match(agent, /count: 2/);
    assert.match(agent, /canonical_count: 2/);
    assert.match(agent, /add_command: "git add -f .*\.docpath\/backlog\/R-999\.md .*\.docpath\/tasks\/T-CHANGES\/spec\.md"/);
    assert.match(agent, /recommended_stage_command: "docpath commit --stage"/);
    // Note: alias_count removed in agent output optimization

    const parsed = JSON.parse(run('changes --json', cwd));
    assert.equal(parsed.ignored_evidence.check, 'checked');
    assert.equal(parsed.ignored_evidence.files.length, 2);
    assert.equal(parsed.ignored_evidence.canonical_files.length, 2);
    assert.equal(parsed.ignored_evidence.alias_files.length, 0);
    assert.equal(parsed.ignored_evidence.files.includes('.docpath/backlog/R-999.md'), true);
    assert.equal(parsed.ignored_evidence.files.includes('.docpath/tasks/T-CHANGES/spec.md'), true);
    assert.match(parsed.ignored_evidence.add_command, /git add -f/);
    assert.equal(parsed.recommended_stage_command, 'docpath commit --stage');
    assert.equal(parsed.ready_to_commit, false);
    assert.equal(parsed.blocking_reasons.some((reason) => /gitignore 忽略的 DocPath canonical evidence/.test(reason)), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not suggest force-adding tasks/current alias evidence by default', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, '.gitignore'), '.docpath/tasks/current/\n');
    git(cwd, 'add .gitignore');
    git(cwd, 'commit -m ignore-current');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.json'), '{"alias":true}\n');
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const parsed = JSON.parse(run('changes --json', cwd));

    assert.equal(parsed.ignored_evidence.check, 'checked');
    assert.equal(parsed.ignored_evidence.files.length, 1);
    assert.equal(parsed.ignored_evidence.canonical_files.length, 0);
    assert.equal(parsed.ignored_evidence.alias_files.length, 1);
    assert.equal(parsed.ignored_evidence.alias_files[0], '.docpath/tasks/current/spec.json');
    assert.equal(parsed.ignored_evidence.add_command, null);
    assert.equal(parsed.recommended_stage_command, null);
    assert.equal(parsed.ready_to_commit, true);
    assert.equal(parsed.blocking_reasons.some((reason) => /canonical evidence/.test(reason)), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('commit --stage force-adds canonical ignored evidence and excludes tasks/current aliases', () => {
    const cwd = mkGitWorkspace();
    writeFileSync(join(cwd, '.gitignore'), [
      '.docpath/backlog/',
      '.docpath/tasks/T-CHANGES/',
      '.docpath/tasks/current/',
      '',
    ].join('\n'));
    git(cwd, 'add .gitignore');
    git(cwd, 'commit -m ignore-evidence');
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.json'), '{"alias":true}\n');
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-999.md'), '# ignored backlog\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES', 'spec.md'), '# ignored spec\n\n> backlog_id: R-999\n');

    const out = run('commit --stage', cwd);
    const staged = git(cwd, 'diff --cached --name-only');

    assert.match(out, /force-add canonical evidence/);
    assert.match(staged, /\.docpath\/backlog\/R-999\.md/);
    assert.match(staged, /\.docpath\/tasks\/T-CHANGES\/spec\.md/);
    assert.doesNotMatch(staged, /\.docpath\/tasks\/current\/spec\.json/);
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
    assert.match(out, /check: "skipped"/);
    assert.match(out, /skip_reason: "since mode summarizes committed diff and skips pre-commit ignored evidence readiness"/);
    assert.match(out, /src\/feature\.ts/);
    assert.doesNotMatch(out, /存在未跟踪文件/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('changes --since last-check uses git_ref recorded by check evidence', () => {
    const cwd = mkGitWorkspace();
    const baseline = git(cwd, 'rev-parse HEAD').trim();
    writeFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), [
      '# Last Check Evidence',
      '',
      '**结果**: ✅ PASS',
      `git_ref: ${baseline}`,
      'branch: main',
      'worktree_dirty: false',
      '',
    ].join('\n'));
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'after-check.ts'), 'export const after = true;\n');
    git(cwd, 'add src/after-check.ts .docpath/workspace/last-check.md');
    git(cwd, 'commit -m after-check');

    const out = run('changes --since last-check --agent', cwd);

    assert.match(out, /mode: "since"/);
    assert.match(out, new RegExp(`since: "${baseline}"`));
    assert.match(out, /src\/after-check\.ts/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
