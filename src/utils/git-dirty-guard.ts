import { execFileSync } from 'node:child_process';

export interface DirtyWorktreeReport {
  isGitRepo: boolean;
  repoRoot: string | null;
  dirty: boolean;
  files: string[];
  docpathFiles: string[];
  nonDocPathFiles: string[];
  staged: number;
  unstaged: number;
  untracked: number;
}

interface ParsedStatusLine {
  file: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface CleanWorktreeOptions {
  allowDirtyPath?: (path: string) => boolean;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function parseStatusLine(line: string): ParsedStatusLine | null {
  if (line.length < 4) return null;
  const x = line[0];
  const y = line[1];
  const rawFile = line.slice(3).trim();
  if (!rawFile) return null;

  return {
    file: normalizeGitPath(rawFile.includes(' -> ') ? rawFile.split(' -> ').at(-1) || rawFile : rawFile),
    staged: x !== ' ' && x !== '?' && x !== '!',
    unstaged: y !== ' ' && y !== '?' && y !== '!',
    untracked: x === '?' && y === '?',
  };
}

function isDocPathManagedPath(path: string): boolean {
  const file = normalizeGitPath(path);
  return file === '.docpath' || file.startsWith('.docpath/');
}

function previewFiles(files: string[]): string[] {
  const preview = files.slice(0, 12);
  if (files.length > preview.length) preview.push(`... ${files.length - preview.length} more`);
  return preview;
}

function formatDirtySummary(report: DirtyWorktreeReport, files: string[]): string {
  const lines = [
    `   changed_files: ${files.length}`,
    `   staged: ${report.staged}`,
    `   unstaged: ${report.unstaged}`,
    `   untracked: ${report.untracked}`,
    '   files:',
    ...previewFiles(files).map((file) => `     - ${file}`),
  ];
  return lines.join('\n');
}

function buildDirtyWorktreeError(command: string, report: DirtyWorktreeReport, files: string[], mode: 'new-task' | 'execution-start'): Error {
  const reason = mode === 'new-task'
    ? '当前 Git worktree 存在未提交变更，拒绝在 dirty worktree 上启动新任务。'
    : '当前 Git worktree 存在非 DocPath 未提交变更，拒绝进入执行步骤。';
  return new Error([
    `${command}: ${reason}`,
    formatDirtySummary(report, files),
    '   先收口当前变更:',
    '     docpath changes --agent',
    '   并行开发请创建隔离 worktree:',
    '     docpath worktree create <slug>',
  ].join('\n'));
}

export function detectDirtyWorktree(cwd: string): DirtyWorktreeReport {
  let repoRoot: string;
  try {
    repoRoot = runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return {
      isGitRepo: false,
      repoRoot: null,
      dirty: false,
      files: [],
      docpathFiles: [],
      nonDocPathFiles: [],
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  const parsed = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLine)
    .filter((line): line is ParsedStatusLine => line !== null);
  const files = Array.from(new Set(parsed.map((line) => line.file))).sort();
  const docpathFiles = files.filter(isDocPathManagedPath);
  const nonDocPathFiles = files.filter((file) => !isDocPathManagedPath(file));

  return {
    isGitRepo: true,
    repoRoot,
    dirty: files.length > 0,
    files,
    docpathFiles,
    nonDocPathFiles,
    staged: parsed.filter((line) => line.staged).length,
    unstaged: parsed.filter((line) => line.unstaged).length,
    untracked: parsed.filter((line) => line.untracked).length,
  };
}

export function assertCleanWorktreeForNewTask(cwd: string, command: string, options: CleanWorktreeOptions = {}): void {
  const report = detectDirtyWorktree(cwd);
  if (!report.isGitRepo || !report.dirty) return;
  const blockedFiles = options.allowDirtyPath
    ? report.files.filter((file) => !options.allowDirtyPath?.(file))
    : report.files;
  if (blockedFiles.length === 0) return;
  throw buildDirtyWorktreeError(command, report, blockedFiles, 'new-task');
}

export function assertNoNonDocPathChangesForExecutionStart(cwd: string, command: string): void {
  const report = detectDirtyWorktree(cwd);
  if (!report.isGitRepo || report.nonDocPathFiles.length === 0) return;
  throw buildDirtyWorktreeError(command, report, report.nonDocPathFiles, 'execution-start');
}
