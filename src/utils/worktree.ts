/**
 * Git Worktree 工具函数
 *
 * 支持 DocPath 真并发开发：
 * - Worktree 创建/管理
 * - 环境检测
 * - 共享资源路径解析
 */

import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
      const stat = statSync(gitPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  // 检查环境变量
  return !!process.env.DOCPATH_WORKTREE;
}

/**
 * 获取当前 Git 仓库 top-level。
 */
export async function getGitTopLevel(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

/**
 * 列出所有 worktrees
 */
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd });
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
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'EEXIST') {
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
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}
