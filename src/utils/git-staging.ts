import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minimatch } from 'minimatch';

export interface StageOptions {
  dryRun: boolean;
  includePatterns?: string[];
  cwd: string;
}

export interface StageResult {
  success: boolean;
  stagedFiles: string[];
  skippedFiles: string[];
  errors: string[];
}

/**
 * Read recommended files from `docpath changes --agent` output
 */
function getRecommendedFiles(cwd: string): string[] {
  try {
    // Run docpath changes --agent to get recommendations
    const changesOutput = execSync('node .docpath/bin/docpath changes --agent', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Parse the output to extract recommended files
    // Look for canonical evidence and implementation files
    const recommendedFiles: string[] = [];
    const lines = changesOutput.split('\n');

    let inRecommendedSection = false;
    for (const line of lines) {
      // Match lines that suggest files to add
      if (line.includes('canonical evidence') || line.includes('gate evidence') || line.includes('实现文件')) {
        inRecommendedSection = true;
        continue;
      }

      if (inRecommendedSection && line.trim().startsWith('-')) {
        // Extract file path from line like "- .docpath/tasks/..."
        const match = line.match(/[-•]\s+(.+)/);
        if (match) {
          const filePath = match[1].trim();
          // Remove any markdown or annotations
          const cleanPath = filePath.replace(/\s+\(.+\)$/, '').trim();
          if (cleanPath && !cleanPath.includes('*')) {
            recommendedFiles.push(cleanPath);
          }
        }
      }

      if (line.trim() === '' && inRecommendedSection) {
        inRecommendedSection = false;
      }
    }

    // Also look for files mentioned in specific patterns
    const canonicalTaskMatch = changesOutput.match(/\.docpath\/tasks\/([^/]+)\//);
    if (canonicalTaskMatch) {
      const taskId = canonicalTaskMatch[1];
      // Add common canonical evidence files
      const commonFiles = [
        `.docpath/tasks/${taskId}/spec.md`,
        `.docpath/tasks/${taskId}/plan.md`,
        `.docpath/workspace/check.md`,
        `.docpath/workspace/last-check.md`,
        `.docpath/workspace/review.md`,
      ];

      // Check which files exist and are modified
      for (const file of commonFiles) {
        try {
          const status = execSync(`git status --porcelain "${file}"`, {
            cwd,
            encoding: 'utf-8',
            stdio: 'pipe',
          }).trim();

          if (status && !recommendedFiles.includes(file)) {
            recommendedFiles.push(file);
          }
        } catch {
          // File doesn't exist or not in git
        }
      }
    }

    return [...new Set(recommendedFiles)]; // Deduplicate
  } catch (error) {
    // If docpath changes fails, fall back to modified files in .docpath/
    try {
      const modifiedFiles = execSync('git diff --name-only HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim().split('\n').filter(Boolean);

      return modifiedFiles.filter(f => f.startsWith('.docpath/'));
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
    skippedFiles: [],
    errors: [],
  };

  try {
    // Get recommended files
    const recommendedFiles = getRecommendedFiles(options.cwd);

    // Get additional included files
    let includedFiles: string[] = [];
    if (options.includePatterns && options.includePatterns.length > 0) {
      includedFiles = getIncludedFiles(options.cwd, options.includePatterns);
    }

    // Combine and deduplicate
    const filesToStage = [...new Set([...recommendedFiles, ...includedFiles])];

    if (filesToStage.length === 0) {
      result.errors.push('No files to stage');
      result.success = false;
      return result;
    }

    // Check which files actually exist and are modified
    const validFiles: string[] = [];
    for (const file of filesToStage) {
      try {
        const status = execSync(`git status --porcelain "${file}"`, {
          cwd: options.cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();

        if (status) {
          validFiles.push(file);
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
      result.stagedFiles = validFiles;
      return result;
    }

    // Actually stage the files
    for (const file of validFiles) {
      try {
        execSync(`git add "${file}"`, {
          cwd: options.cwd,
          stdio: 'pipe',
        });
        result.stagedFiles.push(file);
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
      lines.push(`  ${dryRun ? '→' : '✅'} ${file}`);
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
