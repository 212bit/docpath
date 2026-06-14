/**
 * docpath changes — 提交前只读变更收口视图。
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';

interface ChangesOptions {
  cwd: string;
  agent?: boolean;
  json?: boolean;
  since?: string;
}

export type ChangeGroupName = 'source' | 'tests' | 'docpath' | 'templates_docs' | 'other';

interface ChangedFile {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  group: ChangeGroupName;
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
  ignored_evidence: {
    files: string[];
    add_command: string | null;
  };
  ready_to_commit: boolean;
  blocking_reasons: string[];
  suggested_commit_message: string;
}

const GROUP_LABELS: Record<ChangeGroupName, string> = {
  source: '源码',
  tests: '测试',
  docpath: 'DocPath 运行态',
  templates_docs: '模板/文档',
  other: '其他',
};

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  const raw = await readFileSafe(join(docpathDir, 'workspace', 'last-check.md'));
  const ref = raw?.match(/(?:git_ref|ref|commit):\s*`?([a-f0-9]{7,40}|HEAD(?:~\d+)?|[\w./-]+)`?/i)?.[1];
  return ref || 'HEAD';
}

async function readLastCheckPass(docpathDir: string): Promise<boolean> {
  const raw = await readFileSafe(join(docpathDir, 'workspace', 'last-check.md'));
  if (!raw) return false;
  return /✅\s*PASS|PASS/i.test(raw) && !/FAIL|失败/i.test(raw);
}

async function readReviewPass(docpathDir: string): Promise<boolean> {
  const raw = await readFileSafe(join(docpathDir, 'workspace', 'review.md'));
  if (!raw) return false;
  if (/❌|FAIL|request-changes|\[ERROR\]|[1-9]\d*\s*错误/i.test(raw)) return false;
  return true;
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

function shellQuotePath(path: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

function buildForceAddCommand(files: string[]): string | null {
  if (files.length === 0) return null;
  return `git add -f ${files.map(shellQuotePath).join(' ')}`;
}

async function readLinkedBacklogId(docpathDir: string, taskId: string | undefined): Promise<string | null> {
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

function readIgnoredEvidenceFiles(gitRoot: string, taskId: string | undefined, backlogId: string | null): string[] {
  const paths = [
    '.docpath/backlog/backlog.md',
    ...(backlogId ? [`.docpath/backlog/${backlogId}.md`] : []),
    '.docpath/tasks/current',
    ...(taskId ? [`.docpath/tasks/${taskId}`, `.docpath/tasks/done/${taskId}`] : []),
  ];
  try {
    return Array.from(new Set(
      runGit(gitRoot, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...paths])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((file) => !file.endsWith('/')),
    )).sort();
  } catch {
    return [];
  }
}

function buildBlockingReasons(args: {
  files: ChangedFile[];
  since: string | null;
  hasTask: boolean;
  lastCheckPass: boolean;
  reviewPass: boolean;
  ignoredEvidenceFiles: string[];
}): string[] {
  const blockingReasons: string[] = [];
  if (args.files.length === 0) blockingReasons.push(args.since ? `相对 ${args.since} 没有变更` : '当前工作树没有可提交变更');
  if (!args.since && args.files.some((file) => file.untracked)) blockingReasons.push('存在未跟踪文件，请确认是否需要纳入提交');
  if (!args.since && args.ignoredEvidenceFiles.length > 0) {
    blockingReasons.push('存在被 gitignore 忽略的 DocPath evidence，请使用 git add -f 纳入提交');
  }
  if (!args.hasTask) blockingReasons.push('当前没有关联的 DocPath 任务');
  if (!args.lastCheckPass) blockingReasons.push('last-check.md 未显示 PASS，请先运行 docpath check');
  if (!args.reviewPass) blockingReasons.push('review.md 未显示通过，请先运行 docpath review');
  return blockingReasons;
}

export async function buildChangesReport(cwd: string, options: Pick<ChangesOptions, 'since'> = {}): Promise<ChangesReport> {
  const gitRoot = ensureGitRepo(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readCurrentState(cwd);
  const since = await resolveSinceRef(docpathDir, options.since);
  const files = since
    ? parseNameStatus(runGit(cwd, ['diff', '--name-status', since, '--']))
    : parsePorcelainStatus(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
  const groups = groupChangedFiles(files);
  const backlogId = await readLinkedBacklogId(docpathDir, current?.task_id);
  const ignoredEvidenceFiles = since ? [] : readIgnoredEvidenceFiles(gitRoot, current?.task_id, backlogId);
  const blockingReasons = buildBlockingReasons({
    files,
    since,
    hasTask: !!current?.task_id,
    lastCheckPass: await readLastCheckPass(docpathDir),
    reviewPass: await readReviewPass(docpathDir),
    ignoredEvidenceFiles,
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
    ignored_evidence: {
      files: ignoredEvidenceFiles,
      add_command: buildForceAddCommand(ignoredEvidenceFiles),
    },
    ready_to_commit: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
  };

  return {
    ...partial,
    suggested_commit_message: buildSuggestedCommitMessage(partial),
  };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderAgentYaml(report: ChangesReport): string {
  const lines: string[] = [];
  lines.push(`ready_to_commit: ${report.ready_to_commit}`);
  lines.push(`branch: ${yamlString(report.branch)}`);
  lines.push(`git_root: ${yamlString(report.git_root)}`);
  lines.push(`mode: ${yamlString(report.mode)}`);
  lines.push(`since: ${report.since === null ? 'null' : yamlString(report.since)}`);
  lines.push('current_task:');
  lines.push(`  task_id: ${yamlString(report.current_task.task_id)}`);
  lines.push(`  task_title: ${yamlString(report.current_task.task_title)}`);
  lines.push(`  phase: ${yamlString(report.current_task.phase)}`);
  lines.push(`  gate: ${yamlString(report.current_task.gate)}`);
  lines.push('counts:');
  lines.push(`  total: ${report.counts.total}`);
  lines.push(`  staged: ${report.counts.staged}`);
  lines.push(`  unstaged: ${report.counts.unstaged}`);
  lines.push(`  untracked: ${report.counts.untracked}`);
  lines.push('groups:');
  for (const group of Object.keys(GROUP_LABELS) as ChangeGroupName[]) {
    lines.push(`  ${group}:`);
    for (const file of report.groups[group]) lines.push(`    - ${yamlString(file)}`);
  }
  lines.push('ignored_evidence:');
  lines.push(`  count: ${report.ignored_evidence.files.length}`);
  lines.push('  files:');
  for (const file of report.ignored_evidence.files) lines.push(`    - ${yamlString(file)}`);
  lines.push(`  add_command: ${report.ignored_evidence.add_command === null ? 'null' : yamlString(report.ignored_evidence.add_command)}`);
  lines.push('blocking_reasons:');
  for (const reason of report.blocking_reasons) lines.push(`  - ${yamlString(reason)}`);
  lines.push(`suggested_commit_message: ${yamlString(report.suggested_commit_message)}`);
  return `${lines.join('\n')}\n`;
}

function renderHuman(report: ChangesReport): string {
  const lines: string[] = [];
  lines.push('\n📦  DocPath 变更收口\n');
  lines.push(`  分支: ${report.branch}`);
  if (report.since) lines.push(`  基线: ${report.since}`);
  lines.push(`  任务: ${report.current_task.task_id || '-'} ${report.current_task.task_title || ''}`.trimEnd());
  lines.push(`  变更: ${report.counts.total} 个文件（staged ${report.counts.staged}, unstaged ${report.counts.unstaged}, untracked ${report.counts.untracked}）`);
  lines.push(`  提交状态: ${report.ready_to_commit ? '✅ ready' : '⚠️ blocked'}`);
  lines.push('');

  for (const group of Object.keys(GROUP_LABELS) as ChangeGroupName[]) {
    const files = report.groups[group];
    if (files.length === 0) continue;
    lines.push(`  ${GROUP_LABELS[group]} (${files.length})`);
    for (const file of files) lines.push(`    - ${file}`);
  }

  if (report.ignored_evidence.files.length > 0) {
    lines.push(`\n  被 gitignore 忽略的 DocPath evidence (${report.ignored_evidence.files.length})`);
    for (const file of report.ignored_evidence.files) lines.push(`    - ${file}`);
    if (report.ignored_evidence.add_command) {
      lines.push('  提交提示');
      lines.push(`    ${report.ignored_evidence.add_command}`);
    }
  }

  if (report.blocking_reasons.length > 0) {
    lines.push('\n  阻塞原因');
    for (const reason of report.blocking_reasons) lines.push(`    - ${reason}`);
  }

  lines.push('\n  建议 commit message');
  lines.push(`    ${report.suggested_commit_message}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function changesCommand(options: ChangesOptions): Promise<void> {
  const report = await buildChangesReport(options.cwd, { since: options.since });
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  process.stdout.write(options.agent ? renderAgentYaml(report) : renderHuman(report));
}
