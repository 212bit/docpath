import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { gitSyncOptional } from '../../utils/git-run.js';
import type { CheckResult, GitBaseline, CheckOptions } from './types.js';
import { readCurrentState, syncCurrentDocument } from '../../utils/workspace.js';
import { resolveDocpathDir } from '../../utils/file.js';
import { transitionWorkflow } from '../../engine/transitions.js';
import { writeBreadcrumb } from '../../engine/breadcrumb.js';
import { writeLastCheckEvidence as writeLastCheckEvidenceFiles, type CheckEvidenceItem } from '../../utils/workspace-evidence.js';
import { CHECK_HISTORY_MAX_ENTRIES } from '../../utils/workspace-cleanup.js';
import { groupCheckResults, formatFailedOutput } from './formatters.js';
import { resolveEffectivePlanTasks } from '../../utils/plan-sync.js';

export function runGitOptional(cwd: string, args: string[]): string | null {
  const out = gitSyncOptional(cwd, args);
  return out === null ? null : out.trim();
}

export function readGitBaseline(cwd: string): GitBaseline | null {
  const ref = runGitOptional(cwd, ['rev-parse', 'HEAD']);
  if (!ref) return null;
  return {
    ref,
    branch: runGitOptional(cwd, ['branch', '--show-current']) || 'HEAD',
    worktreeDirty: (runGitOptional(cwd, ['status', '--porcelain=v1', '--untracked-files=all']) || '').length > 0,
  };
}

export function shouldPersistPassedOutput(result: CheckResult): boolean {
  return result.passed && /terminal verification step/i.test(result.output);
}

export function printCheckReport(results: CheckResult[], allPassed: boolean, verbose = false): void {
  const categoryNames: Record<string, string> = {
    compile: '📝 编译检查',
    test: '🧪 测试检查',
    lint: '🔍 Lint 检查',
    plan: '📋 计划检查',
    analysis: '🧭 分析检查',
    context: '📚 上下文健康检查',
    preflight: '🚀 Pre-flight 检查',
    boundary: '🛡️  Boundary 检查',
    pattern: '📊 Pattern 检查',
    other: '📦 其他检查',
  };

  for (const [category, categoryResults] of Object.entries(groupCheckResults(results))) {
    const passed = categoryResults.filter(r => r.passed && !r.severity);
    const failed = categoryResults.filter(r => !r.passed);
    const warnings = categoryResults.filter(r => r.severity === 'warning');

    if (!verbose && failed.length === 0 && warnings.length === 0) {
      console.log(`\n${categoryNames[category] || category}:`);
      console.log(`  ✅  ${passed.length} 项通过`);
      continue;
    }

    console.log(`\n${categoryNames[category] || category}:`);
    for (const result of categoryResults) {
      if (verbose || !result.passed || result.severity === 'warning') {
        const icon = result.severity === 'warning' ? '⚠️' : result.passed ? '✅' : '❌';
        console.log(`  ${icon}  ${result.name}`);
        if ((!result.passed || result.severity === 'warning') && result.output) {
          for (const line of formatFailedOutput(result.output)) {
            console.log(line);
          }
        }
      }
    }
  }

  if (results.length === 0) {
    console.log('⚠️  未检测到可执行的检查项（无 tsconfig/package.json/Cargo.toml/go.mod）');
  }

  // 环境失败诊断摘要：先分类环境/代码，帮助 Agent 用最廉价的判定排除工具链问题。
  const envFailures = results.filter((r) => !r.passed && r.environment_failure);
  if (envFailures.length > 0) {
    console.log('\n🔧  环境诊断（以下失败看起来是工具链/环境问题，不是代码问题）:');
    for (const r of envFailures) {
      console.log(`  - ${r.name}: 命令缺失或依赖未安装`);
    }
    console.log('    👉  先修复环境再重跑 check: 确认 pnpm/npm/yarn 已安装，node_modules 已安装 (pnpm install)');
    console.log('    这些失败与代码质量无关，用 token 诊断代码是浪费。\n');
  }

  console.log(`\n${allPassed ? '✅  全部通过' : '❌  存在失败项'}\n`);
}

export async function updateCheckWorkflowState(cwd: string, allPassed: boolean, results: CheckResult[]): Promise<void> {
  const workflowState = await readCurrentState(cwd);
  const alreadyPastCheck = allPassed && (
    (workflowState?.phase === 'reviewing' && workflowState?.gate === 'review_pass')
    || workflowState?.phase === 'completed'
  );
  if (alreadyPastCheck) return;
  const phase = workflowState?.phase || 'idle';
  const planningDone = allPassed && phase === 'planning'
    ? await hasCompletedPlan(cwd)
    : false;
  const eventAllowed = allPassed
    ? ['executing', 'checking', 'completed'].includes(phase) || planningDone
    : ['executing', 'checking', 'reviewing', 'completed'].includes(phase);
  if (!eventAllowed) return;

  await transitionWorkflow(cwd, allPassed ? 'check.passed' : 'check.failed', {
    currentStep: allPassed
      ? `质量检查通过 (${results.length} 项)，下一步: docpath review`
      : `质量检查失败: ${results.filter(result => !result.passed).map(result => result.name).join(', ')}`,
  });
}

async function hasCompletedPlan(cwd: string): Promise<boolean> {
  const tasks = await resolveEffectivePlanTasks(cwd);
  return tasks.length > 0 && tasks.every((task) => task.done);
}

export async function writeLastCheckEvidence(
  cwd: string,
  results: CheckResult[],
  allPassed: boolean,
  meta?: { cacheReused?: boolean },
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const gitBaseline = readGitBaseline(cwd);
  const workflowState = await readCurrentState(cwd);
  const taskId = workflowState?.task_id || 'check';
  const checks: CheckEvidenceItem[] = results.map((result) => ({
    name: result.name,
    passed: result.passed,
    output: shouldPersistPassedOutput(result) ? result.output : '',
    ...(result.category ? { category: result.category } : {}),
    ...(result.severity ? { severity: result.severity } : {}),
    ...(result.environment_failure ? { environment_failure: true } : {}),
  }));
  const { computeCodeScopeDigest } = await import('./cache.js');
  await writeLastCheckEvidenceFiles(docpathDir, {
    schema_version: 1,
    kind: 'last-check',
    task_id: taskId,
    timestamp: new Date().toISOString(),
    // R-276(补齐): 绑定 HEAD, 使时间窗内的新提交不会被旧证据蒙混跳过
    ...(gitBaseline ? { head: gitBaseline.ref } : {}),
    // R-331: scope 缓存判定键 + 复用标记
    code_scope_digest: computeCodeScopeDigest(cwd) ?? undefined,
    ...(meta?.cacheReused ? { cached: true } : {}),
    passed: allPassed,
    check_count: results.length,
    ...(gitBaseline ? {
      git: {
        ref: gitBaseline.ref,
        branch: gitBaseline.branch,
        worktree_dirty: gitBaseline.worktreeDirty,
      },
    } : {}),
    checks,
  });
}

export async function writeCheckBreadcrumb(cwd: string, taskId: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'check',
    status: allPassed ? 'done' : 'blocked',
    context: allPassed
      ? `质量检查通过 (${results.length} 项)`
      : `质量检查失败: ${results.filter(result => !result.passed).map(result => result.name).join(', ')}`,
  });
}

export async function updateCheckHistory(cwd: string, docpathDir: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  const regressionPath = join(docpathDir, 'workspace', 'check-history.json');
  type CheckHistoryEntry = { timestamp: string; passed: boolean; failedChecks: string[]; gitRef?: string; branch?: string; worktreeDirty?: boolean };
  let history: CheckHistoryEntry[] = [];
  if (existsSync(regressionPath)) {
    try { history = JSON.parse(await readFile(regressionPath, 'utf-8')) as CheckHistoryEntry[]; } catch { history = []; }
  }

  const currentFailed = results.filter(result => !result.passed).map(result => result.name);
  const gitBaseline = readGitBaseline(cwd);
  history.push({
    timestamp: new Date().toISOString(),
    passed: allPassed,
    failedChecks: currentFailed,
    gitRef: gitBaseline?.ref,
    branch: gitBaseline?.branch,
    worktreeDirty: gitBaseline?.worktreeDirty,
  });
  if (history.length > CHECK_HISTORY_MAX_ENTRIES) history = history.slice(-CHECK_HISTORY_MAX_ENTRIES);
  await writeFile(regressionPath, JSON.stringify(history, null, 2), 'utf-8');

  if (history.length < 2) return;
  const prev = history[history.length - 2];
  if (!prev.passed || allPassed) return;

  const newFailures = currentFailed.filter(failure => !prev.failedChecks.includes(failure));
  if (newFailures.length > 0) {
    console.log(`\n🚨 回归检测: ${newFailures.length} 项新增失败!`);
    newFailures.forEach(failure => console.log(`  ↩️  ${failure}`));
  }
}

export async function persistCheckEvidence(
  cwd: string,
  docpathDir: string,
  taskId: string,
  results: CheckResult[],
  allPassed: boolean,
  meta?: { cacheReused?: boolean },
): Promise<void> {
  await updateCheckWorkflowState(cwd, allPassed, results);
  await writeLastCheckEvidence(cwd, results, allPassed, meta);
  await writeCheckBreadcrumb(cwd, taskId, results, allPassed);
  await syncCurrentDocument(cwd);
  await updateCheckHistory(cwd, docpathDir, results, allPassed);
}

export async function writeMajorChangeConfirmation(docpathDir: string, taskId: string | undefined, reason: string): Promise<void> {
  const activeTaskId = taskId || 'unknown';
  const { readActiveTaskFile, writeActiveTaskFile } = await import('../../utils/task-files.js');
  let specContent = '';
  try {
    specContent = await readActiveTaskFile(docpathDir, activeTaskId, 'spec.md');
  } catch {
    throw new Error(`无法读取当前任务的 spec.md`);
  }

  // 1. 替换 - [ ] 是，需要用户确认 -> - [x] 是，需要用户确认
  let next = specContent.replace(/-\s*\[\s*\]\s*是，需要用户确认/g, '- [x] 是，需要用户确认');

  // 2. 替换 - 用户确认: ... -> - 用户确认: reason (支持任何前置空白和回车)
  if (/\s*-\s*用户确认:/i.test(next)) {
    next = next.replace(/^\s*-\s*用户确认:\s*.*$/mi, `- 用户确认: ${reason}`);
  } else {
    // 降级：如果不存在用户确认这一行，在 ## 4.1 重大变更门禁 的合适位置插入它
    const index = next.indexOf('## 4.1 重大变更门禁');
    if (index === -1) {
      const altIndex = next.indexOf('## 4.1 重大决策门禁');
      if (altIndex !== -1) {
        next = next.slice(0, altIndex + 16) + `\n- 用户确认: ${reason}\n` + next.slice(altIndex + 16);
      }
    } else {
      next = next.slice(0, index + 16) + `\n- 用户确认: ${reason}\n` + next.slice(index + 16);
    }
  }

  await writeActiveTaskFile(docpathDir, activeTaskId, 'spec.md', next);
}
