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

function stripUiGateDeclarationSection(text: string): string {
  return text.replace(/###\s*UI\s*设计门禁[\s\S]*?(?=\n###\s+|\n##\s+|$)/g, '');
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
  const fallbackHaystack = stripUiGateDeclarationSection(haystack);
  if (!isUiUxTaskText(fallbackHaystack)) return 'exempt';
  if (isUiUxWorkflowOnlyTask(fallbackHaystack)) return 'exempt';
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

// ── 前端技术栈决策门禁（Framework Decision，序列最前）──────────

export interface FrameworkDecisionGap {
  /** 缺失/不合格项：文件不存在、JS 选定项为占位、缺带理由的被否决备选。 */
  missing: string[];
  /** 解析到的合格"被否决备选(带理由)"条数。 */
  rejectedCount: number;
}

interface RejectedAlternative {
  option: string;
  reason: string;
}

/** 占位符判定：空串、仍是 `<...>` 模板占位、或纯破折号视为"未填"。 */
function isStackPlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^[<＜][\s\S]*[>＞]$/.test(v)) return true; // 整体仍是 <...> 占位
  if (/^[-—–_.]+$/.test(v)) return true;
  return false;
}

/** 抽取某个 `## 标题` 到下一个 `## ` 之间的正文块（不含标题行）。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceMarkdownSection(text: string, heading: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inSection = false;
  const headingRe = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inSection) break;
      inSection = headingRe.test(line);
      continue;
    }
    if (inSection) out.push(line);
  }
  return out.join('\n');
}

/** 从「选定栈」块解析 `JS 框架:` 后的值。 */
function parseSelectedJs(stackSection: string): string {
  for (const line of stackSection.split('\n')) {
    const m = line.match(/^\s*-\s*JS\s*框架\s*[:：]\s*(.*)$/i);
    if (m) return m[1].trim();
  }
  return '';
}

function isPureStaticSelection(value: string): boolean {
  return /(纯静态|无框架|vanilla|static|plain\s*(html|css|js)?|原生\s*JS)/i.test(value);
}

function isFrameworkAlternative(option: string): boolean {
  return /(框架|React|Vue|Svelte|Angular|Next(?:\.js)?|Nuxt|Remix|Astro|Solid|Preact|Qwik|Lit)/i.test(option);
}

/**
 * 从「被否决备选」块解析合格条目。
 * 合格条件：列表项含 `理由:`，且"方案"与"理由"两侧都非占位、非空。
 * 注释行（以 `>` 开头的引用说明）不计入。
 */
function parseRejectedWithReason(rejectedSection: string): RejectedAlternative[] {
  const alternatives: RejectedAlternative[] = [];
  for (const raw of rejectedSection.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('-')) continue;
    const item = line.replace(/^-\s*/, '');
    const m = item.match(/^([\s\S]*?)\s*(?:—|--|-|：|:)?\s*理由\s*[:：]\s*([\s\S]*)$/);
    if (!m) continue;
    const option = m[1].replace(/[—–-]+\s*$/, '').trim();
    const reason = m[2].trim();
    if (isStackPlaceholder(option) || isStackPlaceholder(reason)) continue;
    alternatives.push({ option, reason });
  }
  return alternatives;
}

/**
 * Framework Decision 前置硬门禁：required UI 任务进入实现前必须先定技术栈。
 * 校验（防"填了框架名就放行"）：
 * - frontend-stack.md 必须存在
 * - 「选定栈」的 JS 框架项非占位（纯静态也算合法选定）
 * - 至少 1 个「被否决备选」且带实义理由（逼出"为什么不选别的"）
 * - 选定纯静态时，被否决备选必须包含一个框架方案（逼出"为什么不用框架"）
 * 排在 design-preview / design-approval 之前，确保框架选型先于画图。
 */
export async function missingFrameworkDecision(cwd: string): Promise<FrameworkDecisionGap> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || '';
  const stackPath = resolveActiveTaskDocPath(docpathDir, taskId, 'frontend-stack.md');

  const missing: string[] = [];
  if (!existsSync(stackPath)) {
    missing.push('frontend-stack.md');
    return { missing, rejectedCount: 0 };
  }

  const content = (await readFile(stackPath, 'utf-8')).trim();
  const stackSection = sliceMarkdownSection(content, '选定栈');
  const rejectedSection = sliceMarkdownSection(content, '被否决备选');

  const selectedJs = parseSelectedJs(stackSection);
  if (isStackPlaceholder(selectedJs)) {
    missing.push('frontend-stack.md「选定栈 > JS 框架」未填（纯静态请显式写「纯静态」）');
  }

  const rejectedAlternatives = parseRejectedWithReason(rejectedSection);
  const rejectedCount = rejectedAlternatives.length;
  if (rejectedCount < 1) {
    missing.push('frontend-stack.md「被否决备选」缺至少 1 条带「理由:」的条目');
  } else if (isPureStaticSelection(selectedJs) && !rejectedAlternatives.some((alt) => isFrameworkAlternative(alt.option))) {
    missing.push('frontend-stack.md「被否决备选」需写明为什么不用框架（例如 React/Vue/Svelte 等）');
  }

  return { missing, rejectedCount };
}
