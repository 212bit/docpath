/**
 * Git Worktree 工具函数
 *
 * 支持 DocPath 真并发开发：
 * - Worktree 创建/管理
 * - 环境检测
 * - 共享资源路径解析
 */

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, symlink, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
  detached: boolean;
}

/**
 * 检测当前是否在 worktree 中
 */
export function isInWorktree(cwd: string): boolean {
  const gitPath = join(cwd, '.git');

  // 如果 .git 是文件（gitdir 指针），说明在 worktree
  if (existsSync(gitPath)) {
    try {
      const stat = require('fs').statSync(gitPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  // 检查环境变量
  return !!process.env.DOCPATH_WORKTREE;
}

/**
 * 获取主仓库路径
 */
export async function getMainRepoPath(cwd: string): Promise<string> {
  if (!isInWorktree(cwd)) {
    return cwd;
  }

  try {
    // 读取 .git 文件获取 gitdir 路径
    const gitPath = join(cwd, '.git');
    const gitContent = await readFile(gitPath, 'utf-8');
    const match = gitContent.match(/gitdir:\s*(.+)/);
    if (!match) return cwd;

    // gitdir 指向 .git/worktrees/<name>
    // 主仓库在 ../../.. (相对于 gitdir)
    const gitdir = match[1].trim();
    const mainGitDir = resolve(cwd, gitdir, '..', '..', '..');
    return mainGitDir;
  } catch {
    return cwd;
  }
}

/**
 * 解析共享资源路径
 *
 * 在 worktree 中，某些资源（backlog/rules）共享到主仓库
 */
export async function resolveSharedResource(
  cwd: string,
  resource: 'backlog' | 'rules' | 'spec' | 'templates'
): Promise<string> {
  if (isInWorktree(cwd)) {
    const mainRepo = await getMainRepoPath(cwd);
    return join(mainRepo, '.docpath', resource);
  }

  const { resolveDocpathDir } = await import('./file.js');
  const docpathDir = await resolveDocpathDir(cwd);
  return join(docpathDir, resource);
}

/**
 * 列出所有 worktrees
 */
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd });
    return parseWorktreeList(stdout);
  } catch (error) {
    throw new Error(`列出 worktrees 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 解析 git worktree list --porcelain 输出
 */
function parseWorktreeList(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n').filter(Boolean);

  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = { path: line.substring(9).trim(), bare: false, detached: false };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7).trim();
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

/**
 * 创建 symlink（跨平台）
 */
export async function createSymlink(target: string, linkPath: string, type: 'dir' | 'file' = 'dir'): Promise<void> {
  try {
    await symlink(target, linkPath, type);
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      // 已存在，跳过
      return;
    }
    throw error;
  }
}

/**
 * 检查是否为 git 仓库
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}
