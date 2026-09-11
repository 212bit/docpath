import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { gitSync } from './git-run.js';
import { readFileSafe } from './file.js';

export type IgnoredEvidenceCheck = 'checked' | 'skipped';

export interface IgnoredEvidenceReport {
  check: IgnoredEvidenceCheck;
  skip_reason: string | null;
  files: string[];
  canonical_files: string[];
  alias_files: string[];
  add_command: string | null;
}

export interface GitCloseoutSummary {
  available: boolean;
  has_worktree_changes: boolean;
  canonical_ignored_evidence_count: number;
  alias_ignored_evidence_count: number;
  needs_closeout: boolean;
}

export function runGit(cwd: string, args: string[]): string {
  return gitSync(cwd, args);
}

export function shellQuotePath(path: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function buildForceAddCommand(files: string[]): string | null {
  if (files.length === 0) return null;
  return `git add -f ${files.map(shellQuotePath).join(' ')}`;
}

export function classifyIgnoredEvidenceFile(file: string): 'canonical' | 'alias' {
  if (file.startsWith('.docpath/tasks/current/')) return 'alias';
  return 'canonical';
}

export async function readLinkedBacklogId(docpathDir: string, taskId: string | undefined): Promise<string | null> {
  const candidates = [
    join(docpathDir, 'tasks', 'current', 'spec.md'),
    ...(taskId ? [
      join(docpathDir, 'tasks', taskId, 'spec.md'),
      join(docpathDir, 'tasks', 'done', taskId, 'spec.md'),
    ] : []),
  ];
  for (const path of candidates) {
    const raw = await readFileSafe(path);
    const match = raw?.match(/^>\s*backlog_id:\s*(R-\d+)/m);
    if (match) return match[1];
  }
  return null;
}

export function skippedIgnoredEvidenceReport(reason: string): IgnoredEvidenceReport {
  return {
    check: 'skipped',
    skip_reason: reason,
    files: [],
    canonical_files: [],
    alias_files: [],
    add_command: null,
  };
}

export interface UntrackedEvidenceReport {
  files: string[];
  add_command: string | null;
}

export const SKIPPED_UNTRACKED_EVIDENCE: UntrackedEvidenceReport = {
  files: [],
  add_command: null,
};

/**
 * 当前任务 canonical 路径下 untracked 但非 gitignored 的证据文件（如 closeout 后
 * 尚未提交的 spec/plan/breadcrumb）。这些文件不需要 `git add -f`，普通 `git add`
 * 即可，但 changes --agent 之前对它们没有 stage 提示，迫使 agent 手动判断。
 *
 * 仅扫 `.docpath/tasks/<taskId>/` 与 `.docpath/tasks/done/<taskId>/`（canonical
 * 位置），不扫 `tasks/current/`（alias，默认不提交）。
 */
export function readUntrackedCanonicalEvidence(
  gitRoot: string,
  taskId: string | undefined,
): UntrackedEvidenceReport {
  if (!taskId) return SKIPPED_UNTRACKED_EVIDENCE;
  const paths = [`.docpath/tasks/${taskId}`, `.docpath/tasks/done/${taskId}`];
  try {
    const files = Array.from(new Set(
      runGit(gitRoot, ['ls-files', '--others', '--exclude-standard', '--', ...paths])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((file) => !file.endsWith('/')),
    )).sort();
    return {
      files,
      add_command: files.length > 0 ? `git add ${files.map(shellQuotePath).join(' ')}` : null,
    };
  } catch {
    return SKIPPED_UNTRACKED_EVIDENCE;
  }
}

export function readIgnoredEvidenceReport(
  gitRoot: string,
  taskId: string | undefined,
  backlogId: string | null,
): IgnoredEvidenceReport {
  const paths = [
    '.docpath/backlog/backlog.md',
    ...(backlogId ? [`.docpath/backlog/${backlogId}.md`] : []),
    '.docpath/tasks/current',
    ...(taskId ? [`.docpath/tasks/${taskId}`, `.docpath/tasks/done/${taskId}`] : []),
  ];
  try {
    const files = Array.from(new Set(
      runGit(gitRoot, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...paths])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((file) => !file.endsWith('/')),
    )).sort();
    const canonicalFiles = files.filter((file) => classifyIgnoredEvidenceFile(file) === 'canonical');
    const aliasFiles = files.filter((file) => classifyIgnoredEvidenceFile(file) === 'alias');
    return {
      check: 'checked',
      skip_reason: null,
      files,
      canonical_files: canonicalFiles,
      alias_files: aliasFiles,
      add_command: buildForceAddCommand(canonicalFiles),
    };
  } catch {
    return {
      check: 'checked',
      skip_reason: null,
      files: [],
      canonical_files: [],
      alias_files: [],
      add_command: null,
    };
  }
}

export async function readGitCloseoutSummary(
  cwd: string,
  docpathDir: string,
  taskId: string | undefined,
): Promise<GitCloseoutSummary> {
  try {
    const gitRoot = runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
    const status = runGit(gitRoot, ['status', '--porcelain=v1', '--untracked-files=all']).trim();
    const backlogId = await readLinkedBacklogId(docpathDir, taskId);
    const ignoredEvidence = readIgnoredEvidenceReport(gitRoot, taskId, backlogId);
    const hasWorktreeChanges = status.length > 0;
    const canonicalIgnoredEvidenceCount = ignoredEvidence.canonical_files.length;
    const aliasIgnoredEvidenceCount = ignoredEvidence.alias_files.length;
    return {
      available: true,
      has_worktree_changes: hasWorktreeChanges,
      canonical_ignored_evidence_count: canonicalIgnoredEvidenceCount,
      alias_ignored_evidence_count: aliasIgnoredEvidenceCount,
      needs_closeout: hasWorktreeChanges || canonicalIgnoredEvidenceCount > 0,
    };
  } catch {
    return {
      available: false,
      has_worktree_changes: false,
      canonical_ignored_evidence_count: 0,
      alias_ignored_evidence_count: 0,
      needs_closeout: false,
    };
  }
}
