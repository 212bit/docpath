/**
 * docpath:check — 质量门禁 + 工作流护栏检查
 *
 * 执行编译/测试/lint 检查 + harness 规则检查，输出验证报告。
 * Level 2+ 自动写入 breadcrumb。
 *
 * 新增：--harness 检查 harness.md 中的 pre-flight/boundary/pattern 规则
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolveDocpathDir, writeFileSafe } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { emitNextHint } from '../utils/next-hint.js';
import { reviewCommand } from './review.js';
import type { CheckOptions, CheckResult } from './check/types.js';
import { join } from 'path';

import { logger } from '../utils/logger.js';
import { evaluateQuickScope } from '../engine/quick-guard.js';
import { readActiveStructuredSpecDocument, canonicalTaskDir } from '../utils/task-files.js';
import { writeCurrentState } from '../utils/workspace.js';
import { resolveEffectiveWorkflowProfile } from '../engine/workflow-profile.js';

/**
 * 为升级后的 standard 任务渲染标准 spec.md。
 * 保留原 quick 任务的 title 和已有 FR 需求摘要。
 */
function renderStandardSpec(taskId: string, title: string, existingRequirements: string[]): string {
  const reqLines = existingRequirements.length > 0
    ? existingRequirements.map((r, i) => `- [ ] FR-${i + 1}: ${r}`).join('\n')
    : '- [ ] FR-1: 待补充';

  return [
    `# ${taskId} - ${title}`,
    '',
    '> workflow_profile: standard',
    '> source: docpath check (auto-upgraded from quick)',
    '',
    '## 1. 背景与动机',
    '',
    '<!-- 原 quick 任务已自动升级为 standard 流程，需要补全设计文档。 -->',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    reqLines,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 待补充',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- 待补充',
    '',
    '### 不包含',
    '- 待补充',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 待补充 | | | |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    '- [ ] 否',
    '- [x] 是，需要用户确认',
    '',
    '### Decision Brief',
    '- 当前问题: 待补充',
    '- 目标: 待补充',
    '- 可选方案: 待补充',
    '- 推荐方案: 待补充',
    '- 用户确认: 待确认',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 待补充',
    '',
    '---',
    '',
    '*此文件由 `docpath check` 在升级 quick→standard 时自动生成。*',
  ].join('\n');
}

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

  if (current && current.task_id && (current.workflow_profile === 'quick' || current.workflow_profile === 'instant')) {
    let spec: Awaited<ReturnType<typeof readActiveStructuredSpecDocument>> = null;
    try {
      spec = await readActiveStructuredSpecDocument(docpathDir, current.task_id);
    } catch {
      // Ignore errors reading spec document during initial check.
    }

    const scopeVerdict = evaluateQuickScope(cwd);
    const resolution = resolveEffectiveWorkflowProfile({
      profile: current.workflow_profile,
      level: current.level,
      majorChangeRequired: spec?.major_change_gate?.required,
      majorChangeTypes: spec?.major_change_gate?.types,
      uiGateRequired: spec?.ui_gate?.state === 'required',
      quickScopeExceededReasons: scopeVerdict.allowed ? [] : scopeVerdict.reasons,
    });

    if (resolution.upgraded) {
      logger.warn(`⚠️  检测到高等级属性、需求规格或超限变更，已自动将工作流 Profile 从 "${resolution.storedProfile}" 升级为 "${resolution.effectiveProfile}"`);
      resolution.reasons.forEach((reason) => logger.log(`   - ${reason}`));

      current = {
        ...current,
        workflow_profile: resolution.effectiveProfile,
        level: Math.max(current.level, 2) as any,
        updated_at: new Date().toISOString(),
      };
      await writeCurrentState(cwd, current);
      logger.log('👉 已更新 .docpath/workspace/state.json，后续检查将强制执行 standard 门禁（如 plan/spec 校验与代码审查）。\n');

      // 将 quick 风格的 spec.md 替换为 standard 模板
      const taskDir = canonicalTaskDir(docpathDir, current.task_id);
      const specPath = join(taskDir, 'spec.md');
      if (existsSync(specPath)) {
        try {
          const oldSpec = await readFile(specPath, 'utf-8');
          const isQuickSpec = oldSpec.includes('workflow_profile: quick') || oldSpec.includes('source: docpath quick');
          if (isQuickSpec) {
            const titleLine = oldSpec.split('\n').find(l => l.startsWith('# '));
            const title = titleLine ? titleLine.replace(/^# /, '').trim() : current.task_title || current.task_id;
            const frLines: string[] = [];
            for (const line of oldSpec.split('\n')) {
              const match = line.match(/^- \[ \] FR-\d+:(.*)/);
              if (match) frLines.push(match[1].trim());
              if (frLines.length >= 3) break;
            }
            const newSpec = renderStandardSpec(current.task_id, title, frLines);
            await writeFileSafe(specPath, newSpec);
            logger.log('📝  已自动将 spec.md 升级为 standard 格式（保留原标题和需求摘要）。');
            logger.log('   请运行 `docpath write-spec` 将变更同步到 spec.json。');
            logger.log('');
          }
        } catch {
          logger.warn('⚠️  读取 spec.md 失败，跳过模板升级。');
        }
      }
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
    const { runProjectChecks } = await import('./check/runners.js');
    const { runTaskDocumentChecks } = await import('./check/validators.js');
    results.push(...await runProjectChecks(cwd, { ...options, skipTests, skipLint }));
    results.push(...await runTaskDocumentChecks(cwd, docpathDir, options));
  }

  // 6. Harness 规则检查 (--harness 选项)
  if (options.harness) {
    console.log('\n🔍  检查工作流护栏...\n');
    const { runHarnessChecks } = await import('./check/harness.js');
    const harnessResults = await runHarnessChecks(cwd, docpathDir, options);
    results.push(...harnessResults);
  }

  const { printCheckReport, persistCheckEvidence } = await import('./check/evidence.js');
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
