import { execFileSync } from 'node:child_process';
import { checkGitSafety, formatSafetyResult } from '../utils/git-safety.js';
import { stageRecommendedFiles, formatStageResult, getStagedFiles } from '../utils/git-staging.js';
import { buildChangesReport } from '../utils/changes-report.js';

import { readCurrentState } from '../utils/workspace.js';

/** R-347: changes report 分组平铺（含 worktree 隔离下的 commit_relevant_files）；报告失败时退回空集，不放宽任何文件。 */
async function stagingCandidateFiles(cwd: string): Promise<string[]> {
  try {
    const report = await buildChangesReport(cwd);
    return report.worktree_isolation.active
      ? report.worktree_isolation.commit_relevant_files
      : Object.values(report.groups).flat();
  } catch {
    return [];
  }
}

export async function deriveCommitMessage(cwd: string): Promise<string> {
  try {
    const report = await buildChangesReport(cwd);
    if (report.suggested_commit_message?.trim()) {
      return report.suggested_commit_message.trim();
    }
  } catch {}
  const state = await readCurrentState(cwd);
  if (state?.task_title || state?.task_id) {
    return `feat: ${state.task_title || state.task_id}`;
  }
  return 'chore: complete task and update changes';
}

import { resolveCoAuthor } from '../utils/agent-coauthor.js';

export interface CommitOptions {
  dryRun?: boolean;
  stage?: boolean;
  message?: string;
  autoMessage?: boolean;
  includePatterns?: string[];
  cwd: string;
}

/**
 * Main commit command implementation
 */
export async function commitCommand(options: CommitOptions): Promise<void> {
  let { dryRun, stage, message, autoMessage, includePatterns, cwd } = options;

  if (!message && autoMessage) {
    message = await deriveCommitMessage(cwd);
  }

  // Step 1: Safety checks
  console.log('🔍 Checking Git safety...\n');
  // R-347: 用 changes report 的分组作为「已归属」白名单，与 changes --agent 口径一致。
  const safetyResult = checkGitSafety(cwd, await stagingCandidateFiles(cwd));

  if (!safetyResult.safe) {
    console.error(formatSafetyResult(safetyResult));
    process.exit(1);
  }

  console.log(formatSafetyResult(safetyResult));
  console.log('');

  // Step 2: Determine operation mode
  const isDryRun = dryRun || (!stage && !message);
  const coAuthorInfo = await resolveCoAuthor(cwd);

  if (isDryRun) {
    // Dry-run mode: preview only
    console.log('📋 Commit Preview (dry-run)\n');

    const stageResult = await stageRecommendedFiles({
      dryRun: true,
      includePatterns,
      cwd,
    });

    console.log(formatStageResult(stageResult, true));

    if (stageResult.stagedFiles.length > 0) {
      console.log('\n📝 Proposed commit message:');
      console.log('  (provide with -m "your message")\n');
      if (coAuthorInfo.enabled && coAuthorInfo.trailer) {
        console.log(`  ${coAuthorInfo.trailer}`);
      }
      console.log('\nNext steps:');
      console.log('  docpath commit --stage          # Stage files');
      console.log('  docpath commit -m "message"     # Stage and commit');
    }

    return;
  }

  if (stage && !message) {
    // Stage-only mode
    console.log('🔄 Staging files...\n');

    const stageResult = await stageRecommendedFiles({
      dryRun: false,
      includePatterns,
      cwd,
    });

    console.log(formatStageResult(stageResult, false));

    if (!stageResult.success) {
      process.exit(1);
    }

    const staged = getStagedFiles(cwd);
    if (staged.length > 0) {
      console.log('\n✅ Files staged successfully');
      console.log('\nNext steps:');
      console.log('  git status                      # Review staged files');
      console.log('  git commit                      # Create commit');
      console.log('  docpath commit -m "message"     # Or commit with DocPath');
    }

    return;
  }

  if (message) {
    // Full commit mode: stage + commit
    console.log('🔄 Staging and committing...\n');

    // Stage files
    const stageResult = await stageRecommendedFiles({
      dryRun: false,
      includePatterns,
      cwd,
    });

    console.log(formatStageResult(stageResult, false));

    if (!stageResult.success) {
      process.exit(1);
    }

    if (stageResult.stagedFiles.length === 0) {
      console.error('\n❌ No files staged, cannot commit');
      process.exit(1);
    }

    // Create commit with dynamic co-author trailer
    const coAuthorInfo = await resolveCoAuthor(cwd);
    const commitMessage = coAuthorInfo.enabled && coAuthorInfo.trailer
      ? `${message.trim()}\n\n${coAuthorInfo.trailer}`
      : message.trim();

    try {
      execFileSync('git', ['commit', '-m', commitMessage], {
        cwd,
        stdio: 'pipe',
      });

      // Get commit hash
      const commitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      console.log('\n📝 Commit created successfully\n');
      console.log(`✅ Commit: ${commitHash}`);
      console.log(`   ${message}`);
      if (coAuthorInfo.enabled && coAuthorInfo.trailer) {
        console.log(`\n   ${coAuthorInfo.trailer}`);
      }
      console.log('\nNext steps:');
      console.log('  git log -1 --stat               # Review commit');
      console.log('  git push                        # Push to remote');

    } catch (error) {
      console.error('\n❌ Commit failed:');
      console.error(`   ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    return;
  }

  // Should not reach here
  console.error('❌ Invalid command options');
  process.exit(1);
}
