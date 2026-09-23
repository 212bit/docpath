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
import { groupCheckResults, formatFailedOutput, extractActionableFixSuggestions } from './formatters.js';
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

export function printCheckReport(results: CheckResult[], allPassed: boolean, verbose = false, envExempt = false): void {
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
      const cachedInCat = categoryResults.filter((r) => r.cached && r.passed);
      if (cachedInCat.length > 0) {
        // R-357: 复用项曾静默伪装成真跑的 ✅。现在逐项标注「缓存复用，未实际执行」，
        // 让用户一眼看出本项判定来自上次绿色 check 而非本次真跑。
        for (const r of cachedInCat) {
          console.log(`  ♻️  ${r.name}（缓存复用，未实际执行）`);
        }
        const realPass = passed.length - cachedInCat.length;
        console.log(`  ✅  ${realPass} 项通过；${cachedInCat.length} 项来自缓存复用（未重跑）`);
      } else {
        console.log(`  ✅  ${passed.length} 项通过`);
      }
      continue;
    }

    console.log(`\n${categoryNames[category] || category}:`);
    for (const result of categoryResults) {
      if (verbose || !result.passed || result.severity === 'warning' || result.cached) {
        const icon = result.cached ? '♻️' : result.severity === 'warning' ? '⚠️' : result.passed ? '✅' : '❌';
        console.log(`  ${icon}  ${result.name}${result.cached ? '（缓存复用，未实际执行）' : ''}`);
        // R-357: 缓存复用项的说明（含「--no-cache 可强制重跑」）在 verbose 或展开路径下也露出。
        if ((!result.passed || result.severity === 'warning' || result.cached) && result.output) {
          for (const line of formatFailedOutput(result.output)) {
            console.log(line);
          }
        }
      }
    }
  }

  if (results.length === 0) {
    console.log('⚠️  未检测到可执行的检查项（无 tsconfig/package.json/Cargo.toml/go.mod/pom.xml）');
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

  // R-347: 列出门禁实际执行的外部命令，agent 据此不再在 check 前后手动重跑同一套验证。
  const executed = results.filter((r) => r.command);
  if (executed.length > 0) {
    console.log('\n🧾  已执行命令（门禁已跑过，无需手动重复）:');
    for (const r of executed) {
      console.log(`  ${r.passed ? '✅' : '❌'}  ${r.name}: ${r.command}`);
    }
  }

  // R-357: 缓存复用聚合提示——显式告诉 agent 本次有多少项是复用而非真跑，
  // 并给出强制全量的开关。复用出来的绿与真跑出来的绿是两件事，必须醒目区分。
  const cachedCount = results.filter((r) => r.cached).length;
  if (cachedCount > 0) {
    console.log(`\n♻️  缓存复用 ${cachedCount} 项（typecheck/build/test/lint）：代码范围自上次绿色 check 无变更，判定沿用，本次未实际执行。如需强制全量请加 --no-cache。`);
  }

  // R-350: 环境豁免——全部失败项都是确定性可证的工具链故障时，不落 check_fail，
  // 而是落 check_env_exempt（可继续 review/归档，但必须显著可见 + 审计留痕）。
  if (envExempt) {
    console.log('\n🛠️  环境豁免（check_env_exempt）: 本次全部失败项都是工具链不可用，非代码问题:');
    for (const r of results.filter((item) => !item.passed && item.severity !== 'warning')) {
      console.log(`  - ${r.name}`);
    }
    console.log('    豁免依据: 探针证明 runner 不可用，或输出为命令不存在/无法派生进程/二进制不可执行。');
    console.log('    审计: 已记入 workspace/decisions.md (policy.env_exempt)，gate=check_env_exempt。');
    console.log('    想按失败处理请重跑: docpath check --no-env-exempt\n');
  }

  console.log(`\n${allPassed ? '✅  全部通过' : envExempt ? '⚠️  通过（环境豁免）' : '❌  存在失败项'}\n`);

  if (!allPassed && !envExempt) {
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

/**
 * R-350: 环境豁免判定（纯函数，便于单测）。
 *
 * 语义：一次 check 的**全部阻塞性失败**（passed=false 且 severity≠warning）都是
 * **确定性可证**的环境类失败（environment_exemptible）时，允许落 check_env_exempt
 * 而非 check_fail —— 让"不是代码问题"的工具链故障不再把任务卡死。
 *
 * 边界（B3 收紧版，用户裁定）：
 * - 空失败集（真的全过）不适用豁免，返回 false（走正常 check.passed）。
 * - 只要有一个失败项不是环境豁免类（结构门禁/harness 规则/真实编译测试失败），
 *   整单仍是失败——混合失败永不豁免。
 * - `--no-env-exempt` 强制关闭豁免。
 */
export function evaluateEnvironmentExemption(
  results: CheckResult[],
  options?: { noEnvExempt?: boolean },
): { exempt: boolean; failures: CheckResult[]; reason: string } {
  const failures = results.filter((r) => !r.passed && r.severity !== 'warning');
  if (failures.length === 0) return { exempt: false, failures, reason: 'no-blocking-failure' };
  if (options?.noEnvExempt) return { exempt: false, failures, reason: 'disabled-by-flag' };
  const allExemptible = failures.every((r) => r.environment_exemptible === true);
  return allExemptible
    ? { exempt: true, failures, reason: 'all-failures-are-toolchain' }
    : { exempt: false, failures, reason: 'non-environment-failure-present' };
}

export async function updateCheckWorkflowState(
  cwd: string,
  allPassed: boolean,
  results: CheckResult[],
  envExempt = false,
): Promise<void> {
  const workflowState = await readCurrentState(cwd);
  const passLike = allPassed || envExempt;
  const alreadyPastCheck = passLike && (
    (workflowState?.phase === 'reviewing' && workflowState?.gate === 'review_pass')
    || workflowState?.phase === 'completed'
  );
  if (alreadyPastCheck) return;
  const phase = workflowState?.phase || 'idle';
  const planningDone = passLike && phase === 'planning'
    ? await hasCompletedPlan(cwd)
    : false;
  const eventAllowed = passLike
    ? ['executing', 'checking', 'completed'].includes(phase) || planningDone
    : ['executing', 'checking', 'reviewing', 'completed'].includes(phase);
  if (!eventAllowed) return;

  // R-350: 环境豁免走独立事件/gate（check_env_exempt），审计可辨，非"假装通过"。
  const event = envExempt ? 'check.env_exempt' : allPassed ? 'check.passed' : 'check.failed';
  await transitionWorkflow(cwd, event, {
    currentStep: envExempt
      ? `质量检查环境豁免 (${results.length} 项，失败项均为工具链不可用)，下一步: docpath done`
      : allPassed
        ? `质量检查通过 (${results.length} 项)，下一步: docpath done`
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
  meta?: { cacheReused?: boolean; envExempt?: boolean },
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
    ...(result.environment_exemptible ? { environment_exemptible: true } : {}),
    ...(result.command ? { command: result.command } : {}),
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
    // R-350: 环境豁免——passed 视为 true（否则收口策略会拦），但显式标记豁免来源
    ...(meta?.envExempt ? { env_exempt: true } : {}),
    passed: allPassed || Boolean(meta?.envExempt),
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

export async function writeCheckBreadcrumb(cwd: string, taskId: string, results: CheckResult[], allPassed: boolean, envExempt = false): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'check',
    status: allPassed || envExempt ? 'done' : 'blocked',
    context: envExempt
      ? `质量检查环境豁免 (${results.length} 项，失败项均为工具链不可用)`
      : allPassed
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
  meta?: { cacheReused?: boolean; envExempt?: boolean },
): Promise<void> {
  const envExempt = Boolean(meta?.envExempt);
  await updateCheckWorkflowState(cwd, allPassed, results, envExempt);
  await writeLastCheckEvidence(cwd, results, allPassed, meta);
  await writeCheckBreadcrumb(cwd, taskId, results, allPassed, envExempt);
  await syncCurrentDocument(cwd);
  await updateCheckHistory(cwd, docpathDir, results, allPassed || envExempt);
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
