/**
 * Formatting and output utilities for check results
 */

import type { CheckResult } from './types.js';
import type { TaskFileDrift } from '../../utils/task-files.js';

export function formatValidationIssue(issue: { message: string; line?: number; section?: string; field?: string }): string {
  const details = [
    issue.line ? `line ${issue.line}` : '',
    issue.section ? `section ${issue.section}` : '',
    issue.field ? `field ${issue.field}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${issue.message} (${details.join(', ')})` : issue.message;
}

export function formatValidationFailure(filePath: string, issues: Array<{ message: string; line?: number; section?: string; field?: string }>): string {
  return [
    `检查文件: ${filePath}`,
    ...issues.map((issue) => `  - ${formatValidationIssue(issue)}`),
  ].join('\n');
}

export function formatTaskFileDrift(drifts: TaskFileDrift[]): string {
  const reasonLabel: Record<TaskFileDrift['reason'], string> = {
    'phantom-task': '幽灵任务',
    'missing-current': 'current 缺失',
    'missing-canonical': 'canonical 缺失',
    'content-mismatch': '内容不一致',
  };
  return [
    'TASK FILE DRIFT DETECTED:',
    ...drifts.flatMap((drift) => {
      const lines = [
        `  [${drift.file}] ${reasonLabel[drift.reason]}`,
        `    current: ${drift.currentPath}`,
        `    canonical: ${drift.canonicalPath}`,
      ];
      if (drift.detail) {
        lines.push(...drift.detail.split('\n').map((line) => `    ${line}`));
      }
      return lines;
    }),
    '修复建议:',
    '  - 以任务目录为准同步 current: docpath task sync --from canonical',
    '  - 以 current 为准回写任务目录: docpath task sync --from current',
  ].join('\n');
}

export function formatSyncedTaskFiles(synced: Array<{ file: string; fromPath: string; toPath: string }>): string {
  return [
    '已自动同步 active task 文件:',
    ...synced.flatMap((item) => [
      `  [${item.file}]`,
      `    from: ${item.fromPath}`,
      `    to: ${item.toPath}`,
    ]),
  ].join('\n');
}

export function errorOutput(err: unknown): string {
  if (err instanceof Error) {
    const stderr = 'stderr' in err && typeof (err as { stderr?: unknown }).stderr === 'string'
      ? (err as { stderr: string }).stderr.trim()
      : '';
    const stdout = 'stdout' in err && typeof (err as { stdout?: unknown }).stdout === 'string'
      ? (err as { stdout: string }).stdout.trim()
      : '';
    // R-350: runCheck 的命令一律带 `2>&1`（见 runners.ts runCheck），此时子进程 stderr
    // 为空、真实输出去到了 stdout。旧实现先判 `'stderr' in err` 即返回空的 stderr，
    // 于是所有 runCheck 失败都退化成通用文案 "Command failed: <cmd>"——
    // 环境类失败因此永远无法被 looksLikeEnvironmentFailure 识别（R-023 那类
    // "docker: command not found" 被当成代码失败，任务卡在无法 closeout）。
    // 修法：按"哪个流有内容用哪个"，两者都空才退回 err.message。
    if (stderr) return stderr;
    if (stdout) return stdout;
    return err.message;
  }
  return String(err);
}

export function formatFailedOutput(output: string): string[] {
  return output.split('\n').filter((line) => line.trim().length > 0);
}

export function warningResult(name: string, output: string): CheckResult {
  return { name, passed: false, output, severity: 'warning' };
}

export function contextFailureResult(name: string, output: string): CheckResult {
  return { name, passed: false, output, category: 'context', severity: 'error' };
}

export function groupCheckResults(results: CheckResult[]): Record<string, CheckResult[]> {
  const categoryOrder = ['compile', 'test', 'lint', 'preflight', 'boundary', 'pattern', 'plan', 'analysis', 'context'];
  const grouped: Record<string, CheckResult[]> = {};
  const unknownCategory = 'other';

  for (const result of results) {
    const category = result.category || unknownCategory;
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(result);
  }

  const ordered: Record<string, CheckResult[]> = {};
  for (const cat of categoryOrder) {
    if (grouped[cat]) ordered[cat] = grouped[cat];
  }
  if (grouped[unknownCategory]) ordered[unknownCategory] = grouped[unknownCategory];

  return ordered;
}

export function printCheckReport(results: CheckResult[], allPassed: boolean, verbose = false): void {
  const grouped = groupCheckResults(results);
  const categoryLabel: Record<string, string> = {
    compile: '编译检查',
    test: '测试检查',
    lint: 'Lint 检查',
    plan: '计划文档检查',
    analysis: '分析文档检查',
    context: '上下文健康检查',
    preflight: 'Preflight 规则',
    boundary: 'Boundary 规则',
    pattern: 'Pattern 规则',
    other: '其他检查',
  };

  console.log('\n📋 检查报告:\n');
  for (const [category, categoryResults] of Object.entries(grouped)) {
    console.log(`${categoryLabel[category] || category}:`);
    for (const result of categoryResults) {
      const icon = result.passed ? '✅' : result.severity === 'warning' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.name}`);
      if (!result.passed || verbose) {
        for (const line of formatFailedOutput(result.output)) {
          console.log(`     ${line}`);
        }
      }
    }
    console.log('');
  }

  if (allPassed) {
    console.log('✅ 所有检查通过\n');
  } else {
    const failedCount = results.filter((r) => !r.passed).length;
    console.log(`❌ ${failedCount} 项检查未通过\n`);
  }
}
