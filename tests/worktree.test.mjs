import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const WORKTREE_UTIL = pathToFileURL(new URL('../dist/utils/worktree.js', import.meta.url).pathname).href;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function run(args, cwd, { expectFailure = false, env = {} } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 30000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!expectFailure && result.status !== 0) {
    throw new Error(`command failed (${result.status}): docpath ${args.join(' ')}\n${output}`);
  }
  if (expectFailure && result.status === 0) {
    throw new Error(`command unexpectedly succeeded: docpath ${args.join(' ')}\n${output}`);
  }
  return { ...result, output };
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-worktree-'));
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'DocPath Test']);

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-OLD'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'journal'), { recursive: true });

  // Match the real hybrid contract (option C):
  //   backlog        live-shared  (gitignored in main, symlinked in worktrees)
  //   rules          merge-mediated (tracked)
  //   tasks/done     merge-mediated (tracked)
  //   workspace      isolated (gitignored)
  //   tasks/current  isolated (gitignored)
  //   journal        isolated (untracked runtime)
  writeFileSync(join(cwd, '.gitignore'), [
    '/.docpath/workspace/',
    '/.docpath/tasks/current/',
    '/.docpath/backlog',
    '/.worktrees/',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'config.yaml'), 'default_level: 2\n');
  writeFileSync(join(dp, 'backlog', 'backlog.md'), '# Backlog\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'docs.md'), '# Docs Index\n');
  writeFileSync(join(dp, 'docs-index.json'), '{"version":1,"entries":[]}\n');
  writeFileSync(join(dp, 'tasks', 'done', 'T-OLD', 'spec.md'), '# T-OLD - Old task\n');
  writeFileSync(join(dp, 'tasks', 'done', 'T-OLD', 'plan.md'), '## 执行计划\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# breadcrumb\n');
  writeFileSync(join(dp, 'workspace', 'current.md'), '# current\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: '',
    task_title: 'Main repo',
    phase: 'idle',
    gate: 'none',
    current_step: '等待下一步',
    started_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(cwd, 'README.md'), '# Test repo\n');

  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'init']);
  return cwd;
}

// Variant where backlog is tracked (old-style) to exercise the doctor's
// "tracked copy is not live-shared" warning path.
function mkRepoTrackedBacklog() {
  const cwd = mkRepo();
  // Force backlog into git despite the gitignore, then commit.
  git(cwd, ['add', '-f', '.docpath/backlog/backlog.md']);
  git(cwd, ['commit', '-m', 'track backlog']);
  return cwd;
}

describe('worktree command', () => {
  it('creates an isolated DocPath runtime with shared symlinks from a subdirectory', () => {
    const cwd = mkRepo();
    const subdir = join(cwd, 'src', 'nested');
    mkdirSync(subdir, { recursive: true });

    const out = run(['worktree', 'create', 'feature-a'], subdir).output;
    const worktreePath = join(cwd, '.worktrees', 'feature-a');

    assert.match(out, /worktree 已创建/);
    assert.match(out, /docpath worktree doctor feature-a/);
    assert.match(out, /export DOCPATH_SESSION=agent-feature-a/);
    assert.match(out, /DOCPATH_SESSION=<tool>-feature-a/);
    assert.equal(existsSync(worktreePath), true);
    assert.equal(existsSync(join(subdir, '.worktrees')), false, 'must anchor .worktrees at git root');
    assert.equal(
      git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']),
      '',
      'new DocPath worktree must not start with tracked .docpath deletions or runtime modifications',
    );

    const backlogResource = join(worktreePath, '.docpath', 'backlog');
    assert.equal(lstatSync(backlogResource).isSymbolicLink(), true, 'backlog must be a live-shared symlink');
    assert.equal(statSync(backlogResource).isDirectory(), true, 'symlinked backlog must resolve to a directory');
    const rulesResource = join(worktreePath, '.docpath', 'rules');
    assert.equal(lstatSync(rulesResource).isSymbolicLink(), false, 'rules must be a merge-mediated tracked copy, not a symlink');
    assert.equal(lstatSync(rulesResource).isDirectory(), true);
    assert.equal(
      git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all', '--', '.docpath/backlog', '.docpath/rules']),
      '',
      'backlog symlink must be gitignored and rules tracked copy must stay clean',
    );
    assert.equal(
      git(worktreePath, ['ls-files', '--', '.docpath/tasks/current']).trim(),
      '',
      'tasks/current must be untracked (isolated) in the worktree',
    );
    assert.equal(
      git(worktreePath, ['ls-files', '--', '.docpath/tasks/done']).trim().length > 0,
      true,
      'tasks/done must stay tracked (merge-mediated) in the worktree',
    );

    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'state.json')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'current.md')), true);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'workspace', 'breadcrumb.md')), true);

    const next = run(['next', '--agent'], worktreePath).output;
    assert.match(next, /agent_view: next/);

    const list = run(['worktree', 'list'], subdir).output;
    assert.match(list, /feature-a/);
    assert.match(list, /docpath: idle \(no active task\)/);
    assert.match(list, /managed_by_docpath: true/);
    assert.match(list, /dirty: false/);
    assert.match(list, /safe_to_remove: false/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('anchors nested creates from a linked worktree at the main checkout', () => {
    const cwd = mkRepo();
    const parentPath = join(cwd, '.worktrees', 'parent-feature');
    const childPath = join(cwd, '.worktrees', 'child-feature');

    run(['worktree', 'create', 'parent-feature'], cwd);
    const out = run(['worktree', 'create', 'child-feature'], parentPath).output;

    assert.match(out, /worktree 已创建/);
    assert.equal(existsSync(childPath), true);
    assert.equal(
      existsSync(join(parentPath, '.worktrees', 'child-feature')),
      false,
      'linked worktree create must not nest .worktrees under the invoking worktree',
    );
    assert.equal(
      git(childPath, ['status', '--porcelain=v1', '--untracked-files=all']),
      '',
      'nested-created DocPath worktree must start clean',
    );

    const list = run(['worktree', 'list'], parentPath).output;
    assert.match(list, new RegExp(`${cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(main\\)`));
    assert.doesNotMatch(list, new RegExp(`${parentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(main\\)`));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('doctors worktree readiness without mutating files', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-doctor');
    run(['worktree', 'create', 'feature-doctor'], cwd);
    const before = git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);

    const named = run(['worktree', 'doctor', 'feature-doctor'], cwd, { env: { DOCPATH_SESSION: '' } }).output;
    assert.match(named, /Worktree doctor: feature-doctor/);
    assert.match(named, /live-shared backlog: symlink/);
    assert.match(named, /merge-mediated rules: tracked copy/);
    assert.match(named, /isolated tasks\/current: .*isolated/);
    assert.match(named, /set DOCPATH_SESSION=agent-feature-doctor/);
    assert.match(named, /branch_has_unique_commits: false/);
    assert.match(named, /branch_unique_commits: 0/);
    assert.match(named, /worktree doctor passed/);

    const current = run(['worktree', 'doctor'], worktreePath, { env: { DOCPATH_SESSION: '' } }).output;
    assert.match(current, /Worktree doctor: feature-doctor/);
    assert.match(current, /managed_by_docpath: true/);
    assert.match(current, /safe_to_remove: false/);
    assert.match(current, /worktree doctor passed/);

    const after = git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);
    assert.equal(after, before);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('forces live-shared backlog symlink even when main tracks backlog', () => {
    const cwd = mkRepoTrackedBacklog();
    const worktreePath = join(cwd, '.worktrees', 'feature-live-backlog');
    const createOut = run(['worktree', 'create', 'feature-live-backlog'], cwd).output;
    assert.match(createOut, /backlog -> 主仓库 \(live-shared\)/);
    assert.equal(lstatSync(join(worktreePath, '.docpath', 'backlog')).isSymbolicLink(), true);
    const out = run(['worktree', 'doctor', 'feature-live-backlog'], cwd, { env: { DOCPATH_SESSION: 'codex-feature-live-backlog' } }).output;
    assert.match(out, /✅ live-shared backlog: symlink/);
    // rules stays merge-mediated (tracked copy is the expected design, no warning).
    assert.match(out, /✅.*merge-mediated rules: tracked copy/);
    assert.match(out, /worktree doctor passed/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails doctor when backlog is a directory copy instead of live-shared symlink', () => {
    const cwd = mkRepoTrackedBacklog();
    const worktreePath = join(cwd, '.worktrees', 'feature-stale-copy');
    run(['worktree', 'create', 'feature-stale-copy'], cwd);
    // Break live-share: replace symlink with a plain directory copy
    const backlogLink = join(worktreePath, '.docpath', 'backlog');
    rmSync(backlogLink, { recursive: true, force: true });
    mkdirSync(backlogLink, { recursive: true });
    writeFileSync(join(backlogLink, 'R-STALE.md'), '---\nid: R-STALE\n---\n');
    const out = run(['worktree', 'doctor', 'feature-stale-copy'], cwd, {
      expectFailure: true,
      env: { DOCPATH_SESSION: 'codex-feature-stale-copy' },
    }).output;
    assert.match(out, /❌ live-shared backlog: tracked copy \(not live-shared\)/);
    assert.match(out, /worktree doctor failed/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates a worktree with target backlog context and agent-neutral session guidance', () => {
    const cwd = mkRepoTrackedBacklog();
    const backlogDir = join(cwd, '.docpath', 'backlog');
    writeFileSync(join(backlogDir, 'R-321.md'), `---
id: R-321
title: Target backlog
status: proposed
priority: P2
level: 1
readiness: confirmed
created_at: 2026-07-15
---

## 背景

Target backlog body
`);
    writeFileSync(join(backlogDir, 'backlog.md'), [
      '# DocPath Backlog Index',
      '',
      '| id | title | status | priority | level | task |',
      '|----|-------|--------|----------|-------|------|',
      '| R-321 | Target backlog | proposed | P2 | 1 |  |',
      '',
    ].join('\n'));

    const out = run(['worktree', 'create', 'targeted-feature', '--backlog', 'R-321'], cwd).output;
    const worktreePath = join(cwd, '.worktrees', 'targeted-feature');

    assert.match(out, /目标 backlog: R-321/);
    assert.match(out, /目标 backlog 上下文已通过 live-shared backlog 可见: R-321/);
    assert.match(out, /export DOCPATH_SESSION=agent-targeted-feature/);
    assert.match(out, /DOCPATH_SESSION=<tool>-R-321-targeted-feature/);
    assert.match(out, /docpath backlog accept R-321/);
    assert.equal(existsSync(join(worktreePath, '.docpath', 'backlog', 'R-321.md')), true);
    assert.match(readFileSync(join(worktreePath, '.docpath', 'backlog', 'backlog.md'), 'utf-8'), /R-321/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects unsafe names before invoking git', () => {
    const cwd = mkRepo();
    for (const name of ['../escape', join(cwd, 'escape'), 'bad/name', 'feature;touch-pwn']) {
      const result = run(['worktree', 'create', name], cwd, { expectFailure: true });
      assert.match(result.output, /非法 worktree 名称|worktree 名称/);
    }
    assert.equal(existsSync(join(cwd, '.worktrees')), false);
    assert.equal(existsSync(join(cwd, 'pwn')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('remove refuses dirty worktrees unless --force is provided', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'dirty-feature');

    run(['worktree', 'create', 'dirty-feature'], cwd);
    writeFileSync(join(worktreePath, 'dirty.txt'), 'uncommitted\n');

    const failed = run(['worktree', 'remove', 'dirty-feature'], cwd, { expectFailure: true });
    assert.match(failed.output, /删除 worktree 失败/);
    assert.equal(existsSync(worktreePath), true);

    run(['worktree', 'remove', 'dirty-feature', '--force'], cwd);
    assert.equal(existsSync(worktreePath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects git worktrees under ESM', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'esm-feature');
    run(['worktree', 'create', 'esm-feature'], cwd);

    const out = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { isInWorktree } from ${JSON.stringify(WORKTREE_UTIL)}; console.log(isInWorktree(process.argv[1]));`,
      worktreePath,
    ], { encoding: 'utf-8' }).trim();

    assert.equal(out, 'true');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('remove deletes the associated local branch', () => {
    const cwd = mkRepo();
    run(['worktree', 'create', 'branch-feature'], cwd);
    
    // Check branch exists in git
    const branchesBefore = git(cwd, ['branch']).trim();
    assert.match(branchesBefore, /branch-feature/);
    
    // Remove worktree
    run(['worktree', 'remove', 'branch-feature'], cwd);
    
    // Check branch is deleted
    const branchesAfter = git(cwd, ['branch']).trim();
    assert.doesNotMatch(branchesAfter, /branch-feature/);
    
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prune removes completed, merged, and clean worktrees but skips others', () => {
    const cwd = mkRepo();
    
    // 1. Create a worktree that will be completed and merged (prunable)
    run(['worktree', 'create', 'prune-a'], cwd);
    const wtPathA = join(cwd, '.worktrees', 'prune-a');
    writeFileSync(join(wtPathA, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-PRUNE-A',
      phase: 'completed',
    }));

    // 2. Create a worktree that is not completed (should be skipped)
    run(['worktree', 'create', 'prune-b'], cwd);
    const wtPathB = join(cwd, '.worktrees', 'prune-b');
    writeFileSync(join(wtPathB, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-PRUNE-B',
      phase: 'executing',
    }));

    // 3. Create a worktree that is completed but dirty (should be skipped)
    run(['worktree', 'create', 'prune-c'], cwd);
    const wtPathC = join(cwd, '.worktrees', 'prune-c');
    writeFileSync(join(wtPathC, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      task_id: 'T-PRUNE-C',
      phase: 'completed',
    }));
    writeFileSync(join(wtPathC, 'dirty.txt'), 'uncommitted\n');

    // Run prune from main repo
    const out = run(['worktree', 'prune'], cwd).output;
    
    assert.match(out, /清理 worktree: prune-a/);
    assert.match(out, /跳过 worktree: prune-b/);
    assert.match(out, /跳过 worktree: prune-c/);
    
    assert.equal(existsSync(wtPathA), false, 'pruned worktree should be removed');
    assert.equal(existsSync(wtPathB), true, 'skipped uncompleted worktree should remain');
    assert.equal(existsSync(wtPathC), true, 'skipped dirty worktree should remain');
    
    rmSync(cwd, { recursive: true, force: true });
  });

  it('strictly gates operational commands on doctor failure', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-gate');
    run(['worktree', 'create', 'feature-gate'], cwd);

    // Make the doctor fail by tracking tasks/current in git
    const docpathDir = join(worktreePath, '.docpath');
    const tasksCurrent = join(docpathDir, 'tasks', 'current');
    mkdirSync(tasksCurrent, { recursive: true });
    writeFileSync(join(tasksCurrent, 'spec.md'), '# T-GATE\n');
    git(worktreePath, ['add', '-f', '.docpath/tasks/current/spec.md']);
    // Verify it fails doctor
    const doctorOut = run(['worktree', 'doctor', 'feature-gate'], cwd, { expectFailure: true }).output;
    assert.match(doctorOut, /❌  worktree doctor failed/);

    // Verify operational commands block on doctor failure in worktreePath
    const changesRes = run(['changes'], worktreePath, { expectFailure: true });
    assert.match(changesRes.output, /Git Worktree contract validation failed/);

    const goRes = run(['go', '--step', 'S1'], worktreePath, { expectFailure: true });
    assert.match(goRes.output, /Git Worktree contract validation failed/);

    const enterRes = run(['agent', 'enter'], worktreePath, { expectFailure: true });
    assert.match(enterRes.output, /Git Worktree contract validation failed/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('scans and blocks backlog promote when active in another worktree', () => {
    const cwd = mkRepo();
    
    // Create backlog R-238
    const backlogDir = join(cwd, '.docpath', 'backlog');
    mkdirSync(backlogDir, { recursive: true });
    writeFileSync(join(backlogDir, 'R-238.md'), `---
id: R-238
title: Test backlog
status: accepted
priority: P0
readiness: analyzed
created_at: 2026-06-30
---
Test backlog description`);
    run(['backlog', 'refresh'], cwd);

    // Create a worktree feature-lease
    run(['worktree', 'create', 'feature-lease'], cwd);
    const wtPath = join(cwd, '.worktrees', 'feature-lease');
    
    // Simulate that R-238 is active in feature-lease by writing state.json
    const stateJsonPath = join(wtPath, '.docpath', 'workspace', 'state.json');
    writeFileSync(stateJsonPath, JSON.stringify({
      task_id: 'T-238',
      backlog_id: 'R-238',
      phase: 'executing',
    }));

    // Trying to promote R-238 in main repo must fail due to active lease in feature-lease worktree
    const promoteRes = run(['backlog', 'promote', 'R-238'], cwd, { expectFailure: true });
    assert.match(promoteRes.output, /已经在另一个工作区 'feature-lease' 中处于活跃状态，禁止重复 promote/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('automatically repairs contract drifts via worktree repair', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-repair');
    run(['worktree', 'create', 'feature-repair'], cwd);

    const docpathDir = join(worktreePath, '.docpath');
    const tasksCurrent = join(docpathDir, 'tasks', 'current');
    mkdirSync(tasksCurrent, { recursive: true });
    writeFileSync(join(tasksCurrent, 'spec.md'), '# T-REPAIR\n');
    
    // 1. Simulate drift A: track isolated tasks/current in git
    git(worktreePath, ['add', '-f', '.docpath/tasks/current/spec.md']);
    
    // 2. Simulate drift B: put backlog ignore pattern into .gitignore
    const gitignorePath = join(worktreePath, '.gitignore');
    writeFileSync(gitignorePath, '/.docpath/backlog\n');

    // Run repair
    const repairOut = run(['worktree', 'repair', 'feature-repair'], cwd).output;
    assert.match(repairOut, /成功从 git 暂存区移除: \.docpath\/tasks\/current/);
    assert.match(repairOut, /移除了 backlog 排除规则/);
    assert.match(repairOut, /worktree 契约修复成功/);

    // Verify it is now untracked (isolated)
    const tracked = git(worktreePath, ['ls-files', '--', '.docpath/tasks/current']).trim().length > 0;
    assert.equal(tracked, false, 'tasks/current should be untracked after repair');

    // Verify backlog pattern is gone from .gitignore
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    assert.equal(gitignoreContent.includes('/.docpath/backlog'), false, 'gitignore should be updated');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects worktree merge if not in a worktree', () => {
    const cwd = mkRepo();
    const res = run(['worktree', 'merge'], cwd, { expectFailure: true });
    assert.match(res.output, /worktree merge 必须在 git worktree 中运行/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('performs sync merge and commits dirty files when phase is not completed', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-merge-sync');
    run(['worktree', 'create', 'feature-merge-sync'], cwd);

    // Set phase to executing in state.json
    const stateJsonPath = join(worktreePath, '.docpath', 'workspace', 'state.json');
    writeFileSync(stateJsonPath, JSON.stringify({
      task_id: 'T-TEST',
      backlog_id: 'R-TEST',
      phase: 'executing',
    }));

    // Create a commit on main branch
    writeFileSync(join(cwd, 'upstream.txt'), 'upstream content\n');
    git(cwd, ['add', 'upstream.txt']);
    git(cwd, ['commit', '-m', 'add upstream file']);

    // Make some dirty changes in worktree
    writeFileSync(join(worktreePath, 'dirty.txt'), 'dirty content\n');

    // Run merge (defaults to merging main)
    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const mergeOut = run(['worktree', 'merge', activeBranch], worktreePath).output;
    assert.match(mergeOut, /=== worktree-merge 启动 ===/);
    assert.match(mergeOut, /检测到未提交的残余文件，正在自动 commit/);
    assert.match(mergeOut, /正在合并目标分支/);
    assert.match(mergeOut, /当前任务 phase=executing/);
    assert.match(mergeOut, /已将 .* 成功合并至当前开发分支，保持开发分支同步更新/);

    // Verify upstream file is present in worktree
    assert.equal(existsSync(join(worktreePath, 'upstream.txt')), true);
    // Verify dirty file is committed
    const status = git(worktreePath, ['status', '--porcelain=v1']);
    assert.equal(status, '');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('performs full closeout merge back to target branch when phase is completed', () => {
    const cwd = mkRepo();
    const worktreePath = join(cwd, '.worktrees', 'feature-merge-closeout');
    run(['worktree', 'create', 'feature-merge-closeout'], cwd);

    // Set phase to completed in state.json
    const stateJsonPath = join(worktreePath, '.docpath', 'workspace', 'state.json');
    writeFileSync(stateJsonPath, JSON.stringify({
      task_id: 'T-TEST',
      backlog_id: 'R-TEST',
      phase: 'completed',
    }));

    // Make some dirty changes in worktree so it creates a commit
    writeFileSync(join(worktreePath, 'dirty.txt'), 'closeout changes\n');

    // Run merge
    const activeBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    // Configure target branch env
    const env = { CODE_MERGE_TARGET: activeBranch };
    const mergeOut = run(['worktree', 'merge', activeBranch], worktreePath, { env }).output;
    assert.match(mergeOut, /任务已标记为 completed，开始将分支合回/);
    assert.match(mergeOut, /切换主仓分支到/);
    assert.match(mergeOut, /在主仓合并分支/);
    assert.match(mergeOut, /worktree-merge 完成/);

    // Verify worktree branch is merged into main (target) branch
    git(cwd, ['checkout', activeBranch]);
    const log = git(cwd, ['log', '-2', '--oneline']);
    assert.match(log, /Merge branch 'feature-merge-closeout'/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
