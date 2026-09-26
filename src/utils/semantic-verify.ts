/**
 * semantic-verify.ts — 任务语义反漂移与需求闭环门禁
 *
 * 核心职能：
 * 1. 范围边界守卫 (Scope Boundary Guard): 拦截修改 Scope.excluded 文件的越界行为
 * 2. 需求全量闭环 (Requirements & Criteria Completeness): 追踪每个 FR/AC 条目在 Plan/代码/测试中的落地
 * 3. 步骤履约真实性 (Step Fulfillment Evidence Check): 检验标记为 done 的步骤是否有实际证据
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDocpathDir, readFileSafe } from './file.js';
import { readCurrentState } from './workspace.js';
import { readActiveTaskFile, currentTaskDir, canonicalTaskDir } from './task-files.js';
import {
  readStructuredSpecDocument,
  readStructuredTaskDocument,
  parseSpecMarkdownDocument,
  parsePlanMarkdownDocument,
  type StructuredSpecDocument,
  type StructuredPlanDocument,
  type StructuredPlanStep,
  type StructuredSpecItem,
} from './structured-docs.js';
import { gitSyncOptional } from './git-run.js';
import { readBreadcrumb } from './breadcrumb.js';

export interface ScopeViolation {
  file: string;
  pattern: string;
  reason: string;
}

export interface ScopeVerificationResult {
  passed: boolean;
  includedPatterns: string[];
  excludedPatterns: string[];
  violations: ScopeViolation[];
  warnings: { file: string; reason: string }[];
}

export interface RequirementVerificationItem {
  id: string;
  text: string;
  status: 'satisfied' | 'in_progress' | 'unmapped' | 'failed';
  mappedSteps: string[];
  evidence: string[];
}

export interface CriteriaVerificationItem {
  id: string;
  text: string;
  status: 'passed' | 'pending' | 'unmapped';
  mappedSteps: string[];
}

export interface StepFulfillmentItem {
  stepId: string;
  name: string;
  status: 'pending' | 'done' | 'skipped' | 'blocked';
  hasEvidence: boolean;
  evidenceReason: string;
}

export interface SemanticVerificationReport {
  taskId: string | null;
  taskTitle: string;
  phase: string;
  level: number;
  passed: boolean;
  errorsCount: number;
  warningsCount: number;
  scope: ScopeVerificationResult;
  requirements: {
    total: number;
    satisfied: number;
    unmapped: number;
    items: RequirementVerificationItem[];
  };
  acceptanceCriteria: {
    total: number;
    passed: number;
    unmapped: number;
    items: CriteriaVerificationItem[];
  };
  steps: {
    total: number;
    completed: number;
    items: StepFulfillmentItem[];
  };
  changedFiles: string[];
  suggestedActions: string[];
}

/**
 * 获取当前工作区改动的文件列表（包含暂存、未暂存与未跟踪文件）
 */
export function getModifiedFiles(cwd: string): string[] {
  const diffOut = gitSyncOptional(cwd, ['diff', '--name-only', 'HEAD']) || '';
  const statusOut = gitSyncOptional(cwd, ['status', '--porcelain', '-u']) || '';

  const files = new Set<string>();
  for (const line of diffOut.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }

  for (const line of statusOut.split('\n')) {
    if (line.length >= 4) {
      const path = line.slice(3).trim();
      // 去除可能存在的重命名 -> 格式
      const target = path.includes(' -> ') ? path.split(' -> ')[1].trim() : path;
      if (target) files.add(target);
    }
  }

  return Array.from(files).sort();
}

/**
 * 模式匹配（支持通配符 * 及路径包含）
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normPath = filePath.replace(/\\/g, '/').toLowerCase();
  const normPat = pattern.replace(/\\/g, '/').trim().toLowerCase();
  if (!normPat) return false;

  // 精确匹配
  if (normPath === normPat) return true;

  // 通配符转正则
  if (normPat.includes('*')) {
    const escaped = normPat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(normPath)) return true;
    } catch {
      // 容错
    }
  }

  // 子路径或文件名匹配
  if (normPath.includes(normPat) || normPath.endsWith(normPat)) return true;

  return false;
}

/**
 * 执行语义反漂移与需求闭环检查
 */
export async function runSemanticVerification(cwd: string): Promise<SemanticVerificationReport> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || null;
  const taskTitle = state?.task_title || (taskId ? `Task ${taskId}` : '未绑定活跃任务');
  const phase = state?.phase || 'idle';
  const level = state?.level || 1;

  const changedFiles = getModifiedFiles(cwd);

  // 1. 读取 Spec 与 Plan
  let spec: StructuredSpecDocument | null = null;
  let plan: StructuredPlanDocument | null = null;

  if (taskId) {
    const canonicalDir = canonicalTaskDir(docpathDir, taskId);
    const currDir = currentTaskDir(docpathDir);

    spec = (await readStructuredSpecDocument(canonicalDir)) || (await readStructuredSpecDocument(currDir));
    if (!spec) {
      const specMd = (await readActiveTaskFile(docpathDir, taskId, 'spec.md')) || '';
      if (specMd.trim()) {
        spec = parseSpecMarkdownDocument(specMd, { taskId });
      }
    }

    plan = ((await readStructuredTaskDocument(canonicalDir, 'plan.md')) ||
      (await readStructuredTaskDocument(currDir, 'plan.md'))) as StructuredPlanDocument | null;
    if (!plan) {
      const planMd = (await readActiveTaskFile(docpathDir, taskId, 'plan.md')) || '';
      if (planMd.trim()) {
        plan = parsePlanMarkdownDocument(planMd);
      }
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestedActions: string[] = [];

  // ─── A. 范围边界守卫 (Scope Guard) ───
  const includedPatterns = spec?.scope?.included || [];
  const excludedPatterns = spec?.scope?.excluded || [];
  const violations: ScopeViolation[] = [];
  const scopeWarnings: { file: string; reason: string }[] = [];

  // 过滤掉 docpath 运行时内部文件 (.docpath/workspace/*, .docpath/tasks/current/* 等)
  const businessChanges = changedFiles.filter(
    (f) => !f.startsWith('.docpath/workspace/') && !f.startsWith('.docpath/tasks/current/'),
  );

  for (const file of businessChanges) {
    // 检查是否命中 excluded
    for (const pattern of excludedPatterns) {
      if (pattern && matchesPattern(file, pattern)) {
        violations.push({
          file,
          pattern,
          reason: `文件 "${file}" 命中了 Spec 范围外排除项 (Scope.excluded): "${pattern}"`,
        });
      }
    }
  }

  if (violations.length > 0) {
    errors.push(`检测到 ${violations.length} 处越界改动 (Scope Drift)，修改了明确排除的范围文件。`);
    suggestedActions.push('撤销或剥离超出 Scope.excluded 范围的改动文件，或更新 spec.md 重新评估范围。');
  }

  const scopeResult: ScopeVerificationResult = {
    passed: violations.length === 0,
    includedPatterns,
    excludedPatterns,
    violations,
    warnings: scopeWarnings,
  };

  // ─── B. 需求履约追踪 (FR-* Completeness) ───
  const frItems: RequirementVerificationItem[] = [];
  const planSteps: StructuredPlanStep[] = plan?.steps || [];
  const specFRs: StructuredSpecItem[] = spec?.functional_requirements || [];

  for (const fr of specFRs) {
    const id = fr.id;
    const text = fr.text;

    // 在 Plan 中查找关联该 FR 的步骤
    const mapped = planSteps
      .filter((step) => {
        const fullStepText = `${step.id} ${step.name} ${step.description} ${step.acceptance}`.toLowerCase();
        return fullStepText.includes(id.toLowerCase()) || (text.length > 4 && fullStepText.includes(text.slice(0, 10).toLowerCase()));
      })
      .map((s) => s.id);

    // 判断状态
    let itemStatus: RequirementVerificationItem['status'] = 'in_progress';
    if (mapped.length === 0) {
      itemStatus = 'unmapped';
      warnings.push(`需求 ${id} ("${text}") 未在任何 Plan 步骤中被明确关联与规划。`);
    } else {
      const allMappedDone = mapped.every((stepId) => {
        const stepObj = planSteps.find((s) => s.id === stepId);
        return stepObj?.status === 'done';
      });

      if (fr.done || allMappedDone) {
        itemStatus = 'satisfied';
      } else {
        itemStatus = 'in_progress';
      }
    }

    // 若当前处于 closeout 阶段 (completed 或 checking) 且 FR 未达成，则记录错误
    if ((phase === 'completed' || phase === 'checking') && itemStatus !== 'satisfied' && fr.done !== true) {
      errors.push(`任务收尾检查失败: 需求 ${id} 尚未完全满足或未完成。`);
    }

    frItems.push({
      id,
      text,
      status: itemStatus,
      mappedSteps: mapped,
      evidence: mapped.length > 0 ? [`Plan: ${mapped.join(', ')}`] : [],
    });
  }

  // ─── C. 验收标准追踪 (AC-* Completeness) ───
  const acItems: CriteriaVerificationItem[] = [];
  const specACs: StructuredSpecItem[] = spec?.acceptance_criteria || [];

  for (const ac of specACs) {
    const id = ac.id;
    const text = ac.text;

    const mapped = planSteps
      .filter((step) => {
        const fullStepText = `${step.id} ${step.name} ${step.description} ${step.acceptance}`.toLowerCase();
        return fullStepText.includes(id.toLowerCase());
      })
      .map((s) => s.id);

    let acStatus: CriteriaVerificationItem['status'] = 'pending';
    if (mapped.length === 0) {
      acStatus = 'unmapped';
    } else {
      const allDone = mapped.every((stepId) => {
        const stepObj = planSteps.find((s) => s.id === stepId);
        return stepObj?.status === 'done';
      });
      acStatus = ac.done || allDone ? 'passed' : 'pending';
    }

    acItems.push({
      id,
      text,
      status: acStatus,
      mappedSteps: mapped,
    });
  }

  // ─── D. 步骤履约真实性 (Step Fulfillment) ───
  const stepItems: StepFulfillmentItem[] = [];
  const breadcrumb = await readBreadcrumb(cwd);

  for (const step of planSteps) {
    const isDone = step.status === 'done';
    const hasBreadcrumb = breadcrumb.entries.some((e) => e.step === step.id && e.status === 'done');
    const hasDiff = businessChanges.length > 0;

    let hasEvidence = true;
    let evidenceReason = '执行正常';

    if (isDone && !hasBreadcrumb && !hasDiff) {
      hasEvidence = false;
      evidenceReason = '步骤标记为 done，但工作区无关联改动文件且无 breadcrumb 执行痕迹 (疑似伪完成)';
      warnings.push(`步骤 ${step.id} (${step.name}) 缺少实质执行证据。`);
    }

    stepItems.push({
      stepId: step.id,
      name: step.name,
      status: step.status,
      hasEvidence,
      evidenceReason,
    });
  }

  // 生成智能建议动作
  if (unmappedFRCount(frItems) > 0) {
    suggestedActions.push('运行 `docpath plan` 重新同步或补充缺少 FR 映射的步骤。');
  }
  if (phase === 'executing' && frItems.some((f) => f.status === 'in_progress')) {
    suggestedActions.push('使用 `docpath go --step <id>` 或 `docpath step-pass` 推进未完成的步骤。');
  }

  const satisfiedFRs = frItems.filter((f) => f.status === 'satisfied').length;
  const passedACs = acItems.filter((a) => a.status === 'passed').length;
  const completedSteps = stepItems.filter((s) => s.status === 'done').length;

  const passed = errors.length === 0 && violations.length === 0;

  return {
    taskId,
    taskTitle,
    phase,
    level,
    passed,
    errorsCount: errors.length,
    warningsCount: warnings.length,
    scope: scopeResult,
    requirements: {
      total: frItems.length,
      satisfied: satisfiedFRs,
      unmapped: unmappedFRCount(frItems),
      items: frItems,
    },
    acceptanceCriteria: {
      total: acItems.length,
      passed: passedACs,
      unmapped: acItems.filter((a) => a.status === 'unmapped').length,
      items: acItems,
    },
    steps: {
      total: stepItems.length,
      completed: completedSteps,
      items: stepItems,
    },
    changedFiles,
    suggestedActions,
  };
}

function unmappedFRCount(items: RequirementVerificationItem[]): number {
  return items.filter((i) => i.status === 'unmapped').length;
}

/**
 * 渲染终端表格看板
 */
export function renderSemanticVerificationTable(report: SemanticVerificationReport): string {
  const lines: string[] = [];
  const statusBadge = report.passed
    ? '✅ PASSED (语义与边界合规)'
    : '❌ FAILED (存在语义漂移或越界违规)';

  lines.push('');
  lines.push(`🔍  DocPath 语义反漂移与需求闭环看板 [${statusBadge}]`);
  lines.push(`    任务: ${report.taskId || '无'} (${report.taskTitle}) | 阶段: ${report.phase} | 改动文件: ${report.changedFiles.length} 个`);
  lines.push('─'.repeat(72));

  // 1. Scope 范围边界守卫
  lines.push('🛡️  范围边界守卫 (Scope Boundary Guard):');
  if (report.scope.excludedPatterns.length === 0 && report.scope.includedPatterns.length === 0) {
    lines.push('   ⚪ 未定义显式 Scope.included / excluded 规则 (开放范围)');
  } else {
    if (report.scope.excludedPatterns.length > 0) {
      lines.push(`   🚫 明确排除 (Scope.excluded): ${report.scope.excludedPatterns.join(', ')}`);
    }
    if (report.scope.violations.length === 0) {
      lines.push('   🟢 范围合规：当前改动未触碰任何排除文件');
    } else {
      for (const v of report.scope.violations) {
        lines.push(`   🔴 [越界违规] ${v.file} (命中排除规则: ${v.pattern})`);
      }
    }
  }

  lines.push('');
  // 2. 需求覆盖与履约矩阵
  lines.push(`📋 功能需求闭环 (FR Completeness: ${report.requirements.satisfied}/${report.requirements.total}):`);
  if (report.requirements.items.length === 0) {
    lines.push('   ⚪ 当前任务无显式 FR-* 清单');
  } else {
    for (const fr of report.requirements.items) {
      let icon = '🟡';
      let tag = '[进行中]';
      if (fr.status === 'satisfied') {
        icon = '🟢';
        tag = '[已达成]';
      } else if (fr.status === 'unmapped') {
        icon = '🔴';
        tag = '[未规划]';
      }
      const mapped = fr.mappedSteps.length > 0 ? `→ 步骤: ${fr.mappedSteps.join(', ')}` : '(无映射步骤)';
      lines.push(`   ${icon} ${fr.id} ${tag} ${fr.text} ${mapped}`);
    }
  }

  lines.push('');
  // 3. 验收条件履约
  lines.push(`🎯 验收标准达成 (AC Verification: ${report.acceptanceCriteria.passed}/${report.acceptanceCriteria.total}):`);
  if (report.acceptanceCriteria.items.length === 0) {
    lines.push('   ⚪ 当前任务无显式 AC-* 验收标准');
  } else {
    for (const ac of report.acceptanceCriteria.items) {
      const icon = ac.status === 'passed' ? '🟢' : ac.status === 'unmapped' ? '⚪' : '🟡';
      const tag = ac.status === 'passed' ? '[已通过]' : ac.status === 'unmapped' ? '[未映射]' : '[待验证]';
      lines.push(`   ${icon} ${ac.id} ${tag} ${ac.text}`);
    }
  }

  // 4. 建议与动作
  if (report.suggestedActions.length > 0) {
    lines.push('');
    lines.push('💡 建议修复动作:');
    for (const act of report.suggestedActions) {
      lines.push(`   👉 ${act}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
