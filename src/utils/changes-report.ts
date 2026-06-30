/**
 * 变更收口报告构建逻辑。
 *
 * 从 commands/changes.ts 下沉，使 utils→commands 反向依赖（git-staging → changes）
 * 转为 utils→utils。changes.ts 仅保留渲染与 CLI 命令入口。
 */

import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';
import { readLastCheckEvidence, readReviewEvidence } from './workspace-evidence.js';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
  readIgnoredEvidenceReport,
  readLinkedBacklogId,
  readUntrackedCanonicalEvidence,
  runGit,
  SKIPPED_UNTRACKED_EVIDENCE,
  skippedIgnoredEvidenceReport,
  type IgnoredEvidenceReport,
  type UntrackedEvidenceReport,
} from './git-closeout.js';

export type ChangeGroupName = 'source' | 'tests' | 'docpath' | 'templates_docs' | 'other';

export interface ChangesReportOptions {
  since?: string;
}

interface ChangedFile {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  group: ChangeGroupName;
}

export interface WorktreeIsolationReport {
  active: boolean;
  expected_noise_count: number;
  expected_noise_files: string[];
  commit_relevant_count: number;
  commit_relevant_files: string[];
  note: string | null;
}

export interface ChangesReport {
  git_root: string;
  branch: string;
  mode: 'worktree' | 'since';
  since: string | null;
  current_task: {
    task_id: string;
    task_title: string;
    phase: string;
    gate: string;
  };
  counts: {
    total: number;
    staged: number;
    unstaged: number;
    untracked: number;
  };
  groups: Record<ChangeGroupName, string[]>;
  worktree_isolation: WorktreeIsolationReport;
  ignored_evidence: IgnoredEvidenceReport;
  untracked_evidence: UntrackedEvidenceReport;
  recommended_stage_command: string | null;
  ready_to_commit: boolean;
  blocking_reasons: string[];
  suggested_commit_message: string;
}

function ensureGitRepo(cwd: string): string {
  try {
    return runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    throw new Error('docpath changes: 当前目录不是 git 仓库，无法生成变更收口视图');
  }
}

function currentBranch(cwd: string): string {
  try {
    return runGit(cwd, ['branch', '--show-current']).trim() || 'HEAD';
  } catch {
    return 'unknown';
  }
}

function classifyPath(path: string): ChangeGroupName {
  if (path.startsWith('.docpath/')) return 'docpath';
  if (
    path.startsWith('tests/') ||
    path.includes('/tests/') ||
    /(^|[.\-/])test\.(mjs|js|ts|tsx|jsx)$/.test(path) ||
    /\.(test|spec)\.(mjs|js|ts|tsx|jsx)$/.test(path)
  ) return 'tests';
  if (
    path.startsWith('templates/') ||
    path.startsWith('docs/') ||
    path.endsWith('.md') ||
    path === 'AGENTS.md' ||
    path === 'CODEX.md' ||
    path === 'CLAUDE.md' ||
    path === 'OPENCODE.md'
  ) return 'templates_docs';
  if (
    path.startsWith('src/') ||
    path.startsWith('bin/') ||
    path.endsWith('.ts') ||
    path.endsWith('.js') ||
    path.endsWith('.mjs') ||
    path.endsWith('.json')
  ) return 'source';
  return 'other';
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isDocpathWorktree(gitRoot: string): boolean {
  return existsSync(join(gitRoot, '.git')) &&
    isSymlink(join(gitRoot, '.docpath', 'backlog')) &&
    isSymlink(join(gitRoot, '.docpath', 'rules'));
}

function isExpectedWorktreeIsolationNoise(path: string): boolean {
  return path.startsWith('.docpath/backlog/') ||
    path === '.docpath/backlog' ||
    path.startsWith('.docpath/rules/') ||
    path === '.docpath/rules' ||
    path === '.docpath/docs.md' ||
    path.startsWith('.docpath/workspace/') ||
    /^\.docpath\/tasks\/done\/T-[^/]+\/(?:spec|plan)\.(?:md|json)$/.test(path);
}

function parsePorcelainStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const index = line[0] || ' ';
      const worktree = line[1] || ' ';
      const rawPath = line.slice(3).trim();
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) || rawPath : rawPath;
      const untracked = index === '?' && worktree === '?';
      return {
        path,
        index,
        worktree,
        staged: !untracked && index !== ' ',
        unstaged: !untracked && worktree !== ' ',
        untracked,
        group: classifyPath(path),
      };
    });
}

function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t').filter(Boolean);
      const status = parts[0] || 'M';
      const path = parts.at(-1) || '';
      return {
        path,
        index: status[0] || 'M',
        worktree: ' ',
        staged: true,
        unstaged: false,
        untracked: false,
        group: classifyPath(path),
      };
    });
}

async function resolveSinceRef(docpathDir: string, since?: string): Promise<string | null> {
  if (!since) return null;
  if (since !== 'last-check') return since;
  const evidence = await readLastCheckEvidence(docpathDir);
  return evidence?.git?.ref || 'HEAD';
}

async function readLastCheckPass(docpathDir: string): Promise<boolean> {
  const evidence = await readLastCheckEvidence(docpathDir);
  return evidence?.passed === true;
}

async function readReviewPass(docpathDir: string): Promise<boolean> {
  const evidence = await readReviewEvidence(docpathDir);
  return evidence?.approved === true;
}

function buildSuggestedCommitMessage(report: Omit<ChangesReport, 'suggested_commit_message'>): string {
  const title = report.current_task.task_title || '更新 DocPath 工作流';
  const hasSource = report.groups.source.length > 0;
  const hasTests = report.groups.tests.length > 0;
  const hasDocs = report.groups.templates_docs.length > 0;
  const type = hasSource ? 'feat' : hasTests ? 'test' : hasDocs ? 'docs' : 'chore';
  return `${type}: ${title}`;
}

function groupChangedFiles(files: ChangedFile[]): Record<ChangeGroupName, string[]> {
  const groups: Record<ChangeGroupName, string[]> = {
    source: [],
    tests: [],
    docpath: [],
    templates_docs: [],
    other: [],
  };
  for (const file of files) groups[file.group].push(file.path);
  return groups;
}

function buildWorktreeIsolationReport(gitRoot: string, files: ChangedFile[], since: string | null): WorktreeIsolationReport {
  const active = !since && isDocpathWorktree(gitRoot);
  if (!active) {
    return {
      active: false,
      expected_noise_count: 0,
      expected_noise_files: [],
      commit_relevant_count: files.length,
      commit_relevant_files: files.map((file) => file.path),
      note: null,
    };
  }

  const expectedNoise = files
    .filter((file) => isExpectedWorktreeIsolationNoise(file.path))
    .map((file) => file.path);
  const commitRelevant = files
    .filter((file) => !isExpectedWorktreeIsolationNoise(file.path))
    .map((file) => file.path);
  return {
    active: true,
    expected_noise_count: expectedNoise.length,
    expected_noise_files: expectedNoise,
    commit_relevant_count: commitRelevant.length,
    commit_relevant_files: commitRelevant,
    note: expectedNoise.length > 0
      ? 'Expected worktree .docpath isolation noise is reported separately; review commit_relevant_files for normal staging scope.'
      : 'DocPath worktree detected; no expected isolation noise found.',
  };
}

function buildBlockingReasons(args: {
  files: ChangedFile[];
  since: string | null;
  hasTask: boolean;
  lastCheckPass: boolean;
  reviewPass: boolean;
  ignoredEvidence: IgnoredEvidenceReport;
  untrackedEvidence: UntrackedEvidenceReport;
}): string[] {
  const blockingReasons: string[] = [];
  if (args.files.length === 0) blockingReasons.push(args.since ? `相对 ${args.since} 没有变更` : '当前工作树没有可提交变更');
  const evidenceFiles = new Set(args.untrackedEvidence.files);
  const otherUntracked = !args.since && args.files.some((file) => file.untracked && !evidenceFiles.has(file.path));
  if (!args.since && args.untrackedEvidence.files.length > 0) {
    blockingReasons.push(`当前任务 ${args.untrackedEvidence.files.length} 个证据文件待 stage（见 recommended_stage_command）`);
  }
  if (otherUntracked) blockingReasons.push('存在未跟踪文件，请确认是否需要纳入提交');
  if (!args.since && args.ignoredEvidence.canonical_files.length > 0) {
    blockingReasons.push('存在被 gitignore 忽略的 DocPath canonical evidence，请使用 git add -f 纳入提交');
  }
  if (!args.hasTask) blockingReasons.push('当前没有关联的 DocPath 任务');
  if (!args.lastCheckPass) blockingReasons.push('last-check.md 未显示 PASS，请先运行 docpath check');
  if (!args.reviewPass) blockingReasons.push('review.md 未显示通过，请先运行 docpath review');
  return blockingReasons;
}

function buildRecommendedStageCommand(
  ignoredEvidence: IgnoredEvidenceReport,
  untrackedEvidence: UntrackedEvidenceReport,
): string | null {
  if (ignoredEvidence.canonical_files.length > 0) return 'docpath commit --stage';
  return untrackedEvidence.add_command;
}

export async function buildChangesReport(cwd: string, options: ChangesReportOptions = {}): Promise<ChangesReport> {
  const gitRoot = ensureGitRepo(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readCurrentState(cwd);
  const since = await resolveSinceRef(docpathDir, options.since);
  const files = since
    ? parseNameStatus(runGit(cwd, ['diff', '--name-status', since, '--']))
    : parsePorcelainStatus(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
  const groups = groupChangedFiles(files);
  const worktreeIsolation = buildWorktreeIsolationReport(gitRoot, files, since);
  const backlogId = await readLinkedBacklogId(docpathDir, current?.task_id);
  const ignoredEvidence = since
    ? skippedIgnoredEvidenceReport('since mode summarizes committed diff and skips pre-commit ignored evidence readiness')
    : readIgnoredEvidenceReport(gitRoot, current?.task_id, backlogId);
  const untrackedEvidence = since
    ? SKIPPED_UNTRACKED_EVIDENCE
    : readUntrackedCanonicalEvidence(gitRoot, current?.task_id);
  const blockingReasons = buildBlockingReasons({
    files,
    since,
    hasTask: !!current?.task_id,
    lastCheckPass: await readLastCheckPass(docpathDir),
    reviewPass: await readReviewPass(docpathDir),
    ignoredEvidence,
    untrackedEvidence,
  });

  const partial: Omit<ChangesReport, 'suggested_commit_message'> = {
    git_root: gitRoot,
    branch: currentBranch(cwd),
    mode: since ? 'since' : 'worktree',
    since,
    current_task: {
      task_id: current?.task_id || '',
      task_title: current?.task_title || '',
      phase: current?.phase || 'unknown',
      gate: current?.gate || 'none',
    },
    counts: {
      total: files.length,
      staged: files.filter((file) => file.staged).length,
      unstaged: files.filter((file) => file.unstaged).length,
      untracked: files.filter((file) => file.untracked).length,
    },
    groups,
    worktree_isolation: worktreeIsolation,
    ignored_evidence: ignoredEvidence,
    untracked_evidence: untrackedEvidence,
    recommended_stage_command: buildRecommendedStageCommand(ignoredEvidence, untrackedEvidence),
    ready_to_commit: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
  };

  return {
    ...partial,
    suggested_commit_message: buildSuggestedCommitMessage(partial),
  };
}
