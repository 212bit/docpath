/**
 * Git Worktree 工具函数与核心逻辑 (Layer 1 Utils)
 *
 * 支持 DocPath 真并发开发：
 * - Worktree 创建/管理/体检
 * - 环境检测
 * - 共享资源路径解析
 * - 冲突消解辅助
 */

import { execFile } from 'node:child_process';
import { existsSync, lstatSync, statSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gitAsync } from './git-run.js';
import { readCurrentState } from './workspace.js';
import type {
  WorktreeDiagnostics,
  WorktreeInfo,
  WorktreePaths,
  IndexConflictResolution,
} from '../types/worktree.js';

export type { WorktreeDiagnostics, WorktreeInfo, WorktreePaths, IndexConflictResolution } from '../types/worktree.js';

const execFileAsync = promisify(execFile);

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
  return Boolean(process.env.DOCPATH_WORKTREE);
}

/**
 * 获取当前 Git 仓库 top-level。
 */
export async function getGitTopLevel(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
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

export function validateWorktreeName(name: string): string {
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

export function assertInside(parent: string, child: string): void {
  const rel = relative(parent, child);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`worktree 路径必须位于 ${parent} 下: ${child}`);
  }
}

export function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

export function recommendedSessionName(name: string): string {
  return `agent-${name}`;
}

export function toolSessionPattern(name: string, backlogId?: string): string {
  return backlogId
    ? `<tool>-${backlogId}-${name}`
    : `<tool>-${name}`;
}

export function validateBacklogId(id: string): string {
  const trimmed = id.trim().toUpperCase();
  if (!/^R-\d+$/.test(trimmed)) {
    throw new Error(`非法 backlog id: ${id}。格式应为 R-123。`);
  }
  return trimmed;
}

export async function resolveWorktreeManagerRoot(cwd: string): Promise<string> {
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

export async function resolveWorktreePaths(cwd: string, name: string): Promise<WorktreePaths> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const safeName = validateWorktreeName(name);
  const worktreesDir = join(repoRoot, '.worktrees');
  const worktreePath = resolve(worktreesDir, safeName);
  assertInside(worktreesDir, worktreePath);
  return { repoRoot, safeName, worktreesDir, worktreePath };
}

export async function runGit(cwd: string, args: string[]): Promise<void> {
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

export async function runGitCapture(cwd: string, args: string[]): Promise<string> {
  // R-337 A1: git-run 共享原语（quotePath=false 全局生效）
  return (await gitAsync(cwd, args)).trimEnd();
}

export async function hasTrackedFiles(repoRoot: string, path: string): Promise<boolean> {
  const { stdout } = await execFileAsync('git', ['ls-files', '--', path], { cwd: repoRoot });
  return stdout.trim().length > 0;
}

export async function isTrackedDocPath(repoRoot: string, item: string): Promise<boolean> {
  return hasTrackedFiles(repoRoot, `.docpath/${item}`);
}

export async function getWorktreeState(worktreePath: string): Promise<string | null> {
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

export function worktreeNameFromPath(worktreesDir: string, wtPath: string): string {
  const rel = relative(worktreesDir, wtPath);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return rel.split(/[\\/]/)[0] || wtPath.split(/[\\/]/).filter(Boolean).at(-1) || 'current';
  }
  return wtPath.split(/[\\/]/).filter(Boolean).at(-1) || 'current';
}

export async function resolveMergeTarget(cwd: string, branchNameOrTarget?: string): Promise<string> {
  const verify = async (ref: string): Promise<boolean> => {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd });
      return true;
    } catch {
      return false;
    }
  };
  const fallback = process.env.CODE_MERGE_TARGET || 'main';
  const explicit = branchNameOrTarget?.trim();
  if (explicit) {
    if (await verify(explicit)) return explicit;
    if (!explicit.startsWith('origin/')) return `origin/${explicit}`;
    return explicit;
  }
  const remoteFallback = `origin/${fallback}`;
  if (await verify(remoteFallback)) return remoteFallback;
  return fallback;
}

export async function getWorktreeDiagnostics(
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
    // R-344 WT-5: 与解析后的合并目标比较，而非主 checkout 当前所在分支
    let mergeTarget = 'main';
    try {
      mergeTarget = await resolveMergeTarget(repoRoot);
    } catch {
      mergeTarget = 'main';
    }
    try {
      const head = (await runGitCapture(wtPath, ['rev-parse', 'HEAD'])).trim();
      await execFileAsync('git', ['merge-base', '--is-ancestor', head, mergeTarget], { cwd: repoRoot });
      mergedToMain = true;
    } catch {
      mergedToMain = false;
    }
    try {
      branchUniqueCommits = Number((await runGitCapture(wtPath, ['rev-list', '--count', 'HEAD', '--not', mergeTarget])).trim());
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

export function parsePorcelainPaths(raw: string): string[] {
  const files: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    let path = trimmed.slice(3);
    if (!path) continue;
    if (path.startsWith('"') && path.endsWith('"') && path.length >= 2) {
      path = path.slice(1, -1)
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n');
    }
    if (path.includes(' -> ')) {
      const [from, to] = path.split(' -> ');
      if (from) files.push(from);
      if (to) files.push(to);
    } else {
      files.push(path);
    }
  }
  return Array.from(new Set(files.filter(Boolean)));
}

export const REBUILDABLE_INDEX_PATHS: Record<string, 'backlog' | 'docs'> = {
  '.docpath/backlog/backlog.md': 'backlog',
  '.docpath/docs-index.json': 'docs',
};

export async function readAutoResolvePaths(cwd: string): Promise<string[]> {
  try {
    const { readDocPathConfig } = await import('./config.js');
    const config = await readDocPathConfig(cwd);
    const extra = config.worktree?.auto_resolve_paths;
    return Array.isArray(extra) ? extra.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}
