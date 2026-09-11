import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { gitSync } from './git-run.js';
import { join } from 'node:path';
import { minimatch } from 'minimatch';
import { buildChangesReport } from './changes-report.js';

export interface StageOptions {
  dryRun: boolean;
  includePatterns?: string[];
  cwd: string;
}

export interface StageResult {
  success: boolean;
  stagedFiles: string[];
  forceAddedFiles: string[];
  skippedFiles: string[];
  errors: string[];
}

interface StageCandidate {
  path: string;
  force: boolean;
}

function isTaskCurrentAlias(file: string): boolean {
  return file.startsWith('.docpath/tasks/current/');
}

function uniqueCandidates(candidates: StageCandidate[]): StageCandidate[] {
  const byPath = new Map<string, StageCandidate>();
  for (const candidate of candidates) {
    const existing = byPath.get(candidate.path);
    byPath.set(candidate.path, {
      path: candidate.path,
      force: Boolean(existing?.force || candidate.force),
    });
  }
  return [...byPath.values()];
}

function isIgnored(cwd: string, file: string): boolean {
  try {
    gitSync(cwd, ['check-ignore', '-q', '--no-index', '--', file]);
    return true;
  } catch {
    return false;
  }
}

async function getRecommendedFiles(cwd: string): Promise<StageCandidate[]> {
  try {
    const report = await buildChangesReport(cwd);
    const normalFiles = report.worktree_isolation.active
      ? report.worktree_isolation.commit_relevant_files
      : Object.values(report.groups).flat();
    const normalCandidates = normalFiles
      .filter((file) => !isTaskCurrentAlias(file))
      .map((file) => ({ path: file, force: isIgnored(cwd, file) }));
    const canonicalEvidenceCandidates = report.ignored_evidence.canonical_files
      .filter((file) => !isTaskCurrentAlias(file))
      .map((file) => ({ path: file, force: true }));
    return uniqueCandidates([...normalCandidates, ...canonicalEvidenceCandidates]);
  } catch {
    try {
      const modifiedFiles = execSync('git diff --name-only HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim().split('\n').filter(Boolean);

      return modifiedFiles
        .filter((file) => file.startsWith('.docpath/') && !isTaskCurrentAlias(file))
        .map((file) => ({ path: file, force: false }));
    } catch {
      return [];
    }
  }
}

/**
 * Get files matching include patterns
 */
function getIncludedFiles(cwd: string, patterns: string[]): string[] {
  try {
    // Get all modified and untracked files
    const modifiedFiles = execSync('git diff --name-only HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim().split('\n').filter(Boolean);

    const untrackedFiles = execSync('git ls-files --others --exclude-standard', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim().split('\n').filter(Boolean);

    const allFiles = [...modifiedFiles, ...untrackedFiles];

    // Match files against patterns
    const matchedFiles: string[] = [];
    for (const file of allFiles) {
      for (const pattern of patterns) {
        if (minimatch(file, pattern, { dot: true })) {
          matchedFiles.push(file);
          break;
        }
      }
    }

    return [...new Set(matchedFiles)];
  } catch {
    return [];
  }
}

/**
 * Stage recommended files with optional include patterns
 */
export async function stageRecommendedFiles(options: StageOptions): Promise<StageResult> {
  const result: StageResult = {
    success: true,
    stagedFiles: [],
    forceAddedFiles: [],
    skippedFiles: [],
    errors: [],
  };

  try {
    const recommendedFiles = await getRecommendedFiles(options.cwd);

    // Get additional included files
    let includedFiles: string[] = [];
    if (options.includePatterns && options.includePatterns.length > 0) {
      includedFiles = getIncludedFiles(options.cwd, options.includePatterns);
    }

    // Combine and deduplicate
    const filesToStage = uniqueCandidates([
      ...recommendedFiles,
      ...includedFiles.map((file) => ({ path: file, force: false })),
    ]);

    if (filesToStage.length === 0) {
      result.errors.push('No files to stage');
      result.success = false;
      return result;
    }

    // Check which files actually exist and are modified
    const validFiles: StageCandidate[] = [];
    for (const candidate of filesToStage) {
      const file = candidate.path;
      try {
        const status = candidate.force
          ? (existsSync(join(options.cwd, file)) ? 'ignored' : '')
          : gitSync(options.cwd, ['status', '--porcelain', '--', file]).trim();

        if (status) {
          validFiles.push(candidate);
        } else {
          result.skippedFiles.push(`${file} (not modified)`);
        }
      } catch {
        result.skippedFiles.push(`${file} (not found)`);
      }
    }

    if (validFiles.length === 0) {
      result.errors.push('No valid files to stage');
      result.success = false;
      return result;
    }

    if (options.dryRun) {
      result.stagedFiles = validFiles.map((candidate) => candidate.path);
      result.forceAddedFiles = validFiles.filter((candidate) => candidate.force).map((candidate) => candidate.path);
      return result;
    }

    // Actually stage the files
    for (const candidate of validFiles) {
      const file = candidate.path;
      try {
        gitSync(options.cwd, ['add', ...(candidate.force ? ['-f'] : []), '--', file]);
        result.stagedFiles.push(file);
        if (candidate.force) result.forceAddedFiles.push(file);
      } catch (error) {
        result.errors.push(`Failed to stage ${file}: ${error instanceof Error ? error.message : String(error)}`);
        result.success = false;
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Staging failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Get currently staged files
 */
export function getStagedFiles(cwd: string): string[] {
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Format stage result for display
 */
export function formatStageResult(result: StageResult, dryRun: boolean): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push('📋 Files to be staged:');
  } else {
    lines.push('🔄 Staging files...\n');
  }

  if (result.stagedFiles.length > 0) {
    result.stagedFiles.forEach(file => {
      const force = result.forceAddedFiles.includes(file) ? ' (force-add canonical evidence)' : '';
      lines.push(`  ${dryRun ? '→' : '✅'} ${file}${force}`);
    });
  }

  if (result.skippedFiles.length > 0) {
    lines.push('\n⚠️  Skipped:');
    result.skippedFiles.forEach(file => {
      lines.push(`  • ${file}`);
    });
  }

  if (result.errors.length > 0) {
    lines.push('\n❌ Errors:');
    result.errors.forEach(err => {
      lines.push(`  • ${err}`);
    });
  }

  if (!dryRun && result.success && result.stagedFiles.length > 0) {
    lines.push(`\n✅ Staged ${result.stagedFiles.length} file(s)`);
  }

  return lines.join('\n');
}
