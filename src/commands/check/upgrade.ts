import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { evaluateQuickScope } from '../../engine/quick-guard.js';
import { readActiveStructuredSpecDocument, canonicalTaskDir, writeActiveTaskFile } from '../../utils/task-files.js';
import { mutateCurrentState } from '../../utils/workspace.js';
import { resolveEffectiveWorkflowProfile } from '../../engine/workflow-profile.js';
import { endStepExecution } from '../runtime.js';
import { reassessRiskTier, riskPolicyFromConfig } from '../../engine/risk.js';
import { recordRiskEscalation } from '../../engine/policy.js';
import { readRiskPolicyConfig } from '../../utils/config.js';
import type { CheckOptions } from './types.js';
import type { CurrentState } from '../../utils/workspace.js';

/**
 * 为升级后的 standard 任务渲染标准 spec.md。
 * 保留原 quick 任务的 title 和已有 FR 需求摘要。
 */
export function renderStandardSpec(taskId: string, title: string, existingRequirements: string[]): string {
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

/**
 * R-338 S4: check 期风险复评（所有 profile，只升不降）。
 * 基于实际 diff + 任务标题文本信号复评风险，与创建期记录的 risk_tier 取 max。
 */
export async function performRiskReassessment(
  cwd: string,
  current: CurrentState | null
): Promise<{ current: CurrentState | null; riskTier: number | undefined }> {
  let riskTier: number | undefined = current?.risk_tier;
  if (!current?.task_id) {
    return { current, riskTier };
  }

  const riskPolicy = riskPolicyFromConfig(await readRiskPolicyConfig(cwd));
  const reassessment = reassessRiskTier(current.risk_tier, {
    files: evaluateQuickScope(cwd).guardedFiles,
    text: current.task_title || '',
    policy: riskPolicy,
  });
  riskTier = reassessment.tier;
  let updatedCurrent = current;

  if (reassessment.escalated) {
    const escalated = current;
    updatedCurrent = await mutateCurrentState(cwd, (previous) => ({
      ...(previous ?? escalated),
      risk_tier: riskTier,
      updated_at: new Date().toISOString(),
    }));
    logger.warn(`⚠️  风险复评升级: R${reassessment.baseline} → R${reassessment.tier}（只升不降）`);
    reassessment.reasons.forEach((reason) => logger.log(`   - ${reason}`));
    await recordRiskEscalation(cwd, reassessment.baseline, reassessment.tier, reassessment.reasons);
    logger.log('');
  }

  return { current: updatedCurrent, riskTier };
}

/**
 * 检查 quick / instant 任务是否需要自动升级为 standard 工作流。
 */
export async function handleQuickUpgrade(
  cwd: string,
  docpathDir: string,
  current: CurrentState | null,
  riskTier: number | undefined
): Promise<CurrentState | null> {
  if (!current || !current.task_id || (current.workflow_profile !== 'quick' && current.workflow_profile !== 'instant')) {
    return current;
  }

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
    riskTier,
    majorChangeRequired: spec?.major_change_gate?.required,
    majorChangeTypes: spec?.major_change_gate?.types,
    uiGateRequired: spec?.ui_gate?.state === 'required',
    quickScopeExceededReasons: scopeVerdict.allowed ? [] : scopeVerdict.reasons,
  });

  if (!resolution.upgraded) {
    return current;
  }

  logger.log(`⚠️  检测到高等级属性、需求规格或超限变更，已自动将工作流 Profile 从 "${resolution.storedProfile}" 升级为 "${resolution.effectiveProfile}"`);
  resolution.reasons.forEach((reason) => logger.log(`   - ${reason}`));

  const fallback = current;
  const updatedCurrent = await mutateCurrentState(cwd, (previous) => {
    const base = previous ?? fallback;
    return {
      ...base,
      workflow_profile: resolution.effectiveProfile,
      level: Math.max(base.level, 2),
      updated_at: new Date().toISOString(),
    };
  });
  logger.log('👉 已更新 .docpath/workspace/state.json，后续检查将强制执行 standard 门禁（如 plan/spec 校验与代码审查）。\n');

  // 将 quick 风格的 spec.md 替换为 standard 模板
  const taskDir = canonicalTaskDir(docpathDir, updatedCurrent.task_id);
  const specPath = join(taskDir, 'spec.md');
  if (existsSync(specPath)) {
    try {
      const oldSpec = await readFile(specPath, 'utf-8');
      const isQuickSpec = oldSpec.includes('workflow_profile: quick') || oldSpec.includes('source: docpath quick');
      if (isQuickSpec) {
        const titleLine = oldSpec.split('\n').find(l => l.startsWith('# '));
        const title = titleLine ? titleLine.replace(/^# /, '').trim() : updatedCurrent.task_title || updatedCurrent.task_id;
        const frLines: string[] = [];
        for (const line of oldSpec.split('\n')) {
          const match = line.match(/^- \[ \] FR-\d+:(.*)/);
          if (match) frLines.push(match[1].trim());
          if (frLines.length >= 3) break;
        }
        const newSpec = renderStandardSpec(updatedCurrent.task_id, title, frLines);
        await writeActiveTaskFile(docpathDir, updatedCurrent.task_id, 'spec.md', newSpec);
        logger.log('📝  已自动将 spec.md 升级为 standard 格式并同步 spec.json 真源（保留原标题和需求摘要）。');

        const planPath = join(taskDir, 'plan.md');
        if (!existsSync(planPath)) {
          const singleStepPlan = [
            '## 执行计划',
            '',
            `### S1: 实现并验证 ${title}`,
            `- **描述**: 完成 ${title}（quick 升级 standard 压缩计划）。`,
            '- **验收条件**: 代码实现就绪并通过质量门禁与审查',
            '- **依赖**: 无',
            '',
            '## Checklist',
            '- [x] S1',
            '',
            '## 依赖关系图',
            'S1',
            '',
          ].join('\n');
          await writeActiveTaskFile(docpathDir, updatedCurrent.task_id, 'plan.md', singleStepPlan);
          await endStepExecution({
            cwd,
            step: 'S1',
            status: 'done',
            note: 'quick 升级 standard 自动闭环执行计划',
          });
          logger.log('📋  已自动补齐单步执行计划并闭环完成证据（保留 quick 代码已交付上下文）。');
        }
        logger.log('');
      }
    } catch {
      logger.warn('⚠️  读取 spec.md 失败，跳过模板升级。');
    }
  }

  return updatedCurrent;
}

/**
 * 评估 quick profile 是否可以测试降档（B1: R-305）。
 */
export function evaluateQuickCheckDowngrade(
  cwd: string,
  current: CurrentState | null,
  options: CheckOptions
): boolean {
  if (options.lite || options.skipTests || current?.workflow_profile !== 'quick') {
    return false;
  }
  const verdict = evaluateQuickScope(cwd);
  if (verdict.allowed) {
    options.lite = true;
    return true;
  }
  return false;
}
