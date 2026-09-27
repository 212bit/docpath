import {
  detectGitHygiene,
  untrackGitRuntimeNoise,
  type GitHygieneCleanupResult,
  type GitHygieneReport,
} from '../utils/git-hygiene.js';
import { diagnoseRulesAndDecisions, type RuleDoctorReport } from '../engine/rule-doctor.js';
import { detectPlanBreadcrumbDrift, type PlanBreadcrumbDrift } from '../utils/plan-sync.js';
import { readCurrentState, type CurrentState } from '../utils/workspace.js';
import { checkArchitectureLayers, type ArchitectureReport } from '../engine/arch-guard.js';
import { diagnoseDocumentHealth, type DocHealthReport } from '../utils/docs-doctor.js';
import { collectContextBudget, type BudgetReport } from '../utils/budget.js';

export interface DoctorOptions {
  cwd: string;
  json?: boolean;
  untrackNoise?: boolean;
  rules?: boolean;
  deep?: boolean;
  agent?: boolean;
}

export interface TaskConsistencyReport {
  passed: boolean;
  state: CurrentState | null;
  drift: PlanBreadcrumbDrift;
  issues: string[];
}

async function checkTaskConsistency(cwd: string): Promise<TaskConsistencyReport> {
  const state = await readCurrentState(cwd);
  const drift = await detectPlanBreadcrumbDrift(cwd);
  const issues: string[] = [];

  if (drift.planDoneWithoutBreadcrumb.length > 0) {
    issues.push(`步骤在 plan 中已完成但无 breadcrumb 证据: ${drift.planDoneWithoutBreadcrumb.join(', ')}`);
  }
  if (drift.breadcrumbDoneWithoutPlan.length > 0) {
    issues.push(`步骤在 breadcrumb 中已记录完成但 plan 未同步: ${drift.breadcrumbDoneWithoutPlan.join(', ')}`);
  }

  return {
    passed: issues.length === 0,
    state,
    drift,
    issues,
  };
}

function hasErrors(
  report: GitHygieneReport,
  ruleReport?: RuleDoctorReport,
  taskReport?: TaskConsistencyReport,
  archReport?: ArchitectureReport,
  docReport?: DocHealthReport,
): boolean {
  const gitHasErrors = !report.isGitRepo || report.trackedIgnoredRuntimeFiles.length > 0;
  const ruleHasErrors = ruleReport ? !ruleReport.passed : false;
  const taskHasErrors = taskReport ? !taskReport.passed : false;
  const archHasErrors = archReport ? !archReport.passed : false;
  const docHasErrors = docReport ? !docReport.healthy && (docReport.stats.missingHeadings > 0 || docReport.stats.emptyDocs > 0) : false;
  return gitHasErrors || ruleHasErrors || taskHasErrors || archHasErrors || docHasErrors;
}

function printJson(
  report: GitHygieneReport,
  cleanup?: GitHygieneCleanupResult,
  ruleReport?: RuleDoctorReport,
  taskReport?: TaskConsistencyReport,
  archReport?: ArchitectureReport,
  docReport?: DocHealthReport,
  budgetReport?: BudgetReport,
): void {
  console.log(JSON.stringify({
    passed: !hasErrors(report, ruleReport, taskReport, archReport, docReport),
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
    task_consistency: taskReport
      ? {
          passed: taskReport.passed,
          active_task: taskReport.state?.task_id || null,
          phase: taskReport.state?.phase || null,
          issues: taskReport.issues,
        }
      : undefined,
    architecture: archReport
      ? {
          passed: archReport.passed,
          errors: archReport.stats.errors,
          warnings: archReport.stats.warnings,
          circular_cycles: archReport.circular_cycles.length,
        }
      : undefined,
    docs: docReport
      ? {
          passed: docReport.healthy,
          scanned_count: docReport.scannedCount,
          indexed_count: docReport.indexedCount,
          broken_links: docReport.stats.brokenLinks,
          unindexed: docReport.stats.unindexed,
          missing_headings: docReport.stats.missingHeadings,
          empty_docs: docReport.stats.emptyDocs,
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
    budget: budgetReport
      ? {
          overall_status: budgetReport.overallStatus,
          total_tokens: budgetReport.totalTokens,
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

function printHuman(
  report: GitHygieneReport,
  cleanup?: GitHygieneCleanupResult,
  ruleReport?: RuleDoctorReport,
  taskReport?: TaskConsistencyReport,
  archReport?: ArchitectureReport,
  docReport?: DocHealthReport,
  budgetReport?: BudgetReport,
): void {
  console.log('\n🩺  DocPath doctor: 全景健康度与逻辑一致性体检\n');

  if (!report.isGitRepo) {
    console.log('❌  git: 当前目录不是 git 仓库');
    console.log('\n❌  doctor failed (1 error)');
    return;
  }

  console.log(`📁  Git 工作区: ${report.repoRoot}`);
  printCleanupSummary(cleanup);
  printRuntimeNoise(report);
  printNonRuntimeWarning(report);

  if (taskReport) {
    console.log(`\n📋  任务状态与步骤一致性:`);
    if (taskReport.state?.task_id) {
      console.log(`  - 活跃任务: ${taskReport.state.task_id} (${taskReport.state.task_title || '未命名'}) [phase: ${taskReport.state.phase}]`);
    } else {
      console.log(`  - 活跃任务: 无 (idle)`);
    }
    if (taskReport.passed) {
      console.log('  ✅  任务状态、Plan 计划与 Breadcrumb 事件 100% 对齐无漂移');
    } else {
      for (const issue of taskReport.issues) {
        console.log(`  ❌  ${issue}`);
      }
    }
  }

  if (archReport) {
    console.log(`\n🏛️  架构分层与依赖健康度:`);
    if (archReport.passed) {
      console.log(`  ✅  ${archReport.stats.total_files} 个模块分层合规，0 逆向依赖，0 循环引用`);
    } else {
      console.log(`  ❌  发现 ${archReport.stats.errors} 处分层违规，${archReport.circular_cycles.length} 处循环引用`);
      for (const v of archReport.violations.slice(0, 5)) {
        console.log(`      - [${v.type}] ${v.file} ➔ ${v.target}: ${v.message}`);
      }
    }
  }

  if (docReport) {
    console.log(`\n📚  活文档与索引生态:`);
    console.log(`  - 已索引文档: ${docReport.indexedCount} 篇 (扫描 ${docReport.scannedCount} 篇)`);
    if (docReport.healthy) {
      console.log('  ✅  文档链接完整，索引与真源一致');
    } else {
      if (docReport.stats.brokenLinks > 0) console.log(`  ⚠️  死链: ${docReport.stats.brokenLinks} 处`);
      if (docReport.stats.missingHeadings > 0) console.log(`  ⚠️  缺少标题: ${docReport.stats.missingHeadings} 处`);
      if (docReport.stats.unindexed > 0) console.log(`  ⚠️  未索引文档: ${docReport.stats.unindexed} 处`);
    }
  }

  if (ruleReport) {
    console.log(`\n📜  Rules & ADR 规则体检:`);
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

  if (budgetReport) {
    console.log(`\n📏  上下文 Token 预算:`);
    const statusIcon = budgetReport.overallStatus === 'healthy' ? '✅' : budgetReport.overallStatus === 'warning' ? '⚠️' : '❌';
    console.log(`  ${statusIcon} 全仓上下文健康度: ${budgetReport.overallStatus} (~${budgetReport.totalTokens} tokens)`);
  }

  const gitErrors = report.trackedIgnoredRuntimeFiles.length;
  const ruleErrors = ruleReport ? ruleReport.errors : 0;
  const taskErrors = taskReport && !taskReport.passed ? taskReport.issues.length : 0;
  const archErrors = archReport ? archReport.stats.errors : 0;
  const totalErrors = gitErrors + ruleErrors + taskErrors + archErrors;

  const totalWarnings =
    report.trackedIgnoredNonRuntimeFiles.length +
    (ruleReport ? ruleReport.warnings : 0) +
    (docReport ? docReport.stats.brokenLinks + docReport.stats.unindexed : 0);

  if (totalErrors > 0) {
    console.log(`\n❌  doctor failed (${totalErrors} errors, ${totalWarnings} warnings)`);
    return;
  }

  console.log(`\n✅  doctor passed (${totalWarnings} warnings)`);
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const cleanup = options.untrackNoise ? untrackGitRuntimeNoise(options.cwd) : undefined;
  const report = cleanup?.finalReport || detectGitHygiene(options.cwd);
  const runDeep = options.deep === true;

  const ruleReport = (options.rules || runDeep) ? await diagnoseRulesAndDecisions({ cwd: options.cwd }) : undefined;
  const taskReport = runDeep ? await checkTaskConsistency(options.cwd) : undefined;
  const archReport = runDeep ? await checkArchitectureLayers(options.cwd) : undefined;
  const docReport = runDeep ? await diagnoseDocumentHealth(options.cwd) : undefined;
  const budgetReport = runDeep ? await collectContextBudget(options.cwd) : undefined;

  if (options.json) {
    printJson(report, cleanup, ruleReport, taskReport, archReport, docReport, budgetReport);
  } else {
    printHuman(report, cleanup, ruleReport, taskReport, archReport, docReport, budgetReport);
  }

  if (hasErrors(report, ruleReport, taskReport, archReport, docReport)) {
    process.exit(1);
  }
}
