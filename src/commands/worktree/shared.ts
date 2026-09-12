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
import { BREADCRUMB_HEADER, writeBreadcrumb } from '../../engine/breadcrumb.js';
import { mutateCurrentState, readCurrentState } from '../../utils/workspace.js';
import { detectBinaryDrift, renderBinaryDriftWarning } from '../../utils/version-drift.js';
import { gitAsync } from '../../utils/git-run.js';
import {
  isGitRepo,
  listWorktrees,
  getGitTopLevel,
  createSymlink,
  isInWorktree,
} from '../../utils/worktree.js';

const execFileAsync = promisify(execFile);

export interface WorktreeOptions {
  cwd: string;
  action?: 'create' | 'list' | 'remove' | 'doctor' | 'prune' | 'repair' | 'merge' | 'sync';
  name?: string;
  force?: boolean;
  backlog?: string;
  /** R-335 FR-5: list --agent 聚合视图 */
  agent?: boolean;
  /** R-335 FR-1: merge 时记录证据跳过 dirty 交集拒绝 */
  allowDirtyMain?: string;
}

export interface WorktreePaths {
  repoRoot: string;
  safeName: string;
  worktreesDir: string;
  worktreePath: string;
}

export interface WorktreeDiagnostics {
  managed: boolean;
  dirty: boolean;
  completed: boolean;
  mergedToMain: boolean;
  branchHasUniqueCommits: boolean;
  branchUniqueCommits: number;
  safeToRemove: boolean;
  cleanupCommand: string | null;
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

export async function resolveWorktreePaths(cwd: string, name: string): Promise<WorktreePaths> {
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const safeName = validateWorktreeName(name);
  const worktreesDir = join(repoRoot, '.worktrees');
  const worktreePath = resolve(worktreesDir, safeName);
  assertInside(worktreesDir, worktreePath);
  return { repoRoot, safeName, worktreesDir, worktreePath };
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

/**
 * worktree create <name> — 创建新 worktree
 */
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
    // （主 checkout 临时切到其他分支时旧实现会把已合并误判为未合并）。
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

/**
 * R-344 WT-3: 统一合并目标解析（merge 与 sync 共用）。
 * 显式参数 → 本地存在直接用；否则尝试 origin/<x>；缺省走 CODE_MERGE_TARGET || 'main'。
 */
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

/**
 * R-344 WT-4: 解析 git status --porcelain 输出中的文件路径。
 * - rename/copy 条目（`R  old -> new`）返回两侧路径；
 * - git C 风格引号路径（"..."）去引号并展开常用转义。
 */
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

/**
 * R-345 FR-1: 可重建索引的合并冲突自动消解。
 *
 * 内置集合：.docpath/docs-index.json（docs scan 重建）、.docpath/backlog/backlog.md
 * （backlog refresh 重建）。config `worktree.auto_resolve_paths:` 可追加路径——
 * 追加项命中时同样从冲突集合中消解（checkout --theirs 侧），但不做内容重建
 * （仅两个内置索引有确定性重建原语）。
 *
 * all-or-nothing：任一冲突文件不在集合内即返回空清单，调用方回退人工路径。
 */
export const REBUILDABLE_INDEX_PATHS: Record<string, 'backlog' | 'docs'> = {
  '.docpath/backlog/backlog.md': 'backlog',
  '.docpath/docs-index.json': 'docs',
};

export async function readAutoResolvePaths(cwd: string): Promise<string[]> {
  try {
    const { readDocPathConfig } = await import('../../utils/config.js');
    const config = await readDocPathConfig(cwd);
    const extra = config.worktree?.auto_resolve_paths;
    return Array.isArray(extra) ? extra.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export interface IndexConflictResolution {
  resolved: string[];
  rebuilds: Array<{ path: string; kind: 'backlog' | 'docs' }>;
}

/**
 * 判定冲突文件是否可全部自动消解；可以则执行 checkout --theirs + 重建调度。
 * 返回 resolved 为空表示不可消解（调用方回退 abort/人工路径）。
 */
export async function resolveIndexConflicts(
  cwd: string,
  unmergedFiles: string[],
): Promise<IndexConflictResolution> {
  const extraPaths = await readAutoResolvePaths(cwd);
  const resolvable = (file: string): boolean =>
    file in REBUILDABLE_INDEX_PATHS || extraPaths.includes(file);
  if (unmergedFiles.length === 0 || !unmergedFiles.every(resolvable)) {
    return { resolved: [], rebuilds: [] };
  }

  for (const file of unmergedFiles) {
    await execFileAsync('git', ['checkout', '--theirs', '--', file], { cwd });
  }

  const rebuilds: Array<{ path: string; kind: 'backlog' | 'docs' }> = [];
  for (const file of unmergedFiles) {
    const kind = REBUILDABLE_INDEX_PATHS[file];
    if (kind === 'backlog') {
      const { refreshBacklogIndex } = await import('../../engine/backlog.js');
      await refreshBacklogIndex(cwd);
      rebuilds.push({ path: file, kind });
    } else if (kind === 'docs') {
      const { resolveDocpathDir } = await import('../../utils/file.js');
      const { refreshProjectDocumentIndex } = await import('../../commands/docs.js');
      const docpathDir = await resolveDocpathDir(cwd);
      await refreshProjectDocumentIndex(docpathDir, cwd);
      rebuilds.push({ path: file, kind });
    }
  }

  await execFileAsync('git', ['add', '--', ...unmergedFiles], { cwd });
  return { resolved: [...unmergedFiles], rebuilds };
}
