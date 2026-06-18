import { execFileSync } from 'node:child_process';

export interface GitHygieneReport {
  isGitRepo: boolean;
  repoRoot: string | null;
  trackedIgnoredFiles: string[];
  trackedIgnoredRuntimeFiles: string[];
  trackedIgnoredNonRuntimeFiles: string[];
  cleanupCommand: string | null;
}

export interface GitHygieneCleanupResult {
  initialReport: GitHygieneReport;
  finalReport: GitHygieneReport;
  untrackedFiles: string[];
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function isDocPathRuntimeNoisePath(path: string): boolean {
  const file = normalizeGitPath(path);
  return file === '.docpath/.install-meta.json'
    || file === '.docpath/workspace'
    || file.startsWith('.docpath/workspace/')
    || file === '.docpath/tasks/current'
    || file.startsWith('.docpath/tasks/current/')
    || file === '.worktrees'
    || file.startsWith('.worktrees/');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildCleanupCommand(files: string[]): string | null {
  if (files.length === 0) return null;
  return `git rm --cached -- ${files.map(shellQuote).join(' ')}`;
}

function readTrackedIgnoredFiles(repoRoot: string): string[] {
  const out = execFileSync('git', ['ls-files', '-ci', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\0')
    .map((file) => normalizeGitPath(file.trim()))
    .filter(Boolean)
    .sort();
}

export function detectGitHygiene(cwd: string): GitHygieneReport {
  let repoRoot: string;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return {
      isGitRepo: false,
      repoRoot: null,
      trackedIgnoredFiles: [],
      trackedIgnoredRuntimeFiles: [],
      trackedIgnoredNonRuntimeFiles: [],
      cleanupCommand: null,
    };
  }

  const trackedIgnoredFiles = readTrackedIgnoredFiles(repoRoot);
  const trackedIgnoredRuntimeFiles = trackedIgnoredFiles.filter(isDocPathRuntimeNoisePath);
  const trackedIgnoredNonRuntimeFiles = trackedIgnoredFiles
    .filter((file) => file.startsWith('.docpath/') || file.startsWith('.worktrees/'))
    .filter((file) => !isDocPathRuntimeNoisePath(file));

  return {
    isGitRepo: true,
    repoRoot,
    trackedIgnoredFiles,
    trackedIgnoredRuntimeFiles,
    trackedIgnoredNonRuntimeFiles,
    cleanupCommand: buildCleanupCommand(trackedIgnoredRuntimeFiles),
  };
}

export function untrackGitRuntimeNoise(cwd: string): GitHygieneCleanupResult {
  const initialReport = detectGitHygiene(cwd);
  const repoRoot = initialReport.repoRoot;
  const untrackedFiles = initialReport.trackedIgnoredRuntimeFiles;

  if (!initialReport.isGitRepo || !repoRoot || untrackedFiles.length === 0) {
    return {
      initialReport,
      finalReport: initialReport,
      untrackedFiles: [],
    };
  }

  execFileSync('git', ['rm', '--cached', '--', ...untrackedFiles], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    initialReport,
    finalReport: detectGitHygiene(repoRoot),
    untrackedFiles,
  };
}
