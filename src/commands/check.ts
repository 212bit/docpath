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

import {
  runProjectChecks,
} from './check/runners.js';

import {
  runTaskDocumentChecks,
} from './check/validators.js';

import {
  runHarnessChecks,
} from './check/harness.js';

import {
  printCheckReport,
  persistCheckEvidence,
} from './check/evidence.js';

import { logger } from '../utils/logger.js';
import { evaluateQuickScope } from '../engine/quick-guard.js';
import { readActiveStructuredSpecDocument } from '../utils/task-files.js';
import { writeCurrentState } from '../utils/workspace.js';

function normalizeHarnessOptions(options: CheckOptions): void {
  if (options.onlyHarness) {
    options.harness = true;
  }

  if ((options.preflight || options.boundary) && !options.harness) {
    options.harness = true;
  }
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

  // Automatically upgrade workflow profile to standard if needed
  if (current && current.task_id && (current.workflow_profile === 'quick' || current.workflow_profile === 'instant')) {
    const upgradeReasons: string[] = [];

    // 1. Check complexity level
    if (current.level >= 2) {
      upgradeReasons.push(`任务复杂度级别为 L${current.level}（quick/instant 限制在 L0/L1）`);
    }

    // 2. Check spec requirements
    try {
      const spec = await readActiveStructuredSpecDocument(docpathDir, current.task_id);
      if (spec) {
        if (spec.major_change_gate?.required) {
          upgradeReasons.push('任务需求规格（spec.md）要求重大变更确认门禁');
        }
        if (spec.ui_gate?.state === 'required') {
          upgradeReasons.push('任务需求规格（spec.md）要求 UI 设计门禁');
        }
      }
    } catch {
      // Ignore errors reading spec document during initial check
    }

    // 3. Check Git scope
    const scopeVerdict = evaluateQuickScope(cwd);
    if (!scopeVerdict.allowed) {
      scopeVerdict.reasons.forEach((reason) => {
        upgradeReasons.push(`代码变更超出 quick 限制: ${reason}`);
      });
    }

    if (upgradeReasons.length > 0) {
      logger.warn(`⚠️  检测到高等级属性、需求规格或超限变更，已自动将工作流 Profile 从 "${current.workflow_profile}" 升级为 "standard"`);
      upgradeReasons.forEach((reason) => logger.log(`   - ${reason}`));

      current = {
        ...current,
        workflow_profile: 'standard',
        level: Math.max(current.level, 2) as any,
        updated_at: new Date().toISOString(),
      };
      await writeCurrentState(cwd, current);
      logger.log('👉 已更新 .docpath/workspace/state.json，后续检查将强制执行 standard 门禁（如 plan/spec 校验与代码审查）。\n');
    }
  }

  warnWhenOutsideAgentSession(current, options);

  console.log('\n🔍  质量检查...\n');
  if (options.lite) {
    console.log('⚡  lite 模式（instant profile）：跳过 build/test/lint，仅 typecheck + 结构门禁\n');
  }
  const results: CheckResult[] = [];
  normalizeHarnessOptions(options);

  // 1-5. 常规检查（--only-harness 时跳过）
  if (!options.onlyHarness) {
    results.push(...await runProjectChecks(cwd, { ...options, skipTests, skipLint }));
    results.push(...await runTaskDocumentChecks(cwd, docpathDir, options));
  }

  // 6. Harness 规则检查 (--harness 选项)
  if (options.harness) {
    console.log('\n🔍  检查工作流护栏...\n');
    const harnessResults = await runHarnessChecks(cwd, docpathDir, options);
    results.push(...harnessResults);
  }

  const allPassed = results.every(r => r.passed || r.severity === 'warning');
  printCheckReport(results, allPassed, options.verbose);
  await persistCheckEvidence(cwd, docpathDir, current?.task_id || 'unknown', results, allPassed);

  if (!allPassed) {
    console.log('请修复失败项后重新运行 `docpath check`\n');
    throw new Error(`docpath check failed: ${results.filter(r => !r.passed && r.severity !== 'warning').map(r => r.name).join(', ')}`);
  } else {
    if (options.withReview) {
      console.log('\n🔄  自动执行 review...\n');
      await reviewCommand({ cwd, force: options.force });
    } else {
      console.log('下一步: `docpath review` 进行代码审查');
      await emitNextHint(cwd);
    }
  }
}
