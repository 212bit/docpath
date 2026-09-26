import {
  detectGitHygiene,
  untrackGitRuntimeNoise,
  type GitHygieneCleanupResult,
  type GitHygieneReport,
} from '../utils/git-hygiene.js';
import { diagnoseRulesAndDecisions, type RuleDoctorReport } from '../engine/rule-doctor.js';

interface DoctorOptions {
  cwd: string;
  json?: boolean;
  untrackNoise?: boolean;
  rules?: boolean;
  agent?: boolean;
}

function hasErrors(report: GitHygieneReport, ruleReport?: RuleDoctorReport): boolean {
  const gitHasErrors = !report.isGitRepo || report.trackedIgnoredRuntimeFiles.length > 0;
  const ruleHasErrors = ruleReport ? !ruleReport.passed : false;
  return gitHasErrors || ruleHasErrors;
}

function printJson(report: GitHygieneReport, cleanup?: GitHygieneCleanupResult, ruleReport?: RuleDoctorReport): void {
  console.log(JSON.stringify({
    passed: !hasErrors(report, ruleReport),
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
    rules: ruleReport
      ? {
          passed: ruleReport.passed,
          errors: ruleReport.errors,
          warnings: ruleReport.warnings,
          stats: ruleReport.stats,
          issues: ruleReport.issues,
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

function printHuman(report: GitHygieneReport, cleanup?: GitHygieneCleanupResult, ruleReport?: RuleDoctorReport): void {
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

  if (ruleReport) {
    console.log(`\n📜  Rules & ADRs:`);
    console.log(`  - 规则条目: ${ruleReport.stats.totalRules} 条 (${ruleReport.stats.totalRuleFiles} 文件)`);
    console.log(`  - ADR 决策: ${ruleReport.stats.totalDecisions} 条`);
    if (ruleReport.issues.length === 0) {
      console.log('  ✅  规则与 ADR 健康度体检通过 (无冲突/重复/失效引用)');
    } else {
      for (const issue of ruleReport.issues) {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`  ${icon} [${issue.category}] ${issue.target}: ${issue.message}`);
      }
    }
  }

  const gitErrors = report.trackedIgnoredRuntimeFiles.length;
  const ruleErrors = ruleReport ? ruleReport.errors : 0;
  const totalErrors = gitErrors + ruleErrors;
  const totalWarnings = report.trackedIgnoredNonRuntimeFiles.length + (ruleReport ? ruleReport.warnings : 0);

  if (totalErrors > 0) {
    console.log(`\n❌  doctor failed (${totalErrors} errors, ${totalWarnings} warnings)`);
    return;
  }

  console.log(`\n✅  doctor passed (${totalWarnings} warnings)`);
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const cleanup = options.untrackNoise ? untrackGitRuntimeNoise(options.cwd) : undefined;
  const report = cleanup?.finalReport || detectGitHygiene(options.cwd);
  const ruleReport = options.rules ? await diagnoseRulesAndDecisions({ cwd: options.cwd }) : undefined;

  if (options.json) {
    printJson(report, cleanup, ruleReport);
  } else {
    printHuman(report, cleanup, ruleReport);
  }

  if (hasErrors(report, ruleReport)) {
    process.exit(1);
  }
}

