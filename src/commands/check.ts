/**
 * docpath:check — 质量门禁 + 工作流护栏检查
 *
 * 执行编译/测试/lint 检查 + harness 规则检查，输出验证报告。
 * Level 2+ 自动写入 breadcrumb。
 *
 * 新增：--harness 检查 harness.md 中的 pre-flight/boundary/pattern 规则
 */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { emitNextHint } from '../utils/next-hint.js';
import { reviewCommand } from './review.js';
import type { CheckOptions, CheckResult } from './check/types.js';

import { logger } from '../utils/logger.js';
import { healStructuredMarkdownDrift } from '../utils/structured-heal.js';
import { syncProtocolBlocks } from '../utils/protocol-blocks.js';
import { resolveTemplate } from '../utils/install-core.js';
import { recordEnvExemption } from '../engine/policy.js';
import {
  performRiskReassessment,
  handleQuickUpgrade,
  evaluateQuickCheckDowngrade,
  renderStandardSpec,
} from './check/upgrade.js';

function normalizeHarnessOptions(options: CheckOptions): void {
  if (options.onlyHarness) {
    options.harness = true;
  }

  if ((options.preflight || options.boundary) && !options.harness) {
    options.harness = true;
  }
}

/** 入口阶段 1（R-287）：收敛 active task 的 spec/plan md/json 漂移。 */
async function healActiveTaskDrift(docpathDir: string, taskId: string | undefined): Promise<void> {
  if (!taskId) return;
  for (const file of ['spec.md', 'plan.md'] as const) {
    const healed = await healStructuredMarkdownDrift(docpathDir, taskId, file);
    if (healed.healed) logger.log(`🩹  ${file} 机器真理源漂移已自愈: ${healed.reason}`);
  }
}

/**
 * 入口阶段 2（R-300）：协议共享契约注入区一致性。fail-loud 指向 render——
 * gate 不写手写源；root↔canonical 归 install manifest drift 治理，不重叠。
 */
async function assertProtocolBlocksInSync(): Promise<void> {
  const templatesDir = await resolveTemplate();
  const blockReport = await syncProtocolBlocks(templatesDir, { write: false });
  if (!blockReport.available) return;
  const stale = blockReport.files.filter((f) => f.updated.length > 0 || f.unknown.length > 0);
  if (stale.length === 0) return;
  const detail = stale
    .map((f) => `${f.file}: ${[...f.updated, ...f.unknown.map((n) => `${n}(缺块源)`)].join(', ')}`)
    .join('; ');
  logger.error(`❌  协议共享契约注入区与块源不一致: ${detail}`);
  logger.log('    修复: docpath render --view protocols（重渲染注入区后提交 canonical）');
  throw new Error('docpath check failed: protocol blocks drift');
}

/**
 * 入口阶段 2.5（R-305）：任务身份 fail-loud 早退。
 *
 * 身份类失败（spec/plan 声明的 task_id 与 state 不一致、current/canonical 全缺
 * 的幽灵任务）不可自愈 —— 无论编译/测试跑多久都注定失败。原先它排在
 * runProjectChecks 之后，导致一次注定失败的 check 仍要付全量测试套件成本
 * （实测 40s+）。这里将其提到 runner 之前，只做只读判定，不放宽任何门禁。
 *
 * --only-harness 跳过常规检查路径，此时 runTaskDocumentChecks 不执行，
 * 故前置门须同步跳过，避免对 harness-only 运行引入新失败面。
 */
async function assertTaskIdentityFatal(cwd: string, docpathDir: string, options: CheckOptions): Promise<void> {
  if (options.onlyHarness) return;
  const { detectFatalTaskIdentityResults } = await import('./check/validators.js');
  const failures = await detectFatalTaskIdentityResults(cwd, docpathDir);
  if (failures.length === 0) return;
  logger.error(`❌  ${failures[0].name}`);
  logger.log(failures[0].output || '');
  throw new Error(`docpath check failed: ${failures[0].name}`);
}

function warnWhenOutsideAgentSession(current: Awaited<ReturnType<typeof readCurrentState>>, options: CheckOptions): void {
  if (current?.task_id || options.force) return;
  logger.warn('当前无活跃 agent 会话 (current.md 无 task_id)');
  logger.log('   这些检查通常应在 agent 流程内执行 (docpath agent done)');
  logger.log('   如需独立运行，添加 --force 标志');
  logger.log('');
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  const { cwd, skipTests, skipLint } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    logger.error('未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  let current = await readCurrentState(cwd);

  // ── check 入口阶段顺序契约（R-305）──
  // 顺序有语义依赖，调整前必读：
  //   1. healActiveTaskDrift    —— 必须先于一切 validator/runner：漂移未收敛时
  //      结构校验会把可自愈态误判为失败（R-287）。
  //   2. assertProtocolBlocksInSync —— fail-loud 早退：必须先于昂贵的编译/测试
  //      runner，避免为注定失败的 check 付全量套件成本（R-300）。
  //   2.5 assertTaskIdentityFatal —— 同类早退：任务身份（spec/plan 声明 id 不
  //      一致 / 幽灵任务）属不可自愈失败，跑完 670 个 E2E 也不会变绿，故与
  //      blocks 漂移并列在 runner 之前 fail-loud（R-305）。
  //   3. quick→standard 升级判定 —— 依赖已收敛的 spec 真源读取门禁声明。
  // 早退性由 CLI 级契约测试固化（blocks 漂移输出不得含编译检查段落）。
  await healActiveTaskDrift(docpathDir, current?.task_id);
  await assertProtocolBlocksInSync();
  await assertTaskIdentityFatal(cwd, docpathDir, options);

  // ── R-338 S4: check 期风险复评（所有 profile，只升不降）──
  const { current: reassessedCurrent, riskTier } = await performRiskReassessment(cwd, current);
  current = reassessedCurrent;

  // ── quick/instant 升级 standard 门禁 ──
  current = await handleQuickUpgrade(cwd, docpathDir, current, riskTier);

  warnWhenOutsideAgentSession(current, options);

  // ── B1: quick profile 测试降档（R-305）──
  const quickDowngraded = evaluateQuickCheckDowngrade(cwd, current, options);

  console.log('\n🔍  质量检查...\n');
  if (options.lite) {
    if (quickDowngraded) {
      console.log('⚡  quick 降档：改动未触碰核心路径且未超 quick 边界，跳过 build/test/lint');
      console.log('     （typecheck 与结构门禁照常执行；改到核心路径或超范围会自动回落全量）\n');
    } else {
      console.log('⚡  lite 模式（instant profile）：跳过 build/test/lint，仅 typecheck + 结构门禁\n');
    }
  }
  const results: CheckResult[] = [];
  normalizeHarnessOptions(options);

  // ── 执行 pre-check 生命周期 Hook ──
  try {
    const { executeLifecycleHook } = await import('../engine/hook-runner.js');
    const preHookReport = await executeLifecycleHook(cwd, 'pre-check', { taskId: current?.task_id });
    if (!preHookReport.passed) {
      for (const res of preHookReport.results.filter((r) => !r.passed && r.fail_fast)) {
        results.push({
          name: `Hook (pre-check): ${res.name}`,
          passed: false,
          output: `❌ Hook 执行失败 (退出码 ${res.exitCode}):\n${res.output || res.error || ''}`,
          category: 'compile',
          severity: 'error',
        });
      }
    }
  } catch {
    // fail-safe
  }

  // 1-5. 常规检查（--only-harness 时跳过）
  // R-331: scope 缓存——代码范围 digest 与上次绿色全量 check 一致时复用重 runner 判定，
  // 结构门禁（runTaskDocumentChecks）照常新鲜执行。lite/only-harness 本就不跑重 runner，
  // 不参与复用；--no-cache 强制全量。
  let cacheReused = false;
  if (!options.onlyHarness) {
    const { runTaskDocumentChecks } = await import('./check/validators.js');
    let cachedHeavy: CheckResult[] | null = null;
    if (!options.lite && !options.noCache) {
      const { tryReuseCachedHeavyChecks } = await import('./check/cache.js');
      const { readCheckCodeScopePaths } = await import('../utils/config.js');
      const customScopePaths = await readCheckCodeScopePaths(cwd);
      cachedHeavy = await tryReuseCachedHeavyChecks(docpathDir, cwd, customScopePaths);
    }
    if (cachedHeavy && cachedHeavy.length > 0) {
      cacheReused = true;
      results.push(...cachedHeavy);
      console.log('♻️  scope 缓存命中：代码范围自上次绿色 check 无变更，typecheck/build/test/lint 判定复用（--no-cache 强制全量）\n');
    } else {
      const { runProjectChecks } = await import('./check/runners.js');
      results.push(...await runProjectChecks(cwd, { ...options, skipTests, skipLint }));
    }
    results.push(...await runTaskDocumentChecks(cwd, docpathDir, options));
  }

  // 6. Harness 规则检查 (--harness 选项)
  if (options.harness) {
    console.log('\n🔍  检查工作流护栏...\n');
    const { runHarnessChecks } = await import('./check/harness.js');
    const harnessResults = await runHarnessChecks(cwd, docpathDir, options);
    results.push(...harnessResults);
  }

  const { printCheckReport, persistCheckEvidence, evaluateEnvironmentExemption } = await import('./check/evidence.js');
  const allPassed = results.every(r => r.passed || r.severity === 'warning');
  // R-350: 环境豁免判定（B3 收紧集 + --no-env-exempt 反向开关）
  const exemption = evaluateEnvironmentExemption(results, { noEnvExempt: options.noEnvExempt });
  const envExempt = !allPassed && exemption.exempt;
  printCheckReport(results, allPassed, options.verbose, envExempt);
  await persistCheckEvidence(cwd, docpathDir, current?.task_id || 'unknown', results, allPassed, { cacheReused, envExempt });
  if (envExempt) {
    await recordEnvExemption(cwd, exemption.failures);
  }

  if (!allPassed && !envExempt) {
    console.log('请修复失败项后重新运行 `docpath check`\n');
    throw new Error(`docpath check failed: ${results.filter(r => !r.passed && r.severity !== 'warning').map(r => r.name).join(', ')}`);
  } else {
    // ── 执行 post-check 生命周期 Hook ──
    try {
      const { executeLifecycleHook } = await import('../engine/hook-runner.js');
      await executeLifecycleHook(cwd, 'post-check', { taskId: current?.task_id });
    } catch {
      // fail-safe
    }

    if (options.withReview) {
      console.log('\n🔄  自动执行 review...\n');
      await reviewCommand({ cwd, force: options.force });
    } else {
      console.log('下一步: `docpath done` 执行收口门禁（check -> review -> journal）；如需单独排查可运行 `docpath review`');
      await emitNextHint(cwd);
    }
  }
}

export {
  touchesRiskyPath,
  selectTouchedTestFiles,
  resolveTestCommand,
  testRelatesToFile,
  resolveGoTestCommand,
  resolvePythonTestCommand,
  resolveRustTestCommand,
  listPythonTestFiles,
} from './check/test-scope.js';

