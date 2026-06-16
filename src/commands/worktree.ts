/**
 * docpath worktree — Git Worktree 管理
 *
 * 支持真并发开发：多个 Agent 在独立 worktrees 中开发不同 feature。
 */

import { existsSync, lstatSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BREADCRUMB_HEADER } from '../engine/breadcrumb.js';
import { writeCurrentState, readCurrentState } from '../utils/workspace.js';
import {
  isGitRepo,
  listWorktrees,
  getGitTopLevel,
  createSymlink,
} from '../utils/worktree.js';

const execFileAsync = promisify(execFile);

interface WorktreeOptions {
  cwd: string;
  action?: 'create' | 'list' | 'remove' | 'doctor';
  name?: string;
  force?: boolean;
}

interface WorktreePaths {
  repoRoot: string;
  safeName: string;
  worktreesDir: string;
  worktreePath: string;
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
  return `codex-${name}`;
}

async function resolveWorktreePaths(cwd: string, name: string): Promise<WorktreePaths> {
  const repoRoot = await getGitTopLevel(cwd);
  const safeName = validateWorktreeName(name);
  const worktreesDir = join(repoRoot, '.worktrees');
  const worktreePath = resolve(worktreesDir, safeName);
  assertInside(worktreesDir, worktreePath);
  return { repoRoot, safeName, worktreesDir, worktreePath };
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

/**
 * worktree create <name> — 创建新 worktree
 */
async function worktreeCreate(cwd: string, name: string): Promise<void> {
  // 1. 检查是否为 git 仓库
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { repoRoot, safeName, worktreesDir, worktreePath } = await resolveWorktreePaths(cwd, name);

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

  console.log(`\n✅  worktree 已创建: ${worktreePath}`);
  console.log(`\n从主仓库检查:`);
  console.log(`  docpath worktree doctor ${safeName}`);
  console.log(`\n进入 worktree 后:`);
  console.log(`  cd ${relative(repoRoot, worktreePath)}`);
  console.log(`  export DOCPATH_SESSION=${recommendedSessionName(safeName)}`);
  console.log(`  docpath worktree doctor`);
  console.log(`  docpath next --agent`);
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

  // 清理需要隔离的目录（git 复制过来的）
  const toClean = ['workspace', 'tasks', 'journal', 'docs.md', 'docs-index.json'];
  for (const item of toClean) {
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
    const dirPath = join(docpathDir, dir);
    await mkdir(dirPath, { recursive: true });
    console.log(`    ✓ ${dir}/`);
  }

  // 创建 workspace 子目录
  const workspaceDirs = ['sessions', 'leases', 'commands', 'bin'];
  for (const dir of workspaceDirs) {
    const dirPath = join(docpathDir, 'workspace', dir);
    await mkdir(dirPath, { recursive: true });
  }

  // 创建共享资源的 symlinks
  console.log(`  🔗 创建共享资源 symlinks...`);
  const sharedResources = ['backlog', 'rules', 'spec', 'templates'];
  for (const resource of sharedResources) {
    const targetPath = join(mainRepoPath, '.docpath', resource);
    const linkPath = join(docpathDir, resource);

    // 删除 git 复制的目录
    if (existsSync(linkPath)) {
      await rm(linkPath, { recursive: true, force: true });
    }

    if (existsSync(targetPath)) {
      const relativePath = relative(dirname(linkPath), targetPath);
      await createSymlink(relativePath, linkPath, 'dir');
      console.log(`    ✓ ${resource} -> 主仓库`);
    }
  }

  console.log(`  🧭 写入独立 runtime 初始状态...`);
  const mainState = await readCurrentState(mainRepoPath);
  const now = new Date().toISOString();
  await writeCurrentState(worktreePath, {
    level: mainState?.level || 2,
    state: 'idle',
    task_id: '',
    task_title: `Worktree ${name}`,
    phase: 'idle',
    gate: 'none',
    current_step: '等待下一步',
    started_at: now,
    updated_at: now,
  });
  await writeFile(join(docpathDir, 'workspace', 'breadcrumb.md'), BREADCRUMB_HEADER, 'utf-8');

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

  const repoRoot = await getGitTopLevel(cwd);
  const worktrees = await listWorktrees(repoRoot);

  if (worktrees.length === 0) {
    console.log('📭  没有 worktrees');
    return;
  }

  console.log('\n🌳  Worktrees:\n');
  for (const wt of worktrees) {
    const isBare = wt.bare ? ' (bare)' : '';
    const branch = wt.detached ? `detached at ${wt.head.substring(0, 7)}` : wt.branch;
    const isMain = samePath(wt.path, repoRoot);
    const label = isMain ? '(main)' : '';

    console.log(`  • ${wt.path} ${label}`);
    console.log(`    branch: ${branch}${isBare}`);

    // 显示 DocPath 状态
    const stateInfo = await getWorktreeState(wt.path);
    if (stateInfo) {
      console.log(`    docpath: ${stateInfo}`);
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

type DoctorStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
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

function checkSymlink(path: string, label: string): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { status: 'pass', label, detail: path };
    return { status: 'fail', label, detail: `not a symlink: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
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

/**
 * worktree doctor [name] — 只读检查 worktree 开发前置条件
 */
async function worktreeDoctor(cwd: string, name?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { safeName, worktreePath } = await resolveDoctorTarget(cwd, name);
  const docpathDir = join(worktreePath, '.docpath');
  const checks: DoctorCheck[] = [
    checkExists(join(worktreePath, '.git'), 'git worktree metadata'),
    checkDirectory(docpathDir, '.docpath directory'),
    checkSymlink(join(docpathDir, 'backlog'), 'shared backlog symlink'),
    checkSymlink(join(docpathDir, 'rules'), 'shared rules symlink'),
    checkDirectory(join(docpathDir, 'workspace'), 'isolated workspace directory'),
    checkDirectory(join(docpathDir, 'tasks'), 'isolated tasks directory'),
    checkDirectory(join(docpathDir, 'journal'), 'isolated journal directory'),
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

  console.log(`\n🩺  Worktree doctor: ${safeName}`);
  console.log(`  path: ${worktreePath}`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${check.label}: ${check.detail}`);
  }

  if (errors > 0) {
    console.log(`\n❌  worktree doctor failed (${errors} errors, ${warnings} warnings)`);
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

  console.log(`\n✅  worktree 已删除: ${safeName}`);
}

/**
 * docpath worktree 命令入口
 */
export async function worktreeCommand(options: WorktreeOptions): Promise<void> {
  const { cwd, action = 'list', name, force = false } = options;

  switch (action) {
    case 'create':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree create <name>');
        process.exit(1);
      }
      await worktreeCreate(cwd, name);
      break;

    case 'list':
      await worktreeList(cwd);
      break;

    case 'doctor':
      await worktreeDoctor(cwd, name);
      break;

    case 'remove':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree remove <name> [--force]');
        process.exit(1);
      }
      await worktreeRemove(cwd, name, force);
      break;

    default:
      console.error(`❌  未知操作: ${action}`);
      process.exit(1);
  }
}
