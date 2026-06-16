import { execSync } from 'node:child_process';
import { checkGitSafety, formatSafetyResult } from '../utils/git-safety.js';
import { stageRecommendedFiles, formatStageResult, getStagedFiles } from '../utils/git-staging.js';

interface CommitOptions {
  dryRun: boolean;
  stage: boolean;
  message?: string;
  includePatterns?: string[];
  cwd: string;
}

const CO_AUTHOR = 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>';

/**
 * Main commit command implementation
 */
export async function commitCommand(options: CommitOptions): Promise<void> {
  const { dryRun, stage, message, includePatterns, cwd } = options;

  // Step 1: Safety checks
  console.log('🔍 Checking Git safety...\n');
  const safetyResult = checkGitSafety(cwd);

  if (!safetyResult.safe) {
    console.error(formatSafetyResult(safetyResult));
    process.exit(1);
  }

  console.log(formatSafetyResult(safetyResult));
  console.log('');

  // Step 2: Determine operation mode
  const isDryRun = dryRun || (!stage && !message);

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
      console.log(`  ${CO_AUTHOR}`);
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

    // Create commit with co-author trailer
    const commitMessage = message.trim() + '\n\n' + CO_AUTHOR;

    try {
      execSync('git commit -m ' + JSON.stringify(commitMessage), {
        cwd,
        stdio: 'pipe',
      });

      // Get commit hash
      const commitHash = execSync('git rev-parse --short HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      console.log('\n📝 Commit created successfully\n');
      console.log(`✅ Commit: ${commitHash}`);
      console.log(`   ${message}`);
      console.log(`\n   ${CO_AUTHOR}`);
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
