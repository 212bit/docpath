/**
 * docpath worktree — Git Worktree 管理
 *
 * 支持真并发开发：多个 Agent 在独立 worktrees 中开发不同 feature。
 */

import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BREADCRUMB_HEADER } from '../engine/breadcrumb.js';
import { mutateCurrentState, readCurrentState } from '../utils/workspace.js';
import {
  isGitRepo,
  listWorktrees,
  getGitTopLevel,
  createSymlink,
  isInWorktree,
} from '../utils/worktree.js';

const execFileAsync = promisify(execFile);

interface WorktreeOptions {
  cwd: string;
  action?: 'create' | 'list' | 'remove' | 'doctor' | 'prune' | 'repair' | 'merge';
  name?: string;
  force?: boolean;
  backlog?: string;
}

interface WorktreePaths {
  repoRoot: string;
  safeName: string;
  worktreesDir: string;
  worktreePath: string;
}

interface WorktreeDiagnostics {
  managed: boolean;
  dirty: boolean;
  completed: boolean;
  mergedToMain: boolean;
  branchHasUniqueCommits: boolean;
  branchUniqueCommits: number;
  safeToRemove: boolean;
  cleanupCommand: string | null;
}

function validateWorktreeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('worktree 名称不能为空');
  }
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    isAbsolute(trimmed) ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(trimmed)
  ) {
    throw new Error(
      `非法 worktree 名称: ${name}。允许字母、数字、点、下划线和短横线，` +
      '必须以字母或数字开头，且不能包含路径分隔符或 shell 元字符。',
    );
  }
  return trimmed;
}

function assertInside(parent: string, child: string): void {
  const rel = relative(parent, child);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`worktree 路径必须位于 ${parent} 下: ${child}`);
  }
}

function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

function recommendedSessionName(name: string): string {
  return `agent-${name}`;
}

function toolSessionPattern(name: string, backlogId?: string): string {
  return backlogId
    ? `<tool>-${backlogId}-${name}`
    : `<tool>-${name}`;
}

function validateBacklogId(id: string): string {
  const trimmed = id.trim().toUpperCase();
  if (!/^R-\d+$/.test(trimmed)) {
    throw new Error(`非法 backlog id: ${id}。格式应为 R-123。`);
  }
  return trimmed;
}

export async function resolveWorktreePaths(cwd: string, name: string): Promise<WorktreePaths> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const safeName = validateWorktreeName(name);
  const worktreesDir = join(repoRoot, '.worktrees');
  const worktreePath = resolve(worktreesDir, safeName);
  assertInside(worktreesDir, worktreePath);
  return { repoRoot, safeName, worktreesDir, worktreePath };
}

async function resolveWorktreeManagerRoot(cwd: string): Promise<string> {
  const currentRoot = await getGitTopLevel(cwd);
  const worktrees = await listWorktrees(currentRoot);

  const primary = worktrees.find((wt) => {
    if (wt.bare) return false;
    try {
      return lstatSync(join(wt.path, '.git')).isDirectory();
    } catch {
      return false;
    }
  });

  return primary?.path || currentRoot;
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    const output = typeof error === 'object' && error
      ? [
        'stdout' in error ? String((error as { stdout?: unknown }).stdout || '') : '',
        'stderr' in error ? String((error as { stderr?: unknown }).stderr || '') : '',
      ].filter(Boolean).join('\n')
      : '';
    throw new Error(output.trim() || (error instanceof Error ? error.message : String(error)));
  }
}

async function runGitCapture(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trimEnd();
}

async function hasTrackedFiles(repoRoot: string, path: string): Promise<boolean> {
  const { stdout } = await execFileAsync('git', ['ls-files', '--', path], { cwd: repoRoot });
  return stdout.trim().length > 0;
}

async function isTrackedDocPath(repoRoot: string, item: string): Promise<boolean> {
  return hasTrackedFiles(repoRoot, `.docpath/${item}`);
}

/**
 * worktree create <name> — 创建新 worktree
 */
async function worktreeCreate(cwd: string, name: string, backlogId?: string): Promise<void> {
  // 1. 检查是否为 git 仓库
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { repoRoot, safeName, worktreesDir, worktreePath } = await resolveWorktreePaths(cwd, name);
  const targetBacklogId = backlogId ? validateBacklogId(backlogId) : null;

  // 2. 检查 worktree 是否已存在
  const worktrees = await listWorktrees(repoRoot);
  if (worktrees.some((wt) => samePath(wt.path, worktreePath))) {
    console.error(`❌  worktree 已存在: ${safeName}`);
    process.exit(1);
  }

  // 3. 创建 .worktrees 目录
  if (!existsSync(worktreesDir)) {
    await mkdir(worktreesDir, { recursive: true });
  }

  console.log(`\n🌳  创建 worktree: ${safeName}\n`);
  if (targetBacklogId) {
    console.log(`🎯  目标 backlog: ${targetBacklogId}\n`);
  }

  // 4. 调用 git worktree add
  try {
    await runGit(repoRoot, ['worktree', 'add', '-b', safeName, relative(repoRoot, worktreePath)]);
  } catch (error) {
    console.error(`❌  创建 worktree 失败`);
    if (error instanceof Error && error.message) console.error(error.message);
    process.exit(1);
  }

  // 5. 初始化 .docpath/ 并创建 symlinks
  console.log(`\n📁  配置 .docpath/ 目录...\n`);
  await initWorktreeDocpath(repoRoot, worktreePath, safeName);
  if (targetBacklogId) {
    await copyTargetBacklogContext(repoRoot, worktreePath, targetBacklogId);
  }

  // 5.1 自动软链接 node_modules 以复用依赖与构建缓存
  const mainNodeModules = join(repoRoot, 'node_modules');
  if (existsSync(mainNodeModules)) {
    console.log('  🔗 配置 node_modules 共享软链接...');
    await createSymlink(mainNodeModules, join(worktreePath, 'node_modules'), 'dir');
    console.log('    ✓ node_modules -> shared parent copy');
  }

  console.log(`\n✅  worktree 已创建: ${worktreePath}`);
  console.log(`\n从主仓库检查:`);
  console.log(`  docpath worktree doctor ${safeName}`);
  console.log(`\n进入 worktree 后:`);
  console.log(`  cd ${relative(repoRoot, worktreePath)}`);
  console.log(`  export DOCPATH_SESSION=${recommendedSessionName(safeName)}`);
  console.log(`  # tool-specific: export DOCPATH_SESSION=${toolSessionPattern(safeName, targetBacklogId || undefined)}`);
  console.log(`  docpath worktree doctor`);
  console.log(`  ${targetBacklogId ? `docpath backlog accept ${targetBacklogId}` : 'docpath next --agent'}`);
}

async function copyTargetBacklogContext(repoRoot: string, worktreePath: string, backlogId: string): Promise<void> {
  const mainBacklogDir = join(repoRoot, '.docpath', 'backlog');
  const worktreeBacklogDir = join(worktreePath, '.docpath', 'backlog');
  const sourceItem = join(mainBacklogDir, `${backlogId}.md`);
  const targetItem = join(worktreeBacklogDir, `${backlogId}.md`);
  const sourceIndex = join(mainBacklogDir, 'backlog.md');
  const targetIndex = join(worktreeBacklogDir, 'backlog.md');

  if (!existsSync(sourceItem)) {
    console.warn(`  ⚠️  未找到目标 backlog 文件: ${sourceItem}`);
    console.warn(`     worktree 已创建，但需要先在主仓库确认 ${backlogId} 存在。`);
    return;
  }

  await mkdir(worktreeBacklogDir, { recursive: true });
  if (existsSync(worktreeBacklogDir) && lstatSync(worktreeBacklogDir).isSymbolicLink()) {
    console.log(`  🎯 目标 backlog 上下文已通过 live-shared backlog 可见: ${backlogId}`);
    return;
  }
  if (!samePath(sourceItem, targetItem)) {
    await cp(sourceItem, targetItem);
  }
  if (existsSync(sourceIndex) && !samePath(sourceIndex, targetIndex)) {
    await cp(sourceIndex, targetIndex);
  }
  console.log(`  🎯 已同步目标 backlog 上下文: ${backlogId}`);
}

/**
 * 初始化 worktree 的 .docpath/ 目录
 *
 * 问题：git worktree add 会把 .docpath/ 整个复制过来（因为在 git 中）
 * 解决：清理复制的内容，重建正确的隔离/共享结构
 */
async function initWorktreeDocpath(mainRepoPath: string, worktreePath: string, name: string): Promise<void> {
  const docpathDir = join(worktreePath, '.docpath');

  console.log(`  🧹 清理 git 复制的 .docpath/ 内容...`);
  await mkdir(docpathDir, { recursive: true });

  // 清理需要隔离的目录（git 复制过来的）。如果路径已被 Git 追踪，不能删除或
  // 重写，否则新 worktree 会立即出现大量 deleted/modified 噪声。
  const toClean = ['workspace', 'tasks', 'journal', 'docs.md', 'docs-index.json'];
  const trackedItems = new Set<string>();
  for (const item of toClean) {
    if (await isTrackedDocPath(mainRepoPath, item)) {
      trackedItems.add(item);
      console.log(`    ↷ 保留 tracked ${item}`);
      continue;
    }
    const itemPath = join(docpathDir, item);
    if (existsSync(itemPath)) {
      await rm(itemPath, { recursive: true, force: true });
      console.log(`    ✓ 删除复制的 ${item}`);
    }
  }

  // 创建独立目录
  console.log(`  📁 创建独立目录...`);
  const isolatedDirs = ['workspace', 'tasks', 'journal'];
  for (const dir of isolatedDirs) {
    if (trackedItems.has(dir)) {
      console.log(`    ↷ ${dir}/ tracked copy`);
      continue;
    }
    const dirPath = join(docpathDir, dir);
    await mkdir(dirPath, { recursive: true });
    console.log(`    ✓ ${dir}/`);
  }

  // 创建 workspace 子目录
  if (!trackedItems.has('workspace')) {
    const workspaceDirs = ['sessions', 'leases', 'commands', 'bin'];
    for (const dir of workspaceDirs) {
      const dirPath = join(docpathDir, 'workspace', dir);
      await mkdir(dirPath, { recursive: true });
    }
  }

  // 共享资源策略：Git 已跟踪的目录不能替换为 symlink，否则 worktree 把目录内
  // tracked 文件全部显示为删除，add -A + merge 会把 main 的该目录删成悬空 symlink。
  // backlog 契约 = R-238 Option B（merge-mediated tracked 副本，R-273 裁定）：
  // 曾两度翻向 live-shared symlink（option C S1、R-271），均已回滚，勿再引入。
  console.log(`  🔗 配置共享资源...`);
  const sharedResources = ['backlog', 'rules', 'spec', 'templates'];
  for (const resource of sharedResources) {
    const targetPath = join(mainRepoPath, '.docpath', resource);
    const linkPath = join(docpathDir, resource);
    const tracked = await hasTrackedFiles(mainRepoPath, `.docpath/${resource}`);

    if (tracked) {
      if (!existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
        await rm(linkPath, { recursive: true, force: true });
        if (existsSync(targetPath)) {
          await cp(targetPath, linkPath, { recursive: true });
        } else {
          await mkdir(linkPath, { recursive: true });
        }
      }
      console.log(`    ✓ ${resource} -> tracked copy`);
      continue;
    }

    if (existsSync(targetPath)) {
      if (existsSync(linkPath)) {
        await rm(linkPath, { recursive: true, force: true });
      }
      const relativePath = relative(dirname(linkPath), targetPath);
      await createSymlink(relativePath, linkPath, 'dir');
      console.log(`    ✓ ${resource} -> 主仓库`);
    }
  }

  if (trackedItems.has('workspace')) {
    console.log(`  ↷ 保留 tracked workspace runtime，避免创建即产生 Git 噪声`);
  } else {
    console.log(`  🧭 写入独立 runtime 初始状态...`);
    const mainState = await readCurrentState(mainRepoPath);
    const now = new Date().toISOString();
    await mutateCurrentState(worktreePath, () => ({
      level: mainState?.level || 2,
      workflow_profile: 'standard',
      state: 'idle',
      task_id: '',
      task_title: `Worktree ${name}`,
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: now,
      updated_at: now,
    }));
    await writeFile(join(docpathDir, 'workspace', 'breadcrumb.md'), BREADCRUMB_HEADER, 'utf-8');
  }

  console.log(`  ✅ .docpath/ 配置完成`);
}

/**
 * worktree list — 列出所有 worktrees
 */
async function worktreeList(cwd: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);

  if (worktrees.length === 0) {
    console.log('📭  没有 worktrees');
    return;
  }

  console.log('\n🌳  Worktrees:\n');
  const worktreesDir = join(repoRoot, '.worktrees');
  for (const wt of worktrees) {
    const isBare = wt.bare ? ' (bare)' : '';
    const branch = wt.detached ? `detached at ${wt.head.substring(0, 7)}` : wt.branch;
    const isMain = samePath(wt.path, repoRoot);
    const label = isMain ? '(main)' : '';
    const safeName = worktreeNameFromPath(worktreesDir, wt.path);

    console.log(`  • ${wt.path} ${label}`);
    console.log(`    branch: ${branch}${isBare}`);

    // 显示 DocPath 状态
    const stateInfo = await getWorktreeState(wt.path);
    if (stateInfo) {
      console.log(`    docpath: ${stateInfo}`);
    }
    const diagnostics = await getWorktreeDiagnostics(repoRoot, wt.path, safeName, isMain);
    console.log(`    managed_by_docpath: ${diagnostics.managed}`);
    console.log(`    dirty: ${diagnostics.dirty}`);
    console.log(`    completed: ${diagnostics.completed}`);
    console.log(`    merged_to_main: ${diagnostics.mergedToMain}`);
    console.log(`    branch_has_unique_commits: ${diagnostics.branchHasUniqueCommits}`);
    console.log(`    branch_unique_commits: ${diagnostics.branchUniqueCommits}`);
    console.log(`    safe_to_remove: ${diagnostics.safeToRemove}`);
    if (diagnostics.cleanupCommand) {
      console.log(`    cleanup: ${diagnostics.cleanupCommand}`);
    } else if (!isMain && diagnostics.completed && diagnostics.dirty) {
      console.log(`    cleanup: commit/stash changes, then run docpath worktree remove ${safeName}`);
    } else if (!isMain && diagnostics.completed && !diagnostics.mergedToMain) {
      console.log(`    cleanup: merge or intentionally discard ${safeName} before removal`);
    } else if (!isMain && !diagnostics.managed) {
      console.log(`    repair: recreate with docpath worktree create ${safeName}, or remove the ordinary git worktree manually`);
    }
  }
  console.log('');
}

/**
 * 获取 worktree 的 DocPath 状态
 */
async function getWorktreeState(worktreePath: string): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const stateJsonPath = join(worktreePath, '.docpath', 'workspace', 'state.json');

    if (!existsSync(stateJsonPath)) {
      return 'idle (no active task)';
    }

    const content = await readFile(stateJsonPath, 'utf-8');
    const state = JSON.parse(content) as { task_id?: string; phase?: string };

    if (!state.task_id) {
      return 'idle (no active task)';
    }

    return `${state.task_id} (${state.phase || 'unknown'})`;
  } catch {
    return null;
  }
}

function worktreeNameFromPath(worktreesDir: string, wtPath: string): string {
  const rel = relative(worktreesDir, wtPath);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return rel.split(/[\\/]/)[0] || wtPath.split(/[\\/]/).filter(Boolean).at(-1) || 'current';
  }
  return wtPath.split(/[\\/]/).filter(Boolean).at(-1) || 'current';
}

async function getWorktreeDiagnostics(
  repoRoot: string,
  wtPath: string,
  safeName: string,
  isMain: boolean,
): Promise<WorktreeDiagnostics> {
  const docpathDir = join(wtPath, '.docpath');
  const managed = existsSync(join(docpathDir, 'workspace'))
    && existsSync(join(docpathDir, 'tasks'))
    && existsSync(join(docpathDir, 'journal'));
  const dirty = (await runGitCapture(wtPath, ['status', '--porcelain=v1', '--untracked-files=all'])).trim().length > 0;

  let completed = false;
  try {
    const state = await readCurrentState(wtPath);
    completed = state?.phase === 'completed';
  } catch {
    completed = false;
  }

  let mergedToMain = isMain;
  let branchUniqueCommits = 0;
  if (!isMain) {
    try {
      const head = (await runGitCapture(wtPath, ['rev-parse', 'HEAD'])).trim();
      await execFileAsync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], { cwd: repoRoot });
      mergedToMain = true;
    } catch {
      mergedToMain = false;
    }
    try {
      const mainHead = (await runGitCapture(repoRoot, ['rev-parse', 'HEAD'])).trim();
      branchUniqueCommits = Number((await runGitCapture(wtPath, ['rev-list', '--count', 'HEAD', '--not', mainHead])).trim());
    } catch {
      branchUniqueCommits = 0;
    }
  }

  const safeToRemove = !isMain && managed && completed && mergedToMain && !dirty;
  return {
    managed,
    dirty,
    completed,
    mergedToMain,
    branchHasUniqueCommits: branchUniqueCommits > 0,
    branchUniqueCommits,
    safeToRemove,
    cleanupCommand: safeToRemove ? `docpath worktree remove ${safeName}` : null,
  };
}

type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  status: DoctorStatus;
  label: string;
  detail: string;
}

function checkExists(path: string, label: string): DoctorCheck {
  return existsSync(path)
    ? { status: 'pass', label, detail: path }
    : { status: 'fail', label, detail: `missing: ${path}` };
}

function checkDirectory(path: string, label: string): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) return { status: 'pass', label, detail: path };
    return { status: 'fail', label, detail: `not a directory: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

function checkBacklogContract(path: string, label: string, tracked: boolean): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      // Tracked backlog must be a merge-mediated copy (R-238 Option B / R-273)：
      // symlink over tracked files is the R-271 residue that deletes main's
      // backlog on merge — fail loud and route to repair.
      if (tracked) {
        return { status: 'fail', label, detail: `symlink over tracked backlog (R-271 残留, 合并会删 main backlog): run docpath worktree repair — ${path}` };
      }
      return { status: 'pass', label, detail: `symlink (untracked backlog, live-shared): ${path}` };
    }
    if (stat.isDirectory()) return { status: 'pass', label, detail: `tracked copy (merge-mediated): ${path}` };
    return { status: 'fail', label, detail: `not a directory or symlink: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

function checkMergeMediated(path: string, label: string): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    // Merge-mediated resources are tracked copies shared via branch merges;
    // a symlink (live-shared) is also acceptable.
    if (stat.isSymbolicLink()) return { status: 'pass', label, detail: `symlink: ${path}` };
    if (stat.isDirectory()) return { status: 'pass', label, detail: `tracked copy (merge-mediated): ${path}` };
    return { status: 'fail', label, detail: `not a directory or symlink: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkIsolatedTasks(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const tasksCurrent = join(docpathDir, 'tasks', 'current');
  // The isolation contract for tasks/current is "not tracked by git": each
  // worktree then owns its own current-task runtime without merge conflicts.
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/tasks/current'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `tasks/current untracked (isolated): ${tasksCurrent}` };
  return { status: 'fail', label, detail: `tasks/current tracked (not isolated): ${tasksCurrent}` };
}

async function checkIsolatedWorkspace(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const workspaceDir = join(docpathDir, 'workspace');
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/workspace'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `workspace untracked (isolated): ${workspaceDir}` };
  return { status: 'fail', label, detail: `workspace tracked (not isolated): ${workspaceDir}` };
}

async function checkIsolatedJournal(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const journalDir = join(docpathDir, 'journal');
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/journal'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `journal untracked (isolated): ${journalDir}` };
  return { status: 'fail', label, detail: `journal tracked (not isolated): ${journalDir}` };
}

async function resolveDoctorTarget(cwd: string, name?: string): Promise<{ safeName: string; worktreePath: string }> {
  const repoRoot = await getGitTopLevel(cwd);
  if (!name) {
    return {
      safeName: repoRoot.split(/[\\/]/).filter(Boolean).at(-1) || 'current',
      worktreePath: repoRoot,
    };
  }

  const paths = await resolveWorktreePaths(cwd, name);
  const worktrees = await listWorktrees(paths.repoRoot);
  if (!worktrees.some((wt) => samePath(wt.path, paths.worktreePath))) {
    throw new Error(`worktree 不存在: ${paths.safeName}`);
  }
  return {
    safeName: paths.safeName,
    worktreePath: paths.worktreePath,
  };
}


export async function getWorktreeDoctorStatus(cwd: string, name?: string): Promise<{
  errors: number;
  warnings: number;
  checks: DoctorCheck[];
  safeName: string;
  worktreePath: string;
}> {
  const { safeName, worktreePath } = await resolveDoctorTarget(cwd, name);
  const docpathDir = join(worktreePath, '.docpath');
  const tasksCurrentCheck = await checkIsolatedTasks(docpathDir, worktreePath, 'isolated tasks/current');
  const workspaceCheck = await checkIsolatedWorkspace(docpathDir, worktreePath, 'isolated workspace directory');
  const journalCheck = await checkIsolatedJournal(docpathDir, worktreePath, 'isolated journal directory');

  const mainRepoRoot = await resolveWorktreeManagerRoot(worktreePath);
  const backlogTracked = await hasTrackedFiles(mainRepoRoot, '.docpath/backlog');

  const checks: DoctorCheck[] = [
    checkExists(join(worktreePath, '.git'), 'git worktree metadata'),
    checkDirectory(docpathDir, '.docpath directory'),
    checkBacklogContract(join(docpathDir, 'backlog'), 'merge-mediated backlog', backlogTracked),
    checkMergeMediated(join(docpathDir, 'rules'), 'merge-mediated rules'),
    workspaceCheck,
    tasksCurrentCheck,
    journalCheck,
    checkExists(join(docpathDir, 'workspace', 'state.json'), 'workspace state'),
    checkExists(join(docpathDir, 'workspace', 'current.md'), 'workspace current view'),
    checkExists(join(docpathDir, 'workspace', 'breadcrumb.md'), 'workspace breadcrumb view'),
  ];

  if (existsSync(join(worktreePath, 'package.json'))) {
    checks.push(
      existsSync(join(worktreePath, 'node_modules'))
        ? { status: 'pass', label: 'dependencies', detail: 'node_modules present' }
        : { status: 'warn', label: 'dependencies', detail: 'node_modules missing; run pnpm install before build/test' },
    );
  }

  checks.push(
    process.env.DOCPATH_SESSION
      ? { status: 'pass', label: 'session', detail: `DOCPATH_SESSION=${process.env.DOCPATH_SESSION}` }
      : { status: 'warn', label: 'session', detail: `set DOCPATH_SESSION=${recommendedSessionName(safeName)} before lifecycle commands` },
  );

  const errors = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;

  return { errors, warnings, checks, safeName, worktreePath };
}

export async function assertWorktreeContract(cwd: string): Promise<void> {
  if (!isInWorktree(cwd)) return;
  if (!(await isGitRepo(cwd))) return;
  const { errors } = await getWorktreeDoctorStatus(cwd);
  if (errors > 0) {
    throw new Error(
      `❌  Git Worktree contract validation failed. Operational commands blocked.\n` +
      `    修复建议: 运行 'docpath worktree repair' 自动校准共享/隔离契约。`
    );
  }
}

/**
 * worktree doctor [name] — 只读检查 worktree 开发前置条件
 */
async function worktreeDoctor(cwd: string, name?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { errors, warnings, checks, safeName, worktreePath } = await getWorktreeDoctorStatus(cwd, name);
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const diagnostics = await getWorktreeDiagnostics(repoRoot, worktreePath, safeName, samePath(repoRoot, worktreePath));

  console.log(`\n🩺  Worktree doctor: ${safeName}`);
  console.log(`  path: ${worktreePath}`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${check.label}: ${check.detail}`);
  }
  console.log(`  ℹ️ managed_by_docpath: ${diagnostics.managed}`);
  console.log(`  ℹ️ dirty: ${diagnostics.dirty}`);
  console.log(`  ℹ️ completed: ${diagnostics.completed}`);
  console.log(`  ℹ️ merged_to_main: ${diagnostics.mergedToMain}`);
  console.log(`  ℹ️ branch_has_unique_commits: ${diagnostics.branchHasUniqueCommits}`);
  console.log(`  ℹ️ branch_unique_commits: ${diagnostics.branchUniqueCommits}`);
  console.log(`  ℹ️ safe_to_remove: ${diagnostics.safeToRemove}`);
  if (diagnostics.cleanupCommand) {
    console.log(`  ℹ️ cleanup: ${diagnostics.cleanupCommand}`);
  }

  if (errors > 0) {
    console.log(`\n❌  worktree doctor failed (${errors} errors, ${warnings} warnings)`);
    console.log('修复建议: 备份未提交变更后，用 `docpath worktree repair` 自动校准，或者用 `docpath worktree create <name>` 重新创建受管 worktree。');
    process.exit(1);
  }

  console.log(`\n✅  worktree doctor passed (${warnings} warnings)`);
}


/**
 * worktree remove <name> — 删除 worktree
 */
async function worktreeRemove(cwd: string, name: string, force: boolean): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { repoRoot, safeName, worktreePath } = await resolveWorktreePaths(cwd, name);
  const worktrees = await listWorktrees(repoRoot);

  if (!worktrees.some((wt) => samePath(wt.path, worktreePath))) {
    console.error(`❌  worktree 不存在: ${safeName}`);
    process.exit(1);
  }

  console.log(`\n🗑️  删除 worktree: ${safeName}\n`);

  // 调用 git worktree remove
  try {
    await runGit(repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), relative(repoRoot, worktreePath)]);
  } catch (error) {
    console.error(`❌  删除 worktree 失败`);
    if (error instanceof Error && error.message) console.error(error.message);
    console.error(`提示: 使用 --force 强制删除`);
    process.exit(1);
  }

  // 尝试删除关联的本地分支
  try {
    const branchExists = (await runGitCapture(repoRoot, ['branch', '--list', safeName])).trim().length > 0;
    if (branchExists) {
      console.log(`🧹  正在删除本地分支: ${safeName}`);
      await runGit(repoRoot, ['branch', force ? '-D' : '-d', safeName]);
    }
  } catch (branchError) {
    console.warn(`⚠️  删除本地分支 ${safeName} 失败 (可能未完全合并): ${branchError instanceof Error ? branchError.message : String(branchError)}`);
    console.warn(`提示: 如果确认合并或丢弃该分支，可在主仓库运行: git branch -D ${safeName}`);
  }

  console.log(`\n✅  worktree 已删除: ${safeName}`);
}

/**
 * worktree prune — 自动清理已合并、已完成且没有未提交变更的 worktrees
 */
async function worktreePrune(cwd: string, force: boolean): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);
  const worktreesDir = join(repoRoot, '.worktrees');

  const candidates = worktrees.filter((wt) => !samePath(wt.path, repoRoot));

  if (candidates.length === 0) {
    console.log('📭  没有可清理的 worktrees');
    return;
  }

  console.log(`\n🧹  开始自动清理已合并的 worktrees...\n`);

  let prunedCount = 0;
  for (const wt of candidates) {
    const safeName = worktreeNameFromPath(worktreesDir, wt.path);
    const diagnostics = await getWorktreeDiagnostics(repoRoot, wt.path, safeName, false);

    // 自动清理规则：
    // - 正常模式：已完成 (completed) 且已合并到 main (mergedToMain) 且无未提交修改 (!dirty)
    // - force 模式：只要已完成 (completed)，即使 dirty 或未合并也强制清理
    const shouldPrune = force
      ? diagnostics.completed
      : (diagnostics.completed && diagnostics.mergedToMain && !diagnostics.dirty);

    if (shouldPrune) {
      console.log(`🗑️  清理 worktree: ${safeName} (${wt.path})`);
      try {
        await runGit(repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), relative(repoRoot, wt.path)]);
        prunedCount++;

        // 尝试删除分支
        try {
          const branchExists = (await runGitCapture(repoRoot, ['branch', '--list', safeName])).trim().length > 0;
          if (branchExists) {
            console.log(`    🧹 删除本地分支: ${safeName}`);
            await runGit(repoRoot, ['branch', force ? '-D' : '-d', safeName]);
          }
        } catch (branchError) {
          console.warn(`    ⚠️ 删除本地分支 ${safeName} 失败: ${branchError instanceof Error ? branchError.message : String(branchError)}`);
        }
      } catch (error) {
        console.error(`  ❌ 清理 worktree ${safeName} 失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const reasons: string[] = [];
      if (!diagnostics.completed) reasons.push('任务未完成 (phase !== completed)');
      if (!diagnostics.mergedToMain) reasons.push('分支未合并到 main');
      if (diagnostics.dirty) reasons.push('有未提交变更 (dirty)');
      console.log(`⏭️  跳过 worktree: ${safeName} (原因: ${reasons.join(', ')})`);
    }
  }

  console.log(`\n✅  自动清理完成，共清理了 ${prunedCount} 个 worktree。`);
}

/**
 * worktree repair [name] — 自动校准共享/隔离契约，修复漂移
 */
async function worktreeRepair(cwd: string, name?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { safeName, worktreePath } = await resolveDoctorTarget(cwd, name);
  const docpathDir = join(worktreePath, '.docpath');
  const repoRoot = await resolveWorktreeManagerRoot(cwd);

  console.log(`\n🔧  开始修复 worktree 契约: ${safeName}`);
  console.log(`    path: ${worktreePath}`);

  // 1. 修复被误追踪的隔离路径 (git rm --cached)
  const isolatedPaths = ['.docpath/tasks/current', '.docpath/workspace', '.docpath/journal'];
  for (const relPath of isolatedPaths) {
    const isTracked = (await runGitCapture(worktreePath, ['ls-files', '--', relPath])).trim().length > 0;
    if (isTracked) {
      console.log(`  🧹 发现被误追踪的隔离路径: ${relPath}，正在执行 untrack...`);
      try {
        await runGit(worktreePath, ['rm', '--cached', '-r', relPath]);
        console.log(`    ✓ 成功从 git 暂存区移除: ${relPath}`);
      } catch (err) {
        console.warn(`    ⚠️ 移除失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 2. 纠正 .gitignore 规则 (移除 backlog 规则)
  const gitignores = [join(worktreePath, '.gitignore'), join(repoRoot, '.gitignore')];
  for (const gitignorePath of gitignores) {
    if (existsSync(gitignorePath)) {
      try {
        const content = await readFile(gitignorePath, 'utf-8');
        const lines = content.split('\n');
        const nextLines = lines.filter((line) => line.trim() !== '/.docpath/backlog' && line.trim() !== '.docpath/backlog');
        if (nextLines.length !== lines.length) {
          await writeFile(gitignorePath, nextLines.join('\n'), 'utf-8');
          console.log(`  ✓  已在 ${relative(repoRoot, gitignorePath)} 中移除了 backlog 排除规则`);
        }
      } catch (err) {
        console.warn(`  ⚠️ 写入 .gitignore 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. 重新校准共享资源 (symlink vs tracked copy)
  console.log(`  🔗 重新校准共享与合并资源引用...`);
  const sharedResources = ['backlog', 'rules', 'spec', 'templates'];
  for (const resource of sharedResources) {
    const targetPath = join(repoRoot, '.docpath', resource);
    const linkPath = join(docpathDir, resource);
    // backlog 同为 tracked→copy（R-238 Option B，R-273 回滚 R-271 的强制 symlink）：
    // repair 会把 symlink 形态的 backlog 转回 tracked 副本。
    const tracked = await hasTrackedFiles(repoRoot, `.docpath/${resource}`);

    try {
      if (tracked) {
        // Tracked: should be a directory copy (not a symlink)
        if (!existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
          await rm(linkPath, { recursive: true, force: true });
          if (existsSync(targetPath)) {
            await cp(targetPath, linkPath, { recursive: true });
          } else {
            await mkdir(linkPath, { recursive: true });
          }
          console.log(`    ✓ ${resource} 修正为 tracked copy`);
        } else {
          console.log(`    ✓ ${resource} 已经是 tracked copy`);
        }
      } else {
        // Untracked or force live-shared: should be a symlink pointing to the main checkout
        if (existsSync(targetPath)) {
          let shouldCreate = true;
          if (existsSync(linkPath)) {
            if (lstatSync(linkPath).isSymbolicLink()) {
              shouldCreate = false; // already symlink
            } else {
              await rm(linkPath, { recursive: true, force: true });
            }
          }
          if (shouldCreate) {
            const relativePath = relative(dirname(linkPath), targetPath);
            await createSymlink(relativePath, linkPath, 'dir');
            console.log(`    ✓ ${resource} 修正为 symlink -> ${relativePath}`);
          } else {
            console.log(`    ✓ ${resource} 已经是 symlink`);
          }
        }
      }
    } catch (err) {
      console.warn(`    ⚠️ 修正 ${resource} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n🩺  修复完成，重新进行诊断...`);
  const { errors, warnings, checks } = await getWorktreeDoctorStatus(cwd, name);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${check.label}: ${check.detail}`);
  }

  if (errors > 0) {
    console.error(`\n❌  worktree 修复后仍存在 ${errors} 个错误。请检查底层问题。`);
    process.exit(1);
  } else {
    console.log(`\n✅  worktree 契约修复成功！所有卡点均已消除。`);
  }
}

/**
 * worktree merge [branch] — 自动合并 worktree 内的改动并合回主干
 */
async function worktreeMerge(cwd: string, branchNameOrTarget?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  // FR-1: worktree 模式识别 + 前置检查
  if (!isInWorktree(cwd)) {
    console.error('❌  worktree merge 必须在 git worktree 中运行');
    console.error('    请先执行: docpath worktree create <name> 并切换到工作区');
    process.exit(1);
  }

  // 获取主仓根路径和当前分支名
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const currentBranch = (await runGitCapture(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();

  // 解析目标分支 (支持从环境变量或参数传入，支持本地和远端分支解析)
  const targetBranchEnv = process.env.CODE_MERGE_TARGET || 'main'; // 默认主干为 main
  
  let targetMergeBranch = '';
  if (branchNameOrTarget) {
    const trimmed = branchNameOrTarget.trim();
    let exists = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', trimmed], { cwd });
      exists = true;
    } catch {}
    
    if (exists) {
      targetMergeBranch = trimmed;
    } else if (!trimmed.startsWith('origin/')) {
      targetMergeBranch = `origin/${trimmed}`;
    } else {
      targetMergeBranch = trimmed;
    }
  } else {
    const remoteBranch = `origin/${targetBranchEnv}`;
    let remoteExists = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', remoteBranch], { cwd });
      remoteExists = true;
    } catch {}
    targetMergeBranch = remoteExists ? remoteBranch : targetBranchEnv;
  }

  console.log(`=== worktree-merge 启动 ===`);
  console.log(`  worktree 路径: ${cwd}`);
  console.log(`  当前源分支: ${currentBranch}`);
  console.log(`  目标分支: ${targetMergeBranch}`);

  // 1. 自动提交未提交的残余文件 (FR-2)
  const statusPorcelain = (await runGitCapture(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
  if (statusPorcelain.length > 0) {
    console.log(`[FR-2] 检测到未提交的残余文件，正在自动 commit...`);
    try {
      await runGit(cwd, ['add', '-A']);
      const scope = process.env.CODE_MERGE_SCOPE || 'worktree-merge';
      await runGit(cwd, ['commit', '-m', `chore(${scope}): merge worktree into ${targetMergeBranch}`]);
      const lastHash = (await runGitCapture(cwd, ['log', '-1', '--format=%H'])).trim();
      console.log(`  ✓ commit 完成, hash: ${lastHash}`);
    } catch (err) {
      console.error(`❌ commit 失败: ${err instanceof Error ? err.message : String(err)}`);
      console.error('   请手动解决后（如处理 pre-commit 钩子）再次运行合并命令。');
      process.exit(1);
    }
  } else {
    console.log(`[FR-2] 无变更，跳过 commit`);
  }

  // 2. 拉取远端分支
  console.log(`[FR-3] 拉取远端主干分支最新代码...`);
  try {
    await execFileAsync('git', ['fetch', 'origin'], { cwd });
    console.log(`  ✓ fetch origin 成功`);
  } catch (err) {
    console.log(`⚠️  git fetch 失败，将使用本地已有分支缓存合并: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. 执行合并主干分支 (git merge --no-ff)
  console.log(`[FR-3] 正在合并目标分支 ${targetMergeBranch}...`);
  let hasConflicts = false;
  try {
    await execFileAsync('git', ['merge', targetMergeBranch, '--no-ff'], { cwd });
    console.log(`  ✓ 合并 ${targetMergeBranch} 成功`);
  } catch (err) {
    // 检查是否产生了合并冲突
    const unmergedFiles = (await runGitCapture(cwd, ['diff', '--name-only', '--diff-filter=U'])).trim();
    if (unmergedFiles.length > 0) {
      hasConflicts = true;
      console.error(`❌  合并目标分支 ${targetMergeBranch} 时发生冲突!`);
      console.error('未合并的文件:');
      const lines = unmergedFiles.split('\n');
      for (const line of lines) {
        console.error(`  - ${line}`);
      }
      console.error('\n⚠️ 请在当前工作区解决上述冲突（推荐由 Agent 现场读取冲突标记智能解决），执行 git add 标记已解决，然后重新运行 docpath worktree merge 完成合并流程。');
      process.exit(1);
    } else {
      console.error(`❌ git merge 失败: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // 再次确认提交状态，如果合并无冲突并自动产生了 merge commit
  const postStatus = (await runGitCapture(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
  const unmergedPost = (await runGitCapture(cwd, ['diff', '--name-only', '--diff-filter=U'])).trim();
  if (unmergedPost.length > 0) {
    console.error(`❌ 仍有未解决冲突的文件，合并终止`);
    process.exit(1);
  }

  // 如果有未提交文件且非冲突（有些 merge 自动完成但没有 commit 比如 --no-commit），进行提交
  if (postStatus.length > 0) {
    console.log(`[FR-5] 提交合并后的成果...`);
    try {
      await runGit(cwd, ['add', '-A']);
      const scope = process.env.CODE_MERGE_SCOPE || 'worktree-merge';
      await runGit(cwd, ['commit', '-m', `chore(${scope}): post-merge cleanup`]);
      console.log(`  ✓ post-merge cleanup commit 成功`);
    } catch (err) {
      console.warn(`⚠️ post-merge cleanup commit 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. 看板自检 (FR-6)
  // 适配 DocPath: 检查 .docpath/backlog/backlog.md 索引与各文件的统计一致性
  console.log(`[FR-6] 进行 backlog 索引统计自检...`);
  try {
    const backlogIndex = join(cwd, '.docpath', 'backlog', 'backlog.md');
    if (existsSync(backlogIndex)) {
      const { listBacklogItems } = await import('../engine/backlog.js');
      const items = await listBacklogItems(cwd);
      // 读取 backlog.md 内容
      const content = await readFile(backlogIndex, 'utf-8');
      
      // 简单自检：看项目清单中条目数和实际条目数是否匹配
      const lines = content.split('\n');
      const tableRows = lines.filter(l => /^\|\s*(R-\d+)\s*\|/.test(l.trim())).length;
      
      console.log(`  ✓ 实际 backlog 条目: ${items.length} 个`);
      console.log(`  ✓ backlog.md 索引表格项: ${tableRows} 行`);
      if (items.length !== tableRows) {
        console.warn(`⚠️  警告: 看板索引文件与实际条目数不一致（索引 ${tableRows} 行 vs 实际 ${items.length} 个）`);
      } else {
        console.log(`  ✓ 看板自检通过 (一致)`);
      }
    } else {
      console.log(`  ✓ 跳过自检 (未找到 backlog.md)`);
    }
  } catch (err) {
    console.warn(`⚠️ 看板自检失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. 任务生命周期状态门禁
  // 读取当前任务的 state.json，校验 phase
  const state = await readCurrentState(cwd);
  if (!state || state.phase !== 'completed') {
    console.log(`\nℹ️  当前任务 phase=${state?.phase || 'unknown'} (非 completed)。`);
    console.log(`    已将 ${targetMergeBranch} 成功合并至当前开发分支，保持开发分支同步更新。`);
    console.log(`    合回主干 (checkout ${targetBranchEnv} && git merge) 仅在 phase=completed (质量门禁和 review 均通过后) 运行。`);
    console.log(`=== worktree-merge 结束 (同步完成) ===`);
    return;
  }

  // 6. 合并当前 worktree 分支回目标主分支 (FR-7)
  console.log(`\n[FR-7] 任务已标记为 completed，开始将分支合回 ${targetBranchEnv}...`);
  try {
    // 校验 repoRoot 是否有 dirty 文件，如果有，拒绝自动合并
    const rootStatus = (await runGitCapture(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
    if (rootStatus.length > 0) {
      console.error(`❌  主仓目录 ${repoRoot} 处于 dirty 状态，无法自动合回！`);
      console.error('    请先在主仓目录提交或暂存变更 (git stash)，然后再重新运行本合并命令。');
      process.exit(1);
    }

    // 切换到 main
    console.log(`  切换主仓分支到 ${targetBranchEnv}...`);
    await runGit(repoRoot, ['checkout', targetBranchEnv]);

    // 合并 worktree 分支回 main
    console.log(`  在主仓合并分支 ${currentBranch} 到 ${targetBranchEnv}...`);
    const mergeMsg = `Merge branch '${currentBranch}' into ${targetBranchEnv}`;
    await runGit(repoRoot, ['merge', currentBranch, '--no-ff', '-m', mergeMsg]);

    const mergeHash = (await runGitCapture(repoRoot, ['log', '-1', '--format=%H'])).trim();
    
    console.log(`\n=== worktree-merge 完成 ===`);
    console.log(` · worktree: ${cwd}`);
    console.log(` · 源分支: ${currentBranch}`);
    console.log(` · 目标分支: ${targetBranchEnv}`);
    console.log(` · merge commit: ${mergeHash}`);
    console.log(` · 退出码: 0`);
  } catch (err) {
    console.error(`❌  合回 ${targetBranchEnv} 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * docpath worktree 命令入口
 */
export async function worktreeCommand(options: WorktreeOptions): Promise<void> {
  const { cwd, action = 'list', name, force = false, backlog } = options;

  switch (action) {
    case 'create':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree create <name>');
        process.exit(1);
      }
      await worktreeCreate(cwd, name, backlog);
      break;

    case 'list':
      await worktreeList(cwd);
      break;

    case 'doctor':
      await worktreeDoctor(cwd, name);
      break;

    case 'repair':
      await worktreeRepair(cwd, name);
      break;

    case 'merge':
      await worktreeMerge(cwd, name);
      break;

    case 'remove':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree remove <name> [--force]');
        process.exit(1);
      }
      await worktreeRemove(cwd, name, force);
      break;

    case 'prune':
      await worktreePrune(cwd, force);
      break;

    default:
      console.error(`❌  未知操作: ${action}`);
      process.exit(1);
  }
}
