/**
 * UI 设计门禁 — go 与 check 共享的单一判定真源。
 *
 * 解决两类根因：
 * 1. 判定漂移：以前 go 对 UI 设计零感知，check 用一套正则，标准不一致。
 *    现在两者都走本模块，"是否需要设计 / 缺哪些产物" 只有一个定义。
 * 2. 措辞脆弱：以前靠泛 UI 正则猜 "是不是 UI 任务"，普通页面/布局改动
 *    也会被升级成设计审批。现在以 spec 4.1 的 **显式勾选框** 为准；
 *    旧 spec 只有在文本里出现明确设计意图时才兜底为 required。
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
 * - unknown:  spec 未声明；普通 UI/前端关键词不拦截，最多用于 advisory
 */
export type UiDesignRequirement = 'required' | 'exempt' | 'unknown';

// ── UI 信号与显式设计意图（unknown 时使用）───────────────────

/** 广义 UI/前端信号：只用于非阻塞 advisory，不直接触发硬门禁。 */
export function isUiUxTaskText(text: string): boolean {
  return /UI\/UX|\bUI\b|产品\s*UI|UX|用户界面|界面重构|页面重构|页面|layout|navigation|visual|视觉|设计预览|视觉验收|Design Preview|Visual Acceptance|responsive UI|响应式界面|Figma|Stitch|v0|Framer|frontend|front-end|前端|component|组件|dashboard|CSS/i.test(text);
}

export function isUiUxWorkflowOnlyTask(text: string): boolean {
  return /Codex Skill|Agent 指引|check gate|Approval Gate|Design Approval Gate|门禁|模板|流程|workflow|write-design|docpath check/i.test(text)
    && /不包含[\s\S]{0,240}(实际重构|产品 UI|页面实现)|不做[\s\S]{0,240}(实际重构|产品 UI|页面实现)/i.test(text);
}

/** 明确设计意图：允许旧 spec 或 backlog 文本在无勾选框时 opt-in UI 设计门禁。 */
export function hasExplicitUiDesignIntent(text: string): boolean {
  const source = stripUiGateDeclarationSection(text)
    .split('\n')
    .filter((line) => !/本任务不涉及产品\s*UI|本任务涉及产品\s*UI|go 前必须有 design-preview|design-approval/i.test(line))
    .join('\n');
  return /UI\/UX\s*(design|analysis|review)|\bUI\s*design\b|\bUX\s*analysis\b|visual\s*(direction|design|brief|review)|prototype|wireframe|mockup|Figma|Stitch|\bv0\b|Framer|design-preview|Design Preview|design approval|Design Approval|approval-gated|先设计|做\s*UI\s*设计|UI\s*设计|UX\s*分析|视觉方案|视觉方向|视觉设计|原型|线框图|设计稿|设计预览|设计审批|设计批准/i.test(source);
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
 * 优先级：spec.json 显式声明 > spec 4.1 显式声明 > 明确设计意图兜底。
 * 普通 UI/前端关键词不自动升级为 required。
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

  // 回退：未显式声明时，只接受明确设计意图作为 opt-in。广义 UI/前端
  // 信号留给 advisory，不能自动升级为硬门禁。
  const fallbackHaystack = stripUiGateDeclarationSection(haystack);
  if (isUiUxWorkflowOnlyTask(fallbackHaystack)) return 'exempt';
  if (hasExplicitUiDesignIntent(fallbackHaystack)) return 'required';
  return 'exempt';
}

/**
 * 非阻塞提示：任务文本看起来涉及 UI/前端，但没有显式开启设计流程。
 * 这不是门禁，只用于提醒用户如需设计审批应显式 opt-in。
 */
export async function shouldAdviseUiDesignOptIn(cwd: string): Promise<boolean> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const structuredSpec = await readActiveStructuredSpecDocument(docpathDir, state?.task_id);
  if (structuredSpec?.ui_gate?.state && structuredSpec.ui_gate.state !== 'unknown') return false;

  const { specText, haystack } = await readActiveTaskText(cwd);
  const explicit = parseExplicitUiDeclaration(specText);
  if (explicit !== 'unknown') return false;

  const fallbackHaystack = stripUiGateDeclarationSection(haystack);
  if (isUiUxWorkflowOnlyTask(fallbackHaystack)) return false;
  if (hasExplicitUiDesignIntent(fallbackHaystack)) return false;
  return isUiUxTaskText(fallbackHaystack);
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

// ── 设计稿深度门禁（design-preview 8 维度 + 具体值校验）────────

export interface DesignPreviewDepthGap {
  /** 缺失/仅占位的维度（章节不存在或正文未填）。 */
  missing: string[];
  /** 维度在但填的是「方向」而非具体值（缺 px/hex/ms 等可机检信号）。 */
  weak: string[];
}

interface PreviewDimension {
  /** 报错用维度名。 */
  label: string;
  /** 匹配 `## ` 标题的关键词（容忍编号与措辞微调）。 */
  heading: RegExp;
  /** 具体值校验：传入「已剥离占位与引用行」的正文，返回缺失提示或 null。 */
  concrete: (filled: string) => string | null;
}

/** 剥离 `<...>` 占位段与 `>` 引用说明行，只留用户真正填入的内容。 */
function stripPreviewPlaceholders(body: string): string {
  return body
    .split('\n')
    .filter((line) => !/^\s*>/.test(line)) // 去掉模板引用说明
    .join('\n')
    .replace(/<[^>\n]*>/g, ''); // 去掉 <...> 占位（含表格示例值）
}

const HEX_OR_FUNC_COLOR = /#[0-9a-fA-F]{3,8}\b|hsl\(|hsla\(|rgb\(|rgba\(|oklch\(/g;
const SIZE_UNIT = /\d+(?:\.\d+)?\s*(?:px|rem|em|vh|vw)\b/g;
const DURATION = /\d+(?:\.\d+)?\s*ms\b|\b\d+(?:\.\d+)?\s*s\b/;
const EASING = /ease(?:-in|-out|-in-out)?\b|cubic-bezier\(|spring|\blinear\b|steps\(/i;
const ICON_SET = /lucide|heroicons|material(?:[\s-]?symbols)?|tabler|feather|font[\s-]?awesome|iconfont|remix[\s-]?icon|phosphor|carbon|fluent|bootstrap[\s-]?icons|\bant\b|自绘|\bSVG\b/i;

const PREVIEW_DIMENSIONS: PreviewDimension[] = [
  {
    label: '布局与栅格',
    heading: /布局|栅格|layout|grid/i,
    concrete: (f) => (/\d/.test(f) && /(列|栏|column|grid|断点|breakpoint|区域|区块|header|sidebar|main)/i.test(f)
      ? null
      : '需写出栅格列数/断点/区域的具体值（如「12 列，断点 640/1024px」）'),
  },
  {
    label: '尺寸规格',
    heading: /尺寸|规格|dimension|size|sizing/i,
    concrete: (f) => ((f.match(SIZE_UNIT) || []).length >= 2
      ? null
      : '需写出容器/组件的精确尺寸（≥2 处 px/rem 等具体单位）'),
  },
  {
    label: '间距标度',
    heading: /间距|spacing|gap/i,
    concrete: (f) => ((f.match(/\d+(?:\.\d+)?\s*(?:px|rem)\b/g) || []).length >= 2
      ? null
      : '需写出间距标度的具体值（≥2 处 px/rem）'),
  },
  {
    label: '图标系统',
    heading: /图标|icon/i,
    concrete: (f) => (ICON_SET.test(f) && /\d+\s*px|\d+\s*rem/.test(f)
      ? null
      : '需指明图标库名与默认尺寸（如「lucide，24px」）'),
  },
  {
    label: '颜色与 Tokens',
    heading: /颜色|色彩|color|tokens?/i,
    concrete: (f) => ((f.match(HEX_OR_FUNC_COLOR) || []).length >= 3
      ? null
      : '需写出精确色值（≥3 个 hex/hsl/rgb），而非「偏冷的蓝」'),
  },
  {
    label: '动效规格',
    heading: /动效|动画|motion|animation|transition/i,
    concrete: (f) => (DURATION.test(f) && EASING.test(f)
      ? null
      : '需写出动效时长（ms/s）与缓动曲线（ease/cubic-bezier 等）'),
  },
  {
    label: '交互逻辑',
    heading: /交互|interaction|behaviou?r/i,
    concrete: (f) => ((f.match(/hover|focus|active|disabled|loading|empty|error|键盘|焦点|确认|状态/gi) || []).length >= 2
      ? null
      : '需逐组件写清行为与关键状态（hover/focus/loading/empty/error 等）'),
  },
  {
    label: '技术约束',
    heading: /技术约束|约束|constraint|tech/i,
    concrete: (f) => (/对比度|性能|预算|a11y|可访问|aria|浏览器|视口|frontend-stack|60fps|\d/i.test(f)
      ? null
      : '需绑定 frontend-stack 并写出性能预算/可访问性/浏览器支持等约束'),
  },
];

/** 按 `## ` 标题切分文档为「标题 → 正文」段。 */
function splitMarkdownSections(text: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
      current = { heading: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
  return sections;
}

/**
 * 设计稿深度门禁：required UI 任务的 design-preview.md 必须把 8 个维度
 * 全部冻结成具体值，而非停留在 ui-brief 的「方向」。
 * 校验（防「够长就行」与「方向占位」）：
 * - 8 个维度章节都在，且正文非空/非纯占位（否则计 missing）
 * - 每个维度按其性质命中具体值信号（px/hex/ms/缓动/图标库），否则计 weak
 * go 与 check 共用本函数，保证「设计稿够不够细」只有一个定义。
 */
export async function missingDesignPreviewDepth(cwd: string): Promise<DesignPreviewDepthGap> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || '';
  const previewPath = resolveActiveTaskDocPath(docpathDir, taskId, 'design-preview.md');

  const missing: string[] = [];
  const weak: string[] = [];
  if (!existsSync(previewPath)) {
    missing.push('design-preview.md');
    return { missing, weak };
  }

  const content = (await readFile(previewPath, 'utf-8')).trim();
  const sections = splitMarkdownSections(content);

  for (const dim of PREVIEW_DIMENSIONS) {
    const section = sections.find((s) => dim.heading.test(s.heading));
    if (!section) {
      missing.push(`${dim.label}（缺少 ## 章节）`);
      continue;
    }
    const filled = stripPreviewPlaceholders(section.body).trim();
    // 去掉表格分隔行与裸符号后判断是否真有内容。
    const meaningful = filled.replace(/^[\s|:\-—–_.]+$/gm, '').trim();
    if (meaningful.length < 8) {
      missing.push(`${dim.label}（章节为空或仅占位）`);
      continue;
    }
    const gap = dim.concrete(filled);
    if (gap) weak.push(`${dim.label}: ${gap}`);
  }

  return { missing, weak };
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
