import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runShellSyncOrThrow } from './run-tool.js';

function gitOut(cwd: string, command: string): string {
  return runShellSyncOrThrow(command, {
    cwd,
    timeoutMs: 30_000,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    offline: false,
  });
}

export interface GitSafetyResult {
  safe: boolean;
  isDetachedHead: boolean;
  isMergeInProgress: boolean;
  isRebaseInProgress: boolean;
  isCherryPickInProgress: boolean;
  hasConflicts: boolean;
  untrackedImportantFiles: string[];
  currentBranch: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Check Git repository safety before performing operations
 *
 * @param stagingCandidates R-347: 即将被 stage 的文件（changes report 分组平铺）。
 *   出现在候选集里的未跟踪源码文件已被任务归属，不再视为「重要未跟踪文件」——
 *   否则 `commit --stage` 会拒绝 `changes --agent` 刚推荐的文件，口径打架。
 */
export function checkGitSafety(cwd: string, stagingCandidates: readonly string[] = []): GitSafetyResult {
  const result: GitSafetyResult = {
    safe: true,
    isDetachedHead: false,
    isMergeInProgress: false,
    isRebaseInProgress: false,
    isCherryPickInProgress: false,
    hasConflicts: false,
    untrackedImportantFiles: [],
    currentBranch: null,
    errors: [],
    warnings: [],
  };

  try {
    // Check if in a git repository
    try {
      gitOut(cwd, 'git rev-parse --git-dir');
    } catch {
      result.safe = false;
      result.errors.push('Not in a git repository');
      return result;
    }

    // Check for detached HEAD
    try {
      const head = gitOut(cwd, 'git symbolic-ref -q HEAD').trim();
      result.currentBranch = head.replace('refs/heads/', '');
    } catch {
      result.isDetachedHead = true;
      result.safe = false;
      result.errors.push('Detached HEAD state - cannot commit');
    }

    // Check for merge in progress
    const gitDir = gitOut(cwd, 'git rev-parse --git-dir').trim();
    const indexLockPath = join(cwd, gitDir, 'index.lock');
    if (existsSync(indexLockPath)) {
      result.safe = false;
      result.errors.push('Git index.lock exists - another git operation is in progress or lock is stale');
    }

    // Check author configuration
    let hasUserEmail = false;
    let hasUserName = false;
    try {
      hasUserEmail = !!gitOut(cwd, 'git config user.email').trim();
    } catch {}
    try {
      hasUserName = !!gitOut(cwd, 'git config user.name').trim();
    } catch {}
    if (!hasUserEmail || !hasUserName) {
      result.safe = false;
      result.errors.push(
        `Git author identity is missing (name: ${hasUserName ? 'ok' : 'missing'}, email: ${hasUserEmail ? 'ok' : 'missing'}). Please run: git config user.name "..." && git config user.email "..."`
      );
    }

    const mergeHeadPath = join(cwd, gitDir, 'MERGE_HEAD');
    if (existsSync(mergeHeadPath)) {
      result.isMergeInProgress = true;
      result.safe = false;
      result.errors.push('Merge in progress - resolve merge first');
    }

    // Check for rebase in progress
    const rebaseMergePath = join(cwd, gitDir, 'rebase-merge');
    const rebaseApplyPath = join(cwd, gitDir, 'rebase-apply');
    if (existsSync(rebaseMergePath) || existsSync(rebaseApplyPath)) {
      result.isRebaseInProgress = true;
      result.safe = false;
      result.errors.push('Rebase in progress - complete or abort rebase first');
    }

    // Check for cherry-pick in progress
    const cherryPickHeadPath = join(cwd, gitDir, 'CHERRY_PICK_HEAD');
    if (existsSync(cherryPickHeadPath)) {
      result.isCherryPickInProgress = true;
      result.safe = false;
      result.errors.push('Cherry-pick in progress - complete or abort cherry-pick first');
    }

    // Check for conflicts
    try {
      const conflicts = gitOut(cwd, 'git ls-files -u').trim();
      if (conflicts) {
        result.hasConflicts = true;
        result.safe = false;
        const conflictFiles = [...new Set(conflicts.split('\n').map(line => line.split('\t')[1]))];
        result.errors.push(`Unresolved conflicts in ${conflictFiles.length} file(s): ${conflictFiles.slice(0, 3).join(', ')}${conflictFiles.length > 3 ? '...' : ''}`);
      }
    } catch {
      // Ignore errors from ls-files
    }

    // Check for important untracked files in src/
    try {
      const untracked = gitOut(cwd, 'git ls-files --others --exclude-standard').trim();
      if (untracked) {
        const untrackedLines = untracked.split('\n').filter(Boolean);
        const importantExtensions = ['.ts', '.js', '.tsx', '.jsx', '.go', '.py', '.java', '.rs', '.c', '.cpp', '.h'];
        const candidateSet = new Set(stagingCandidates.map((file) => file.replace(/\\/g, '/').replace(/^\.\/+/, '')));
        const importantFiles = untrackedLines.filter(file => {
          // R-347: already claimed by the staging plan → not an orphan
          if (candidateSet.has(file)) return false;
          // Check if in src/ directory or similar
          const inSourceDir = file.startsWith('src/') || file.startsWith('lib/') || file.startsWith('pkg/');
          // Check if has important extension
          const hasImportantExt = importantExtensions.some(ext => file.endsWith(ext));
          return inSourceDir && hasImportantExt;
        });

        if (importantFiles.length > 0) {
          result.untrackedImportantFiles = importantFiles;
          result.safe = false;
          result.errors.push(
            `Important untracked files detected (${importantFiles.length}): ${importantFiles.slice(0, 3).join(', ')}${importantFiles.length > 3 ? '...' : ''}\n` +
            `Use: git add <file> or docpath commit --include "<pattern>"`
          );
        }
      }
    } catch {
      // Ignore errors
    }

  } catch (error) {
    result.safe = false;
    result.errors.push(`Git safety check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Format safety check result for display
 */
export function formatSafetyResult(result: GitSafetyResult): string {
  const lines: string[] = [];

  if (result.safe) {
    lines.push('✅ Git state is safe for operations');
    if (result.currentBranch) {
      lines.push(`   Branch: ${result.currentBranch}`);
    }
  } else {
    lines.push('❌ Git state is not safe for operations\n');

    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach(err => lines.push(`  • ${err}`));
    }

    if (result.warnings.length > 0) {
      lines.push('\nWarnings:');
      result.warnings.forEach(warn => lines.push(`  ⚠️  ${warn}`));
    }
  }

  return lines.join('\n');
}
