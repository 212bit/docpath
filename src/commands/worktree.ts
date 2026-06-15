/**
 * docpath worktree — Git Worktree 管理
 *
 * 支持真并发开发：多个 Agent 在独立 worktrees 中开发不同 feature。
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { resolveDocpathDir } from '../utils/file.js';
import {
  isGitRepo,
  listWorktrees,
  getMainRepoPath,
  createSymlink,
  type WorktreeInfo,
} from '../utils/worktree.js';

interface WorktreeOptions {
  cwd: string;
  action?: 'create' | 'list' | 'remove';
  name?: string;
  force?: boolean;
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

  // 2. 检查 worktree 是否已存在
  const worktrees = await listWorktrees(cwd);
  const worktreePath = join(cwd, '.worktrees', name);
  if (worktrees.some((wt) => wt.path === worktreePath)) {
    console.error(`❌  worktree 已存在: ${name}`);
    process.exit(1);
  }

  // 3. 创建 .worktrees 目录
  const worktreesDir = join(cwd, '.worktrees');
  if (!existsSync(worktreesDir)) {
    await mkdir(worktreesDir, { recursive: true });
  }

  console.log(`\n🌳  创建 worktree: ${name}\n`);

  // 4. 调用 git worktree add
  try {
    execSync(`git worktree add .worktrees/${name} -b ${name}`, {
      cwd,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`❌  创建 worktree 失败`);
    process.exit(1);
  }

  // 5. 初始化 .docpath/ 并创建 symlinks
  console.log(`\n📁  配置 .docpath/ 目录...\n`);
  await initWorktreeDocpath(cwd, worktreePath);

  console.log(`\n✅  worktree 已创建: ${worktreePath}`);
  console.log(`\n⚠️  注意: Worktree 的 .docpath/ 需要初始化为独立状态`);
  console.log(`\n下一步:`);
  console.log(`  cd .worktrees/${name}`);
  console.log(`  docpath init  # 初始化独立 .docpath/ 状态`);
}

/**
 * 初始化 worktree 的 .docpath/ 目录
 *
 * 问题：git worktree add 会把 .docpath/ 整个复制过来（因为在 git 中）
 * 解决：清理复制的内容，重建正确的隔离/共享结构
 */
async function initWorktreeDocpath(mainRepoPath: string, worktreePath: string): Promise<void> {
  const docpathDir = join(worktreePath, '.docpath');
  const { rm } = await import('node:fs/promises');

  console.log(`  🧹 清理 git 复制的 .docpath/ 内容...`);

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
      const relativePath = `../../.docpath/${resource}`;
      await createSymlink(relativePath, linkPath, 'dir');
      console.log(`    ✓ ${resource} -> 主仓库`);
    }
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

  const worktrees = await listWorktrees(cwd);

  if (worktrees.length === 0) {
    console.log('📭  没有 worktrees');
    return;
  }

  console.log('\n🌳  Worktrees:\n');
  for (const wt of worktrees) {
    const isBare = wt.bare ? ' (bare)' : '';
    const branch = wt.detached ? `detached at ${wt.head.substring(0, 7)}` : wt.branch;
    console.log(`  • ${wt.path}`);
    console.log(`    branch: ${branch}${isBare}`);
  }
  console.log('');
}

/**
 * worktree remove <name> — 删除 worktree
 */
async function worktreeRemove(cwd: string, name: string, force: boolean): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const worktreePath = join(cwd, '.worktrees', name);
  const worktrees = await listWorktrees(cwd);

  if (!worktrees.some((wt) => wt.path === worktreePath)) {
    console.error(`❌  worktree 不存在: ${name}`);
    process.exit(1);
  }

  console.log(`\n🗑️  删除 worktree: ${name}\n`);

  // 调用 git worktree remove
  try {
    const forceFlag = force ? '--force' : '';
    execSync(`git worktree remove .worktrees/${name} ${forceFlag}`, {
      cwd,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`❌  删除 worktree 失败`);
    console.error(`提示: 使用 --force 强制删除`);
    process.exit(1);
  }

  console.log(`\n✅  worktree 已删除: ${name}`);
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
