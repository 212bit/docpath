/**
 * UI 设计门禁 — go 与 check 共享的单一判定真源。
 *
 * 解决两类根因：
 * 1. 判定漂移：以前 go 对 UI 设计零感知，check 用一套正则，标准不一致。
 *    现在两者都走本模块，"是否需要设计 / 缺哪些产物" 只有一个定义。
 * 2. 措辞脆弱：以前靠正则猜 "是不是 UI 任务"，英文/别的说法即假阴性，
 *    且 spec 写 "不包含产品 UI" 就能自证豁免。现在以 spec 4.1 的
 *    **显式勾选框** 为准，关键词只在没勾选时兜底（向后兼容老 spec）。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolveDocpathDir } from './file.js';
import { readActiveStructuredSpecDocument, readActiveTaskFile, resolveActiveTaskDocPath } from './task-files.js';
import { readCurrentState } from './workspace.js';

/**
 * UI 设计要求判定结果。
 * - required: 任务涉及产品 UI 实现，go 前必须有 design-preview + 已批准 design-approval
 * - exempt:   任务显式声明不涉及产品 UI，合法豁免（可审计，留痕在 spec）
 * - unknown:  spec 未声明，回退到关键词检测决定是否拦截
 */
export type UiDesignRequirement = 'required' | 'exempt' | 'unknown';

// ── 关键词回退（仅 unknown 时使用）──────────────────────────

export function isUiUxTaskText(text: string): boolean {
  return /UI\/UX|UX|用户界面|界面重构|页面重构|页面|layout|navigation|visual|视觉设计|设计预览|视觉验收|Design Preview|Visual Acceptance|responsive UI|响应式界面|Figma|Stitch|v0|Framer/i.test(text);
}

export function isUiUxWorkflowOnlyTask(text: string): boolean {
  return /Codex Skill|Agent 指引|check gate|Approval Gate|Design Approval Gate|门禁|模板|流程|workflow|write-design|docpath check/i.test(text)
    && /不包含[\s\S]{0,240}(实际重构|产品 UI|页面实现)|不做[\s\S]{0,240}(实际重构|产品 UI|页面实现)/i.test(text);
}

export function hasUiImplementationIntent(text: string): boolean {
  return /Implementation|实现阶段|进入实现|写产品 UI 代码|产品 UI 代码|UI 代码|改 UI|页面实现|布局实现|组件实现|responsive implementation|视觉实现/i.test(text);
}

// ── 显式声明框解析（spec 4.1 「UI 设计门禁」）────────────────

/**
 * 从 spec 文本解析 4.1 的显式 UI 设计门禁勾选。
 * 模板行：
 *   - [ ] 本任务不涉及产品 UI 实现（豁免设计五件套）
 *   - [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）
 * 注意 "不涉及" 是 "涉及" 的超串，必须先判 "不涉及"，避免误命中。
 */
export function parseExplicitUiDeclaration(specText: string): UiDesignRequirement {
  const lines = specText.split('\n');
  let exemptChecked = false;
  let requiredChecked = false;
  for (const line of lines) {
    if (!/^\s*-\s*\[[xX]\]/.test(line)) continue;
    if (/不涉及产品\s*UI/.test(line)) exemptChecked = true;
    else if (/涉及产品\s*UI/.test(line)) requiredChecked = true;
  }
  // 同时勾选视为需要设计（从严），避免误放行。
  if (requiredChecked) return 'required';
  if (exemptChecked) return 'exempt';
  return 'unknown';
}

// ── 任务文本聚合 ─────────────────────────────────────────────

async function readActiveTaskText(cwd: string): Promise<{ specText: string; haystack: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const title = `${state?.task_title || ''} ${state?.task_id || ''}`;
  const planPath = resolveActiveTaskDocPath(docpathDir, state?.task_id || '', 'plan.md');
  const specText = await readActiveTaskFile(docpathDir, state?.task_id, 'spec.md');
  const parts: string[] = [title, specText];
  if (existsSync(planPath)) {
    try { parts.push(await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md')); } catch { /* ignore unreadable */ }
  }
  return { specText, haystack: parts.join('\n') };
}

/**
 * 判定当前任务是否需要 UI 设计产物。
 * 优先级：spec 4.1 显式声明 > 关键词回退。
 */
export async function resolveUiDesignRequirement(cwd: string): Promise<UiDesignRequirement> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const structuredSpec = await readActiveStructuredSpecDocument(docpathDir, state?.task_id);
  if (structuredSpec?.ui_gate?.state && structuredSpec.ui_gate.state !== 'unknown') {
    return structuredSpec.ui_gate.state;
  }

  const { specText, haystack } = await readActiveTaskText(cwd);

  const explicit = parseExplicitUiDeclaration(specText);
  if (explicit !== 'unknown') return explicit;

  // 回退：未显式声明时，沿用关键词检测（保护老 spec 不破）。
  if (!isUiUxTaskText(haystack)) return 'exempt';
  if (isUiUxWorkflowOnlyTask(haystack)) return 'exempt';
  return 'required';
}

// ── 设计产物状态 ─────────────────────────────────────────────

/** 解析 design-approval.md 的批准状态（frontmatter > 直写 state > markdown 行）。 */
export function approvalState(content: string): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const source = frontmatterMatch?.[1] || content;
  const nested = source.match(/approval:\s*\n(?:[ \t]+.+\n)*?[ \t]+state:\s*([A-Za-z_-]+)/i);
  if (nested) return nested[1].toLowerCase();
  const direct = source.match(/(?:^|\n)(?:status|state):\s*([A-Za-z_-]+)/i);
  if (direct) return direct[1].toLowerCase();
  const markdown = content.match(/(?:^|\n)-\s*State:\s*([A-Za-z_-]+)/i);
  return markdown ? markdown[1].toLowerCase() : 'missing';
}

export interface DesignArtifactGap {
  /** 缺失的硬产物：design-preview.md 不存在、design-approval.md 不存在或未 approved。 */
  missing: string[];
  /** approval 当前状态（approved 时门禁放行）。 */
  approval: string;
}

/**
 * 检查 go 前置硬门禁所需的最小设计产物：
 * - design-preview.md 必须存在
 * - design-approval.md 必须存在且 state=approved
 * （ui-brief / handoff / acceptance 等其余产物由 check 阶段的完整门禁覆盖，
 *   不在 go 前置门禁内，避免阻断尚未到验收阶段的实现。）
 */
export async function missingDesignArtifacts(cwd: string): Promise<DesignArtifactGap> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || '';
  const previewPath = resolveActiveTaskDocPath(docpathDir, taskId, 'design-preview.md');
  const approvalPath = resolveActiveTaskDocPath(docpathDir, taskId, 'design-approval.md');

  const missing: string[] = [];
  if (!existsSync(previewPath)) missing.push('design-preview.md');

  let approval = 'missing';
  if (!existsSync(approvalPath)) {
    missing.push('design-approval.md');
  } else {
    approval = approvalState((await readFile(approvalPath, 'utf-8')).trim());
    if (approval !== 'approved') missing.push(`design-approval.md (状态: ${approval}，需 approved)`);
  }

  return { missing, approval };
}
