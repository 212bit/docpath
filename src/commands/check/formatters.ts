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

export interface ActionableFixSuggestion {
  label: string;
  command: string;
}

export function extractActionableFixSuggestions(failures: CheckResult[]): ActionableFixSuggestion[] {
  const suggestions: ActionableFixSuggestion[] = [];
  const seenCommands = new Set<string>();

  const addSuggestion = (label: string, command: string) => {
    if (!seenCommands.has(command)) {
      seenCommands.add(command);
      suggestions.push({ label, command });
    }
  };

  for (const failure of failures) {
    if (failure.passed || failure.severity === 'warning') continue;
    const cat = failure.category || '';
    const name = failure.name.toLowerCase();
    const output = failure.output || '';

    // 1. 测试失败检测与单测提取
    if (cat === 'test' || name.includes('测试') || name.includes('test')) {
      const testFileRegex = /(?:tests?\/[a-zA-Z0-9_\-\./]+\.(?:test|spec)\.(?:mjs|ts|js|jsx|tsx)|[a-zA-Z0-9_\-\./]+_test\.go|tests?\/test_[a-zA-Z0-9_\-\.]+\.py)/gi;
      const matchedFiles = Array.from(new Set(output.match(testFileRegex) || []));

      if (matchedFiles.length > 0) {
        for (const file of matchedFiles.slice(0, 3)) {
          if (file.endsWith('.mjs') || file.endsWith('.js')) {
            addSuggestion(`单用例测试 (${file})`, `node --test ${file}`);
          } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            addSuggestion(`单用例测试 (${file})`, `npx vitest run ${file}`);
          } else if (file.endsWith('_test.go')) {
            addSuggestion(`单用例 Go 测试 (${file})`, `go test -v ./${file}`);
          } else if (file.endsWith('.py')) {
            addSuggestion(`单用例 Python 测试 (${file})`, `pytest ${file}`);
          }
        }
      } else if (failure.command) {
        addSuggestion(`复现失败测试 (${failure.name})`, failure.command);
      }
    }

    // 2. Lint 失败检测
    if (cat === 'lint' || name.includes('lint') || name.includes('eslint')) {
      addSuggestion('自动修复 Lint 问题', 'npm run lint -- --fix');
    }

    // 3. 编译 / 类型检查失败检测
    if (cat === 'compile' || name.includes('编译') || name.includes('typecheck') || name.includes('tsc')) {
      addSuggestion('定向运行类型检查', 'npx tsc --noEmit');
    }
  }

  return suggestions;
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
    const codeFailures = results.filter((r) => !r.passed && r.severity !== 'warning' && !r.environment_failure);
    if (codeFailures.length > 0) {
      const suggestions = extractActionableFixSuggestions(codeFailures);
      if (suggestions.length > 0) {
        console.log('🎯  定向调试与修复建议:');
        for (const item of suggestions) {
          console.log(`  👉  ${item.label}: \`${item.command}\``);
        }
        console.log('  🔧  修复后直接再次运行 `docpath done --commit` 即可一键通过质量门禁并完成提交。\n');
      }
    }
  }
}
