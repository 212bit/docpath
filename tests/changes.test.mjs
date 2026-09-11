import './registry-isolation.mjs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    assert.equal(parsed.selection.mode, 'current_task');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports task-aware grouping for current task canonical evidence', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-OTHER'), { recursive: true });
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES', 'spec.md'), '# T-CHANGES - 新增 changes 命令\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-OTHER', 'spec.md'), '# T-OTHER - 其他任务\n');
    writeFileSync(join(cwd, 'src', 'mixed.ts'), 'export const mixed = true;\n');

    const parsed = JSON.parse(run('changes --json', cwd));

    assert.equal(parsed.selection.mode, 'current_task');
    assert.equal(parsed.selection.selected_task_id, 'T-CHANGES');
    assert.equal(parsed.selection.selected_files.includes('.docpath/tasks/T-CHANGES/spec.md'), true);
    assert.equal(parsed.selection.outside_selected_task_files.includes('.docpath/tasks/T-OTHER/spec.md'), true);
    assert.equal(parsed.selection.outside_selected_task_files.includes('src/mixed.ts'), true);
    assert.match(parsed.selection.outside_selected_task_note, /may not belong to the selected task/);

    const agent = run('changes --agent', cwd);
    assert.match(agent, /selection:/);
    assert.match(agent, /selected_files:/);
    assert.match(agent, /\.docpath\/tasks\/T-CHANGES\/spec\.md/);
    assert.match(agent, /outside_selected_task_files:/);
    assert.match(agent, /src\/mixed\.ts/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('changes --task selects a non-current task for closeout suggestions', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-OTHER'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-OTHER', 'spec.json'), JSON.stringify({
      schema_version: 1,
      kind: 'spec',
      title: 'T-OTHER - 其他任务 closeout',
    }, null, 2));
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-OTHER', 'plan.md'), '# plan\n');

    const parsed = JSON.parse(run('changes --json --task T-OTHER', cwd));

    assert.equal(parsed.current_task.task_id, 'T-CHANGES');
    assert.equal(parsed.selection.mode, 'task');
    assert.equal(parsed.selection.selected_task_id, 'T-OTHER');
    assert.equal(parsed.selection.selected_task_title, '其他任务 closeout');
    assert.equal(parsed.selection.selected_files.includes('.docpath/tasks/T-OTHER/spec.json'), true);
    assert.equal(parsed.selection.selected_files.includes('.docpath/tasks/T-OTHER/plan.md'), true);
    assert.equal(parsed.suggested_commit_message, 'chore: 其他任务 closeout');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('changes --scope limits grouping and stage guidance to explicit files', () => {
    const cwd = mkGitWorkspace();
    mkdirSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-CHANGES', 'spec.md'), '# T-CHANGES - 新增 changes 命令\n');
    writeFileSync(join(cwd, 'README.md'), '# scoped change\n');

    const parsed = JSON.parse(run('changes --json --scope README.md', cwd));

    assert.equal(parsed.selection.mode, 'scope');
    assert.deepEqual(parsed.selection.scope_files, ['README.md']);
    assert.deepEqual(parsed.selection.selected_files, ['README.md']);
    assert.equal(parsed.counts.total, 1);
    assert.deepEqual(parsed.groups.docpath, []);
    assert.deepEqual(parsed.untracked_evidence.files, []);
    assert.equal(parsed.recommended_stage_command, null);
    assert.equal(parsed.ready_to_commit, true);
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

  it('classifies merge-mediated resources as commit-relevant in a real linked git worktree (R-273/R-289)', () => {
    const mainCwd = mkdtempSync(join(tmpdir(), 'dp-changes-wt-'));
    try {
      git(mainCwd, 'init');
      git(mainCwd, 'config user.email test@example.com');
      git(mainCwd, 'config user.name Test');

      // 对齐真实仓库契约：isolated 运行时 gitignored；merge-mediated 资源与派生视图 tracked
      writeFileSync(join(mainCwd, '.gitignore'), '.docpath/workspace/\n.docpath/tasks/current/\n.docpath/journal/\n.worktrees/\n');
      mkdirSync(join(mainCwd, '.docpath', 'backlog'), { recursive: true });
      mkdirSync(join(mainCwd, '.docpath', 'rules'), { recursive: true });
      mkdirSync(join(mainCwd, '.docpath', 'tasks', 'done', 'T-OLD'), { recursive: true });
      writeFileSync(join(mainCwd, '.docpath', 'config.yaml'), 'project:\n  name: changes-wt-test\n');
      writeFileSync(join(mainCwd, '.docpath', 'backlog', 'backlog.md'), '# tracked backlog\n');
      writeFileSync(join(mainCwd, '.docpath', 'rules', 'style.md'), '# tracked style\n');
      writeFileSync(join(mainCwd, '.docpath', 'tasks', 'done', 'T-OLD', 'spec.md'), '# old spec\n');
      writeFileSync(join(mainCwd, '.docpath', 'docs.md'), '# derived docs view\n');
      writeFileSync(join(mainCwd, 'README.md'), '# main\n');
      git(mainCwd, 'add .');
      git(mainCwd, 'commit -m initial');

      // 真实 linked worktree: `.git` 为 gitdir 指针文件
      const wtCwd = join(mainCwd, '.worktrees', 'wt');
      git(mainCwd, `worktree add ${wtCwd} -b wt-branch`);

      // 独立 runtime（gitignored → isolated 契约成立，doctor 契约门禁可过）
      mkdirSync(join(wtCwd, '.docpath', 'workspace'), { recursive: true });
      mkdirSync(join(wtCwd, '.docpath', 'tasks', 'current'), { recursive: true });
      writeFileSync(join(wtCwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        level: 2,
        task_id: 'T-CHANGES',
        task_title: 'worktree changes',
        phase: 'executing',
        gate: 'review_pass',
        current_step: 'S1',
        started_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
      }, null, 2) + '\n');
      writeFileSync(join(wtCwd, '.docpath', 'workspace', 'current.md'), '# current\n');
      writeFileSync(join(wtCwd, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb\n');

      // merge-mediated 变更（应提交并随分支合并回 main）+ 派生视图变更（噪音）
      writeFileSync(join(wtCwd, '.docpath', 'backlog', 'backlog.md'), '# updated backlog\n');
      writeFileSync(join(wtCwd, '.docpath', 'rules', 'style.md'), '# updated style\n');
      writeFileSync(join(wtCwd, '.docpath', 'tasks', 'done', 'T-OLD', 'spec.md'), '# updated old spec\n');
      mkdirSync(join(wtCwd, 'src'), { recursive: true });
      writeFileSync(join(wtCwd, 'src', 'feature.ts'), 'export const feature = true;\n');
      writeFileSync(join(wtCwd, '.docpath', 'docs.md'), '# regenerated docs view\n');

      const parsed = JSON.parse(run('changes --json', wtCwd));
      assert.equal(parsed.worktree_isolation.active, true);
      assert.equal(parsed.worktree_isolation.commit_relevant_files.includes('.docpath/backlog/backlog.md'), true);
      assert.equal(parsed.worktree_isolation.commit_relevant_files.includes('.docpath/rules/style.md'), true);
      assert.equal(parsed.worktree_isolation.commit_relevant_files.includes('.docpath/tasks/done/T-OLD/spec.md'), true);
      assert.equal(parsed.worktree_isolation.commit_relevant_files.includes('src/feature.ts'), true);
      // R-336: docs.md 已下线，不再属于隔离噪音名单（普通 tracked 文件语义）
      assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/docs.md'), false);
      assert.equal(parsed.worktree_isolation.expected_noise_files.includes('.docpath/backlog/backlog.md'), false,
        'merge-mediated backlog 变更绝不能被归类为隔离噪音（R-271 数据丢失模式）');
      // isolated 运行时被 gitignore 隔离，根本不应出现在变更分组里
      const groupedFiles = Object.values(parsed.groups).flat();
      assert.equal(groupedFiles.some((path) => String(path).startsWith('.docpath/workspace/')), false);

      const agent = run('changes --agent', wtCwd);
      assert.match(agent, /worktree_isolation:/);
      // R-336: docs.md 下线后已无 tracked 派生视图；噪音类仅剩 gitignored 隔离运行时（不入 porcelain）
      assert.match(agent, /expected_noise_count: 0/);
      assert.match(agent, /commit_relevant_files:/);
      assert.match(agent, /src\/feature\.ts/);
    } finally {
      rmSync(mainCwd, { recursive: true, force: true });
    }
  });

  it('keeps a single worktree-detection implementation repo-wide (R-289 AC-1)', () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const srcRoot = join(repoRoot, 'src');
    const legacyHits = [];
    const definitionSites = [];
    for (const entry of readdirSync(srcRoot, { recursive: true })) {
      const rel = String(entry);
      if (!rel.endsWith('.ts')) continue;
      const content = readFileSync(join(srcRoot, rel), 'utf-8');
      if (/\bisDocpathWorktree\b/.test(content)) legacyHits.push(rel);
      if (/function isLinkedGitWorktree\b/.test(content)) definitionSites.push(rel);
    }
    assert.deepEqual(legacyHits, [], '旧 symlink 契约判定 isDocpathWorktree 必须归零');
    assert.deepEqual(definitionSites, [join('utils', 'git-dirty-guard.ts')],
      'worktree 判定实现必须唯一且位于 git-dirty-guard.ts');
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
