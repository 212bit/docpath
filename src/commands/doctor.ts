import {
  detectGitHygiene,
  untrackGitRuntimeNoise,
  type GitHygieneCleanupResult,
  type GitHygieneReport,
} from '../utils/git-hygiene.js';

interface DoctorOptions {
  cwd: string;
  json?: boolean;
  untrackNoise?: boolean;
}

function hasErrors(report: GitHygieneReport): boolean {
  return !report.isGitRepo || report.trackedIgnoredRuntimeFiles.length > 0;
}

function printJson(report: GitHygieneReport, cleanup?: GitHygieneCleanupResult): void {
  console.log(JSON.stringify({
    passed: !hasErrors(report),
    git: {
      is_repo: report.isGitRepo,
      repo_root: report.repoRoot,
    },
    tracked_ignored: {
      total: report.trackedIgnoredFiles.length,
      runtime_noise_files: report.trackedIgnoredRuntimeFiles,
      non_runtime_docpath_files: report.trackedIgnoredNonRuntimeFiles,
      cleanup_command: report.cleanupCommand,
    },
    cleanup: cleanup
      ? {
          attempted: true,
          untracked_count: cleanup.untrackedFiles.length,
          untracked_files: cleanup.untrackedFiles,
        }
      : undefined,
  }, null, 2));
}

function printCleanupSummary(cleanup?: GitHygieneCleanupResult): void {
  if (!cleanup) return;
  if (cleanup.untrackedFiles.length === 0) {
    console.log('✅  cleanup: no tracked ignored runtime files to untrack');
    return;
  }

  console.log(`✅  untracked runtime noise files from Git index: ${cleanup.untrackedFiles.length}`);
  for (const file of cleanup.untrackedFiles) {
    console.log(`  - ${file}`);
  }
}

function printRuntimeNoise(report: GitHygieneReport): void {
  if (report.trackedIgnoredRuntimeFiles.length === 0) {
    console.log('✅  tracked ignored runtime files: none');
    return;
  }

  console.log(`❌  tracked ignored runtime files: ${report.trackedIgnoredRuntimeFiles.length}`);
  for (const file of report.trackedIgnoredRuntimeFiles) {
    console.log(`  - ${file}`);
  }
  if (report.cleanupCommand) {
    console.log('\ncleanup suggestion:');
    console.log(`  ${report.cleanupCommand}`);
  }
}

function printNonRuntimeWarning(report: GitHygieneReport): void {
  const count = report.trackedIgnoredNonRuntimeFiles.length;
  if (count === 0) return;

  console.log(`\n⚠️  tracked ignored DocPath evidence not classified as runtime noise: ${count}`);
  for (const file of report.trackedIgnoredNonRuntimeFiles.slice(0, 5)) {
    console.log(`  - ${file}`);
  }
  if (count > 5) {
    console.log(`  ... ${count - 5} more`);
  }
  console.log('  Review .gitignore rules before untracking these files.');
}

function printHuman(report: GitHygieneReport, cleanup?: GitHygieneCleanupResult): void {
  console.log('\n🩺  DocPath doctor\n');

  if (!report.isGitRepo) {
    console.log('❌  git: 当前目录不是 git 仓库');
    console.log('\n❌  doctor failed (1 error)');
    return;
  }

  console.log(`git: ${report.repoRoot}`);
  printCleanupSummary(cleanup);
  printRuntimeNoise(report);
  printNonRuntimeWarning(report);

  if (report.trackedIgnoredRuntimeFiles.length > 0) {
    console.log(`\n❌  doctor failed (${report.trackedIgnoredRuntimeFiles.length} tracked ignored runtime files)`);
    return;
  }

  console.log(`\n✅  doctor passed (${report.trackedIgnoredNonRuntimeFiles.length} warnings)`);
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const cleanup = options.untrackNoise ? untrackGitRuntimeNoise(options.cwd) : undefined;
  const report = cleanup?.finalReport || detectGitHygiene(options.cwd);
  if (options.json) {
    printJson(report, cleanup);
  } else {
    printHuman(report, cleanup);
  }

  if (hasErrors(report)) {
    process.exit(1);
  }
}
