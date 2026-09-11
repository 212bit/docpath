/**
 * 变更收口报告构建逻辑。
 *
 * 从 commands/changes.ts 下沉，使 utils→commands 反向依赖（git-staging → changes）
 * 转为 utils→utils。changes.ts 仅保留渲染与 CLI 命令入口。
 */

import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';
import { readLastCheckEvidence, readReviewEvidence } from './workspace-evidence.js';
import { existsSync, readFileSync } from 'node:fs';
import { isLinkedGitWorktree } from './git-dirty-guard.js';
import { join } from 'node:path';
import {
  buildForceAddCommand,
  readIgnoredEvidenceReport,
  readLinkedBacklogId,
  readUntrackedCanonicalEvidence,
  runGit,
  SKIPPED_UNTRACKED_EVIDENCE,
  skippedIgnoredEvidenceReport,
  shellQuotePath,
  type IgnoredEvidenceReport,
  type UntrackedEvidenceReport,
} from './git-closeout.js';

export type ChangeGroupName = 'source' | 'tests' | 'docpath' | 'templates_docs' | 'other';

export interface ChangesReportOptions {
  since?: string;
  task?: string;
  scope?: string[];
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

export interface ArtifactPolicyReport {
  canonical_default: boolean;
  canonical_pattern: string;
  current_alias_policy: string;
}

export interface ChangesSelectionReport {
  mode: 'current_task' | 'task' | 'scope';
  selected_task_id: string;
  selected_task_title: string;
  scope_files: string[];
  selected_files: string[];
  outside_selected_task_files: string[];
  outside_selected_task_note: string | null;
}

export interface ChangesReport {
  git_root: string;
  branch: string;
  mode: 'worktree' | 'since';
  since: string | null;
  closeout_context: 'task' | 'taskless_intake' | 'blocked';
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
  artifact_policy: ArtifactPolicyReport;
  selection: ChangesSelectionReport;
  ignored_evidence: IgnoredEvidenceReport;
  untracked_evidence: UntrackedEvidenceReport;
  recommended_stage_command: string | null;
  ready_to_commit: boolean;
  blocking_reasons: string[];
  next_actions: string[];
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

/**
 * R-273 契约（R-289 修正）：merge-mediated 资源（backlog/、rules/、tasks/done/）
 * 在 worktree 内的变更必须随分支提交并合并回 main，属 commit-relevant——
 * 旧名单把它们归为噪音是 symlink（live-shared）时代的语义，会反向引导
 * agent 不提交应合并的 backlog 变更（R-271 家族数据丢失模式）。
 * 只有 isolated 运行时与派生视图算隔离噪音。
 */
function isExpectedWorktreeIsolationNoise(path: string): boolean {
  return path.startsWith('.docpath/workspace/') ||
    path.startsWith('.docpath/tasks/current/') ||
    path.startsWith('.docpath/journal/');
    // R-336: docs.md 已下线不再生成，不再列为隔离噪音
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

function buildSuggestedCommitMessage(
  report: Omit<ChangesReport, 'suggested_commit_message'>,
  stepNotes: string[] = [],
): string {
  const title = report.selection.selected_task_title || report.current_task.task_title || '更新 DocPath 工作流';
  const hasSource = report.groups.source.length > 0;
  const hasTests = report.groups.tests.length > 0;
  const hasDocs = report.groups.templates_docs.length > 0;
  const type = hasSource ? 'feat' : hasTests ? 'test' : hasDocs ? 'docs' : 'chore';
  const subject = `${type}: ${title}`;
  if (stepNotes.length === 0) return subject;
  // R-308 记录收敛：正文由步骤 note 汇编——agent 在 step done 时写过的话
  // 不必在 commit message 里重述，改用建议稿并按需增删。
  return [subject, '', ...stepNotes.map((note) => `- ${note}`)].join('\n');
}

/** R-308: 从 canonical breadcrumb 提取本任务的实质性步骤 note（去重、滤默认噪音、限量）。 */
async function collectTaskStepNotes(docpathDir: string, taskId: string): Promise<string[]> {
  const path = join(docpathDir, 'tasks', taskId, 'breadcrumb.jsonl');
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
    const notes: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { status?: string; context?: string; step?: string };
        const note = (entry.context || '').trim();
        if (entry.status !== 'done' || !note) continue;
        if (/^agent-step: /.test(note) || /^run-end/.test(note) || note === '完成') continue; // 默认噪音
        if (seen.has(note)) continue;
        seen.add(note);
        notes.push(note);
      } catch {
        // 跳过坏行
      }
    }
    return notes.slice(0, 6);
  } catch {
    return [];
  }
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

function isTasklessIntakeCloseoutFile(path: string): boolean {
  return path.startsWith('.docpath/backlog/') ||
    path === '.docpath/backlog' ||
    path.startsWith('.docpath/project-intake/') ||
    path === '.docpath/project-intake';
}

function resolveCloseoutContext(files: ChangedFile[], hasTask: boolean): ChangesReport['closeout_context'] {
  if (hasTask) return 'task';
  if (files.length > 0 && files.every((file) => isTasklessIntakeCloseoutFile(file.path))) {
    return 'taskless_intake';
  }
  return 'blocked';
}

function buildWorktreeIsolationReport(gitRoot: string, files: ChangedFile[], since: string | null): WorktreeIsolationReport {
  const active = !since && isLinkedGitWorktree(gitRoot);
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

function buildArtifactPolicyReport(): ArtifactPolicyReport {
  return {
    canonical_default: true,
    canonical_pattern: '.docpath/tasks/<task_id>/*',
    current_alias_policy: 'tasks/current is a mutable working alias; stage canonical task evidence unless changes --agent explicitly lists current alias files.',
  };
}

function buildBlockingReasons(args: {
  files: ChangedFile[];
  since: string | null;
  closeoutContext: ChangesReport['closeout_context'];
  lastCheckPass: boolean;
  reviewPass: boolean;
  ignoredEvidence: IgnoredEvidenceReport;
  untrackedEvidence: UntrackedEvidenceReport;
}): string[] {
  const blockingReasons: string[] = [];
  if (args.files.length === 0) blockingReasons.push(args.since ? `相对 ${args.since} 没有变更` : '当前工作树没有可提交变更');
  const evidenceFiles = new Set(args.untrackedEvidence.files);
  const otherUntracked = !args.since && args.files.some((file) => {
    if (!file.untracked) return false;
    if (evidenceFiles.has(file.path)) return false;
    if (args.closeoutContext === 'taskless_intake' && isTasklessIntakeCloseoutFile(file.path)) return false;
    return true;
  });
  if (!args.since && args.untrackedEvidence.files.length > 0) {
    blockingReasons.push(`当前任务 ${args.untrackedEvidence.files.length} 个证据文件待 stage（见 recommended_stage_command）`);
  }
  if (otherUntracked) blockingReasons.push('存在未跟踪文件，请确认是否需要纳入提交');
  if (!args.since && args.ignoredEvidence.canonical_files.length > 0) {
    blockingReasons.push('存在被 gitignore 忽略的 DocPath canonical evidence，请使用 git add -f 纳入提交');
  }
  if (args.closeoutContext === 'blocked') {
    blockingReasons.push('当前没有关联的 DocPath 任务');
  }
  if (args.closeoutContext === 'task') {
    if (!args.lastCheckPass) blockingReasons.push('last-check.md 未显示 PASS，请先运行 docpath check');
    if (!args.reviewPass) blockingReasons.push('review.md 未显示通过，请先运行 docpath review');
  }
  return blockingReasons;
}

function buildNextActions(args: {
  blockingReasons: string[];
  closeoutContext: ChangesReport['closeout_context'];
  since: string | null;
  recommendedStageCommand: string | null;
  lastCheckPass: boolean;
  reviewPass: boolean;
}): string[] {
  const actions: string[] = [];
  if (args.recommendedStageCommand) actions.push(args.recommendedStageCommand);
  if (args.closeoutContext === 'task') {
    if (!args.lastCheckPass) actions.push('docpath check');
    if (args.lastCheckPass && !args.reviewPass) {
      actions.push(args.since ? 'docpath review --scope last_commit' : 'docpath review');
    }
  }
  if (args.closeoutContext === 'blocked') {
    actions.push('docpath quick "<title>"');
    actions.push('docpath backlog promote <id>');
  }
  if (args.blockingReasons.length === 0) actions.push('git add <files> && git commit');
  return [...new Set(actions)];
}

function buildRecommendedStageCommand(
  ignoredEvidence: IgnoredEvidenceReport,
  untrackedEvidence: UntrackedEvidenceReport,
): string | null {
  if (ignoredEvidence.canonical_files.length > 0) return 'docpath commit --stage';
  return untrackedEvidence.add_command;
}

function normalizeRepoPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function filterFilesByScope(files: ChangedFile[], scope: string[]): ChangedFile[] {
  if (scope.length === 0) return files;
  const selected = new Set(scope.map(normalizeRepoPath));
  return files.filter((file) => selected.has(file.path));
}

function taskCanonicalPrefixes(taskId: string): string[] {
  if (!taskId) return [];
  return [`.docpath/tasks/${taskId}/`, `.docpath/tasks/done/${taskId}/`];
}

function isTaskCanonicalFile(path: string, taskId: string): boolean {
  return taskCanonicalPrefixes(taskId).some((prefix) => path.startsWith(prefix));
}

function filterIgnoredEvidenceByScope(report: IgnoredEvidenceReport, scope: string[]): IgnoredEvidenceReport {
  if (scope.length === 0 || report.check === 'skipped') return report;
  const selected = new Set(scope.map(normalizeRepoPath));
  const files = report.files.filter((file) => selected.has(file));
  const canonicalFiles = report.canonical_files.filter((file) => selected.has(file));
  const aliasFiles = report.alias_files.filter((file) => selected.has(file));
  return {
    ...report,
    files,
    canonical_files: canonicalFiles,
    alias_files: aliasFiles,
    add_command: buildForceAddCommand(canonicalFiles),
  };
}

function filterUntrackedEvidenceByScope(report: UntrackedEvidenceReport, scope: string[]): UntrackedEvidenceReport {
  if (scope.length === 0) return report;
  const selected = new Set(scope.map(normalizeRepoPath));
  const files = report.files.filter((file) => selected.has(file));
  return {
    files,
    add_command: files.length > 0 ? `git add ${files.map(shellQuotePath).join(' ')}` : null,
  };
}

function readTaskTitle(docpathDir: string, taskId: string): string {
  if (!taskId) return '';
  const specJsonPath = join(docpathDir, 'tasks', taskId, 'spec.json');
  if (existsSync(specJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(specJsonPath, 'utf-8')) as { title?: unknown };
      if (typeof parsed.title === 'string' && parsed.title.trim()) {
        return parsed.title.replace(new RegExp(`^${taskId}\\s+-\\s+`), '').trim();
      }
    } catch {
      // Fall through to spec.md.
    }
  }
  const specMdPath = join(docpathDir, 'tasks', taskId, 'spec.md');
  if (existsSync(specMdPath)) {
    const match = readFileSync(specMdPath, 'utf-8').match(/^#\s+(.+)$/m);
    if (match) return match[1].replace(new RegExp(`^${taskId}\\s+-\\s+`), '').trim();
  }
  return taskId;
}

function buildSelectionReport(args: {
  files: ChangedFile[];
  selectedTaskId: string;
  selectedTaskTitle: string;
  scope: string[];
  explicitTask: boolean;
}): ChangesSelectionReport {
  const scopeFiles = args.scope.map(normalizeRepoPath).filter(Boolean);
  if (scopeFiles.length > 0) {
    return {
      mode: 'scope',
      selected_task_id: args.selectedTaskId,
      selected_task_title: args.selectedTaskTitle,
      scope_files: scopeFiles,
      selected_files: args.files.map((file) => file.path),
      outside_selected_task_files: [],
      outside_selected_task_note: null,
    };
  }

  const selectedFiles = args.files
    .filter((file) => isTaskCanonicalFile(file.path, args.selectedTaskId))
    .map((file) => file.path);
  const outsideFiles = args.files
    .filter((file) => !isTaskCanonicalFile(file.path, args.selectedTaskId))
    .map((file) => file.path);
  return {
    mode: args.explicitTask ? 'task' : 'current_task',
    selected_task_id: args.selectedTaskId,
    selected_task_title: args.selectedTaskTitle,
    scope_files: [],
    selected_files: selectedFiles,
    outside_selected_task_files: outsideFiles,
    outside_selected_task_note: outsideFiles.length > 0
      ? 'These files may not belong to the selected task; split commits or use --scope to close out an explicit file set.'
      : null,
  };
}

export async function buildChangesReport(cwd: string, options: ChangesReportOptions = {}): Promise<ChangesReport> {
  const gitRoot = ensureGitRepo(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readCurrentState(cwd);
  const since = await resolveSinceRef(docpathDir, options.since);
  const scope = (options.scope || []).map(normalizeRepoPath).filter(Boolean);
  const allFiles = since
    ? parseNameStatus(runGit(cwd, ['diff', '--name-status', since, '--']))
    : parsePorcelainStatus(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
  const files = filterFilesByScope(allFiles, scope);
  const groups = groupChangedFiles(files);
  const worktreeIsolation = buildWorktreeIsolationReport(gitRoot, files, since);
  const selectedTaskId = options.task?.trim() || current?.task_id || '';
  const selectedTaskTitle = options.task?.trim()
    ? readTaskTitle(docpathDir, selectedTaskId)
    : current?.task_title || '';
  const selection = buildSelectionReport({
    files,
    selectedTaskId,
    selectedTaskTitle,
    scope,
    explicitTask: Boolean(options.task?.trim()),
  });
  const backlogId = await readLinkedBacklogId(docpathDir, selectedTaskId);
  const ignoredEvidence = since
    ? skippedIgnoredEvidenceReport('since mode summarizes committed diff and skips pre-commit ignored evidence readiness')
    : filterIgnoredEvidenceByScope(readIgnoredEvidenceReport(gitRoot, selectedTaskId, backlogId), scope);
  const untrackedEvidence = since
    ? SKIPPED_UNTRACKED_EVIDENCE
    : filterUntrackedEvidenceByScope(readUntrackedCanonicalEvidence(gitRoot, selectedTaskId), scope);
  const closeoutContext = resolveCloseoutContext(files, !!current?.task_id);
  const lastCheckPass = await readLastCheckPass(docpathDir);
  const reviewPass = await readReviewPass(docpathDir);
  const recommendedStageCommand = buildRecommendedStageCommand(ignoredEvidence, untrackedEvidence);
  const blockingReasons = buildBlockingReasons({
    files,
    since,
    closeoutContext,
    lastCheckPass,
    reviewPass,
    ignoredEvidence,
    untrackedEvidence,
  });
  const nextActions = buildNextActions({
    blockingReasons,
    closeoutContext,
    since,
    recommendedStageCommand,
    lastCheckPass,
    reviewPass,
  });

  const partial: Omit<ChangesReport, 'suggested_commit_message'> = {
    git_root: gitRoot,
    branch: currentBranch(cwd),
    mode: since ? 'since' : 'worktree',
    since,
    closeout_context: closeoutContext,
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
    artifact_policy: buildArtifactPolicyReport(),
    selection,
    ignored_evidence: ignoredEvidence,
    untracked_evidence: untrackedEvidence,
    recommended_stage_command: recommendedStageCommand,
    ready_to_commit: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    next_actions: nextActions,
  };

  return {
    ...partial,
    suggested_commit_message: buildSuggestedCommitMessage(
      partial,
      partial.selection.selected_task_id
        ? await collectTaskStepNotes(docpathDir, partial.selection.selected_task_id)
        : [],
    ),
  };
}
