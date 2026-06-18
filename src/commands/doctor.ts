import { detectGitHygiene, type GitHygieneReport } from '../utils/git-hygiene.js';

interface DoctorOptions {
  cwd: string;
  json?: boolean;
}

function hasErrors(report: GitHygieneReport): boolean {
  return !report.isGitRepo || report.trackedIgnoredRuntimeFiles.length > 0;
}

function printJson(report: GitHygieneReport): void {
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
  }, null, 2));
}

function printHuman(report: GitHygieneReport): void {
  console.log('\n🩺  DocPath doctor\n');

  if (!report.isGitRepo) {
    console.log('❌  git: 当前目录不是 git 仓库');
    console.log('\n❌  doctor failed (1 error)');
    return;
  }

  console.log(`git: ${report.repoRoot}`);
  const runtimeCount = report.trackedIgnoredRuntimeFiles.length;
  const nonRuntimeCount = report.trackedIgnoredNonRuntimeFiles.length;

  if (runtimeCount === 0) {
    console.log('✅  tracked ignored runtime files: none');
  } else {
    console.log(`❌  tracked ignored runtime files: ${runtimeCount}`);
    for (const file of report.trackedIgnoredRuntimeFiles) {
      console.log(`  - ${file}`);
    }
    if (report.cleanupCommand) {
      console.log('\ncleanup suggestion:');
      console.log(`  ${report.cleanupCommand}`);
    }
  }

  if (nonRuntimeCount > 0) {
    console.log(`\n⚠️  tracked ignored DocPath evidence not classified as runtime noise: ${nonRuntimeCount}`);
    for (const file of report.trackedIgnoredNonRuntimeFiles.slice(0, 5)) {
      console.log(`  - ${file}`);
    }
    if (nonRuntimeCount > 5) {
      console.log(`  ... ${nonRuntimeCount - 5} more`);
    }
    console.log('  Review .gitignore rules before untracking these files.');
  }

  if (runtimeCount > 0) {
    console.log(`\n❌  doctor failed (${runtimeCount} tracked ignored runtime files)`);
    return;
  }

  console.log(`\n✅  doctor passed (${nonRuntimeCount} warnings)`);
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const report = detectGitHygiene(options.cwd);
  if (options.json) {
    printJson(report);
  } else {
    printHuman(report);
  }

  if (hasErrors(report)) {
    process.exit(1);
  }
}
