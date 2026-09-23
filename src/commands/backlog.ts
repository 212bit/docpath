/**
 * docpath backlog — 需求条目管理
 */

import { stringify } from 'yaml';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  type BacklogItem,
  type BacklogEvidence,
  type BacklogIdCollision,
  type BacklogPriority,
  type BacklogReadiness,
  type BacklogStatus,
  archiveBacklogItem,
  cleanBacklogTitle,
  createBacklogItem,
  detectBacklogDuplicates,
  detectBacklogIdCollisions,
  isBacklogReadiness,
  isBacklogPriority,
  listBacklogItems,
  readBacklogItem,
  refreshBacklogIndex,
  setBacklogStatus,
  transitionBacklog,
  writeBacklogItem,
} from '../engine/backlog.js';
import { today, resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { evaluateTaskRisk, riskPolicyFromConfig, riskTierName } from '../engine/risk.js';
import { readRiskPolicyConfig } from '../utils/config.js';
import { archivedTaskDir, backupCurrentTaskAlias, canonicalTaskRelativePath, canonicalTaskDir, clearCurrentTaskAlias, writeActiveTaskFile } from '../utils/task-files.js';
import { emitNextHint } from '../utils/next-hint.js';
import { assertCleanWorktreeForNewTask, detectDirtyWorktree } from '../utils/git-dirty-guard.js';
import { hasExplicitUiDesignIntent } from '../utils/ui-gate.js';
import { resolveWorktreePaths, worktreeCommand } from './worktree.js';

interface BacklogCommandOptions {
  cwd: string;
  action?: string;
  id?: string;
  title?: string;
  priority?: string;
  level?: string;
  background?: string;
  acceptance?: string;
  bodyFile?: string;
  readiness?: string;
  evidenceBrainstorm?: string;
  evidenceAnalysis?: string;
  evidenceSpec?: string;
  evidenceDecision?: string;
  userConfirmed?: string;
  status?: string;
  task?: string;
  agent?: boolean;
  draft?: boolean;
  adopt?: boolean;
  nonInteractive?: boolean;
}

interface BacklogGroomIssue {
  id: string;
  severity: 'error';
  field: string;
  message: string;
  suggestion: string;
}

function normalizePriority(priority?: string): BacklogPriority {
  const value = (priority || 'P2').toUpperCase();
  if (!isBacklogPriority(value)) {
    throw new Error(`docpath backlog: priority 非法: ${priority}（允许: P0|P1|P2|P3）`);
  }
  return value;
}

function normalizeLevel(level?: string): number {
  const raw = level ?? '2';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    throw new Error(`docpath backlog: level 非法: ${raw}（允许: 0|1|2|3）`);
  }
  return parsed;
}

function normalizeReadiness(readiness: string | undefined, fallback: BacklogReadiness): BacklogReadiness {
  const value = (readiness || fallback).trim().toLowerCase();
  if (!isBacklogReadiness(value)) {
    throw new Error(`docpath backlog: readiness 非法: ${readiness}（允许: raw|shaped|analyzed|confirmed）`);
  }
  return value;
}

function normalizeStatusFilter(status?: string): BacklogStatus | undefined {
  if (!status) return undefined;
  const value = status.trim().toLowerCase();
  const valid: BacklogStatus[] = ['proposed', 'accepted', 'planned', 'active', 'done', 'dropped'];
  if (!valid.includes(value as BacklogStatus)) {
    throw new Error(`docpath backlog list: status 非法: ${status}`);
  }
  return value as BacklogStatus;
}

function hasInlineBodyOptions(options: BacklogCommandOptions): boolean {
  return options.background != null || options.acceptance != null;
}

function hasBodyInput(options: BacklogCommandOptions): boolean {
  return Boolean(options.bodyFile || hasInlineBodyOptions(options));
}

function formatBacklogSection(title: string, value: string | undefined, fallback: string): string[] {
  return [
    `## ${title}`,
    '',
    value?.trim() ? value.trim() : fallback,
  ];
}

function buildInlineBacklogBody(options: BacklogCommandOptions): string {
  return [
    ...formatBacklogSection('背景', options.background, '- 待补充'),
    '',
    ...formatBacklogSection('验收', options.acceptance, '- 待补充'),
  ].join('\n');
}

async function readBacklogBodyFile(cwd: string, bodyFile: string): Promise<string> {
  const path = isAbsolute(bodyFile) ? bodyFile : join(cwd, bodyFile);
  const content = await readFile(path, 'utf-8');
  if (!content.trim()) {
    throw new Error(`docpath backlog add: --body-file 内容为空: ${bodyFile}`);
  }
  return content.trim();
}

function getMarkdownSection(body: string, title: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const sectionRegex = new RegExp(`^##\\s+${title}\\s*$`, 'm');
  const match = normalized.match(sectionRegex);
  if (!match) return null;

  const startIndex = match.index!;
  const headerLen = match[0].length;
  const contentStartIndex = startIndex + headerLen;

  const nextHeadingRegex = /^#{1,3}\s+\S/m;
  const rest = normalized.slice(contentStartIndex);
  const nextMatch = rest.match(nextHeadingRegex);

  const contentEndIndex = nextMatch
    ? contentStartIndex + nextMatch.index!
    : normalized.length;

  return normalized.slice(contentStartIndex, contentEndIndex).trim();
}

function replaceMarkdownSection(body: string, title: string, content: string): string {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const sectionRegex = new RegExp(`^##\\s+${title}\\s*$`, 'm');
  const match = normalized.match(sectionRegex);
  if (!match) {
    return normalized + `\n\n## ${title}\n\n${content}`;
  }

  const startIndex = match.index!;
  const headerLen = match[0].length;
  const contentStartIndex = startIndex + headerLen;

  const nextHeadingRegex = /^#{1,3}\s+\S/m;
  const rest = normalized.slice(contentStartIndex);
  const nextMatch = rest.match(nextHeadingRegex);

  const contentEndIndex = nextMatch
    ? contentStartIndex + nextMatch.index!
    : normalized.length;

  const before = normalized.slice(0, contentStartIndex).trimEnd();
  const after = normalized.slice(contentEndIndex).trim();

  return `${before}\n\n${content}\n\n${after}`.trim() + '\n';
}

function isPlaceholderValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const lines = value.trim().split('\n');
  return lines.some((line) =>
    /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
  );
}

async function resolveBacklogBody(options: BacklogCommandOptions, existingBody?: string): Promise<string> {
  if (options.bodyFile && hasInlineBodyOptions(options)) {
    throw new Error('docpath backlog: --body-file 不能与 --background/--acceptance 同时使用');
  }

  if (options.bodyFile) {
    return readBacklogBodyFile(options.cwd, options.bodyFile);
  }

  if (existingBody && (hasSection(existingBody, '背景') || hasSection(existingBody, '验收'))) {
    let body = existingBody;
    if (options.background != null) {
      body = replaceMarkdownSection(body, '背景', options.background);
    }
    if (options.acceptance != null) {
      body = replaceMarkdownSection(body, '验收', options.acceptance);
    }
    return body;
  }

  return buildInlineBacklogBody(options);
}

function hasEditFields(options: BacklogCommandOptions): boolean {
  return Boolean(
    options.title?.trim()
    || options.priority
    || options.level
    || options.bodyFile
    || hasInlineBodyOptions(options)
    || options.readiness
    || hasEvidenceOptions(options)
  );
}

function hasEvidenceOptions(options: BacklogCommandOptions): boolean {
  return Boolean(
    options.evidenceBrainstorm?.trim()
    || options.evidenceAnalysis?.trim()
    || options.evidenceSpec?.trim()
    || options.evidenceDecision?.trim()
    || options.userConfirmed?.trim()
  );
}

function buildEvidence(options: BacklogCommandOptions, existing?: BacklogEvidence): BacklogEvidence {
  return {
    brainstorm: options.evidenceBrainstorm?.trim() || existing?.brainstorm || null,
    analysis: options.evidenceAnalysis?.trim() || existing?.analysis || null,
    spec: options.evidenceSpec?.trim() || existing?.spec || null,
    decision_brief: options.evidenceDecision?.trim() || existing?.decision_brief || null,
    user_confirmed: options.userConfirmed?.trim() || existing?.user_confirmed || null,
  };
}

function hasSection(body: string, title: string): boolean {
  return new RegExp(`^##\\s+${title}\\s*$`, 'm').test(body);
}

function isPlaceholderBody(body: string): boolean {
  const bg = getMarkdownSection(body, '背景');
  const ac = getMarkdownSection(body, '验收');
  if (bg === null && ac === null) {
    const lines = body.trim().split('\n');
    return !body.trim() || lines.some((line) =>
      /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
    );
  }
  return isPlaceholderValue(bg) || isPlaceholderValue(ac);
}

function readinessRank(readiness: BacklogReadiness): number {
  return ['raw', 'shaped', 'analyzed', 'confirmed'].indexOf(readiness);
}

/**
 * FR-5：evidence 引用是否「像文件路径」。凡含路径分隔符（`/` 或 `\`）即视为文件路径引用，
 * 必须能解析到真实文件；纯文本标注（如 "spec decision"/"R-260 plan exercise"，无分隔符）
 * 不做存在性校验，避免误拒自由文本 evidence。
 */
function evidencePathLike(ref: string): boolean {
  return /[/\\]/.test(ref);
}

/**
 * 收集引用了真实文件但文件不存在的 evidence 字段（FR-5，AC-1#4）。
 * 解析基准：相对路径按 cwd 解析（evidence 惯例为 `.docpath/...` 或 `analysis/...` 相对条目目录）；
 * 绝对路径直接判。user_confirmed 恒为自由文本，不参与文件校验。
 */
function danglingEvidenceRefs(item: BacklogItem, cwd: string): Array<{ field: string; ref: string }> {
  const candidates: Array<[string, string | null]> = [
    ['analysis', item.evidence.analysis],
    ['spec', item.evidence.spec],
    ['decision_brief', item.evidence.decision_brief],
    ['brainstorm', item.evidence.brainstorm],
  ];
  const dangling: Array<{ field: string; ref: string }> = [];
  for (const [field, ref] of candidates) {
    if (!ref || !evidencePathLike(ref)) continue;
    const resolved = isAbsolute(ref) ? ref : resolve(cwd, ref);
    if (!existsSync(resolved)) dangling.push({ field, ref });
  }
  return dangling;
}

function missingReadinessEvidence(item: BacklogItem, cwd: string, checkFiles = false): string[] {
  const issues: string[] = [];
  const bg = getMarkdownSection(item.body, '背景');
  const ac = getMarkdownSection(item.body, '验收');
  if (bg !== null || ac !== null) {
    if (isPlaceholderValue(bg)) {
      issues.push('`## 背景` 章节正文为空或包含占位内容');
    }
    if (isPlaceholderValue(ac)) {
      issues.push('`## 验收` 章节正文为空或包含占位内容');
    }
  } else {
    if (isPlaceholderBody(item.body)) {
      issues.push('正文仍为空或包含占位内容');
    }
  }
  if (item.level >= 2 && readinessRank(item.readiness) < readinessRank('analyzed')) {
    issues.push(`level ${item.level} 条目 readiness=${item.readiness}，至少需要 analyzed`);
  }
  if (item.level >= 2 && !item.evidence.analysis && !item.evidence.spec && item.readiness !== 'confirmed') {
    issues.push('缺少 evidence.analysis 或 evidence.spec');
  }
  if (item.level >= 3 && readinessRank(item.readiness) < readinessRank('confirmed')) {
    issues.push(`level ${item.level} 条目 readiness=${item.readiness}，至少需要 confirmed`);
  }
  if (item.level >= 3 && !item.evidence.decision_brief) {
    issues.push('缺少 evidence.decision_brief');
  }
  if (item.level >= 3 && !item.evidence.user_confirmed) {
    issues.push('缺少 evidence.user_confirmed');
  }
  if (checkFiles) {
    // FR-5：promote 门禁额外校验「路径型 evidence 引用必须解析到真实文件」
    for (const { field, ref } of danglingEvidenceRefs(item, cwd)) {
      issues.push(`evidence.${field} 引用文件不存在: ${ref}`);
    }
  }
  return issues;
}

function assertBacklogReadyForExecution(item: BacklogItem, action: 'accept' | 'plan' | 'promote', skipCheck = false, cwd = process.cwd()): void {
  if (skipCheck) return;
  // FR-5：文件存在性校验仅在 promote 门禁启用（accept/plan 看成熟度，不看引用文件真实存在）
  const issues = missingReadinessEvidence(item, cwd, action === 'promote');
  if (issues.length === 0) return;
  throw new Error([
    `docpath backlog ${action}: backlog 条目 ${item.id} 尚未达到可执行成熟度`,
    ...issues.map((issue) => `- ${issue}`),
    `修复建议(首选): docpath backlog edit ${item.id} --body-file <path> --readiness analyzed --evidence-analysis <path>`,
    `  （capture 生成的占位正文只有 --body-file 全量重写才能通过成熟度检查；`,
    `    --background/--acceptance 不替换占位段, 仅适用于正文已成型的增补）`,
    item.level >= 3
      ? `level 3 还需: --readiness confirmed --evidence-decision <ref> --user-confirmed <text>`
      : '',
  ].filter(Boolean).join('\n'));
}

function isPromoteBacklogEvidencePath(path: string, itemId: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized === '.docpath/backlog/backlog.md'
    || normalized === '.docpath/backlog/.id-counter'
    || normalized.startsWith('.docpath/backlog/')
    || normalized === `.docpath/backlog/${itemId}.md`
    || (normalized.startsWith(`.docpath/backlog/${itemId}-`) && normalized.endsWith('.md'));
}

function inspectBacklogItem(item: BacklogItem): BacklogGroomIssue[] {
  const issues: BacklogGroomIssue[] = [];
  if ((item.status === 'proposed' || item.status === 'accepted') && !hasSection(item.body, '背景')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.background',
      message: '条目正文缺少 `## 背景` 章节',
      suggestion: `docpath backlog edit ${item.id} --background <text> --acceptance <text>`,
    });
  }
  if ((item.status === 'proposed' || item.status === 'accepted') && !hasSection(item.body, '验收')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.acceptance',
      message: '条目正文缺少 `## 验收` 章节',
      suggestion: `docpath backlog edit ${item.id} --background <text> --acceptance <text>`,
    });
  }
  const bg = getMarkdownSection(item.body, '背景');
  const ac = getMarkdownSection(item.body, '验收');
  if (bg !== null || ac !== null) {
    if (item.status === 'proposed' || item.status === 'accepted') {
      if (isPlaceholderValue(bg)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.background',
          message: '条目正文 `## 背景` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --background <text>`,
        });
      }
      if (isPlaceholderValue(ac)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.acceptance',
          message: '条目正文 `## 验收` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --acceptance <text>`,
        });
      }
    }
  } else {
    if ((item.status === 'proposed' || item.status === 'accepted') && isPlaceholderBody(item.body)) {
      issues.push({
        id: item.id,
        severity: 'error',
        field: 'body',
        message: '条目正文为空或仍包含占位内容',
        suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
      });
    }
  }
  if (
    item.status !== 'dropped'
    && item.status !== 'proposed'
    && item.status !== 'accepted'
    && isPlaceholderBody(item.body)
  ) {
    if (bg !== null || ac !== null) {
      if (isPlaceholderValue(bg)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.background',
          message: '条目正文 `## 背景` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --background <text>`,
        });
      }
      if (isPlaceholderValue(ac)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.acceptance',
          message: '条目正文 `## 验收` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --acceptance <text>`,
        });
      }
    } else {
      issues.push({
        id: item.id,
        severity: 'error',
        field: 'body',
        message: '条目正文为空或仍包含占位内容',
        suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
      });
    }
  }
  if (item.status !== 'dropped' && item.level >= 2 && readinessRank(item.readiness) < readinessRank('analyzed')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'readiness',
      message: `level ${item.level} 条目成熟度不足: ${item.readiness}`,
      suggestion: `docpath backlog edit ${item.id} --readiness analyzed --evidence-analysis <path>`,
    });
  }
  if (item.status !== 'dropped' && item.level >= 3 && !item.evidence.user_confirmed) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'evidence.user_confirmed',
      message: 'level 3 条目缺少用户确认依据',
      suggestion: `docpath backlog edit ${item.id} --readiness confirmed --user-confirmed <text>`,
    });
  }
  if (item.status === 'done' && item.links.spec && isPlaceholderBody(item.body)) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.stale_from_spec',
      message: 'done 条目已关联 spec，但 backlog 正文仍未从 spec 回填',
      suggestion: '重新运行 journal 回填，或用 docpath backlog edit 补充正文',
    });
  }
  if ((item.status === 'active' || item.status === 'done') && !item.links.task) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'links.task',
      message: 'active/done 条目缺少 task 链接',
      suggestion: '确认任务归档或手工修复 backlog links.task',
    });
  }
  if ((item.status === 'active' || item.status === 'done') && !item.links.spec) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'links.spec',
      message: 'active/done 条目缺少 spec 链接',
      suggestion: '确认任务归档或手工修复 backlog links.spec',
    });
  }
  return issues;
}

async function collectBacklogGroomIssues(options: BacklogCommandOptions): Promise<BacklogGroomIssue[]> {
  const docpathDir = await resolveDocpathDir(options.cwd);
  const issues: BacklogGroomIssue[] = [];
  if (!existsSync(join(docpathDir, 'backlog', 'backlog.md'))) {
    issues.push({
      id: 'backlog.md',
      severity: 'error',
      field: 'index',
      message: '缺少 backlog 索引文件 .docpath/backlog/backlog.md',
      suggestion: 'docpath backlog refresh',
    });
  }

  const items = await listBacklogItems(options.cwd);
  for (const item of items) {
    issues.push(...inspectBacklogItem(item));
  }
  return issues;
}

function renderGroomReport(issues: BacklogGroomIssue[], collisions: BacklogIdCollision[] = []): string {
  const lines = ['', '🧹  Backlog 健康检查', ''];
  if (issues.length === 0) {
    lines.push('✅  Backlog 健康检查通过');
  } else {
    lines.push(`❌  发现 ${issues.length} 个问题`);
    lines.push('');
    for (const issue of issues) {
      lines.push(`- [${issue.id}] ${issue.field}: ${issue.message}`);
      lines.push(`  修复建议: ${issue.suggestion}`);
    }
  }

  if (collisions.length > 0) {
    lines.push('');
    lines.push(`⚠️  检测到 ${collisions.length} 起 id 撞号（active 与 archived 同 id 并存；非破坏性告警，不计入健康检查失败）:`);
    for (const collision of collisions) {
      lines.push(`- [${collision.id}] active「${collision.active_title}」 vs archived「${collision.archived_title}」${collision.identical ? '（内容一致）' : '（内容不同=两条不同需求）'}`);
    }
    lines.push('  说明: 多为 R-273 前 worktree 号池 stale 的历史残留；refreshBacklogIndex 拒绝覆盖以保护两条记录。');
    lines.push('  处理: 需经独立迁移条目重新分配 id 并修正 links，勿在本命令内自动改数据。');
  }

  lines.push('');
  return lines.join('\n');
}

function comparePriority(a: BacklogPriority, b: BacklogPriority): number {
  return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
}

function sortBacklogItems(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const priorityOrder = comparePriority(a.priority, b.priority);
    if (priorityOrder !== 0) return priorityOrder;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function slugifyTask(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'task';
}

function baseTaskId(title: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `T-${date}-${slugifyTask(title)}`;
}

function taskIdExists(docpathDir: string, taskId: string): boolean {
  return existsSync(canonicalTaskDir(docpathDir, taskId)) || existsSync(archivedTaskDir(docpathDir, taskId));
}

function generateUniqueTaskId(docpathDir: string, title: string): string {
  const base = baseTaskId(title);
  if (!taskIdExists(docpathDir, base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taskIdExists(docpathDir, candidate)) return candidate;
  }

  throw new Error(`docpath backlog promote: 无法为标题生成唯一 task_id: ${title}`);
}

/**
 * 从 backlog body 中按 ## 标题拆出各段内容。
 * 支持 "## 背景" / "## 验收" 等常见段落名；未匹配的正文归入 background。
 */
function parseBacklogBody(body: string): { background: string; acceptance: string } {
  const trimmed = body.trim();
  if (!trimmed) return { background: '', acceptance: '' };

  const sectionPattern = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const matches: Array<{ heading: string; start: number; end: number }> = [];

  while ((match = sectionPattern.exec(trimmed)) !== null) {
    matches.push({ heading: match[1].trim(), start: match.index, end: match.index + match[0].length });
  }

  if (matches.length === 0) {
    return { background: trimmed, acceptance: '' };
  }

  // 第一个 ## 之前的内容作为前言（归入 background）
  const preamble = trimmed.slice(0, matches[0].start).trim();
  const backgroundParts: string[] = [];
  const acceptanceParts: string[] = [];

  if (preamble) backgroundParts.push(preamble);

  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].end;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].start : trimmed.length;
    const content = trimmed.slice(contentStart, contentEnd).trim();
    const heading = matches[i].heading;

    if (/验收|acceptance|done\s*条件/i.test(heading)) {
      acceptanceParts.push(content);
    } else {
      backgroundParts.push(content);
    }
  }

  return {
    background: backgroundParts.join('\n\n'),
    acceptance: acceptanceParts.join('\n'),
  };
}

/**
 * 汇总 backlog evidence 字段为可读段落。
 * 只输出有内容的证据，避免空段占位。
 */
function renderEvidenceSummary(evidence: BacklogEvidence): string {
  const parts: string[] = [];
  if (evidence.brainstorm?.trim()) {
    parts.push('### 需求澄清历史 (brainstorm)', '', evidence.brainstorm.trim(), '');
  }
  if (evidence.analysis?.trim()) {
    parts.push('### 深度分析摘要 (analysis)', '', evidence.analysis.trim(), '');
  }
  if (parts.length === 0) return '';
  return ['## 1.1 已有证据', '', ...parts].join('\n');
}

interface BacklogChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

const SPEC_TRUTH_SYNC_HINT =
  'spec.json 真源已生成；如需细化 FR/AC，请使用 `docpath write-spec --stdin`，直接手改 spec.md 不会更新 spec.json 真源。';

function parseBacklogChecklist(body: string, prefix: 'FR'): BacklogChecklistItem[] {
  const items: BacklogChecklistItem[] = [];
  let inFence = false;

  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(new RegExp(`^\\s*[-*]\\s+\\[([ xX])\\]\\s+(${prefix}-\\d+)\\s*:\\s*(.+?)\\s*$`));
    if (!match) continue;
    items.push({
      id: match[2],
      text: match[3].trim(),
      done: match[1].toLowerCase() === 'x',
    });
  }

  return items;
}

function stripBacklogChecklistLines(body: string, prefix: 'FR'): string {
  const lines: string[] = [];
  let inFence = false;
  const pattern = new RegExp(`^\\s*[-*]\\s+\\[[ xX]\\]\\s+${prefix}-\\d+\\s*:\\s*.+?\\s*$`);

  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      lines.push(line);
      continue;
    }
    if (!inFence && pattern.test(line)) continue;
    lines.push(line);
  }

  return lines.join('\n').trim();
}

function renderPromotedSpec(item: BacklogItem, taskId: string, cwd?: string): string {
  const parsed = parseBacklogBody(item.body);
  const evidenceSection = renderEvidenceSummary(item.evidence);
  const functionalRequirements = parseBacklogChecklist(item.body, 'FR');
  const backgroundSection = (functionalRequirements.length > 0
    ? stripBacklogChecklistLines(parsed.background, 'FR')
    : parsed.background) || '- 待补充';
  const functionalRequirementLines = functionalRequirements.length > 0
    ? functionalRequirements.map((requirement) => `- [${requirement.done ? 'x' : ' '}] ${requirement.id}: ${requirement.text}`)
    : [
        `- [ ] FR-1: ${item.title}`,
        `  - 来源 backlog: ${item.id}`,
      ];

  // 验收标准：优先从 body 解析出的 acceptance，否则用默认骨架
  const acceptanceLines: string[] = [];
  if (parsed.acceptance) {
    // 将 body 中的验收内容转为 AC 条目，并去重 AC-1: 前缀
    const acItems = parsed.acceptance
      .split('\n')
      .filter(l => l.trim())
      .map((line, i) => {
        let clean = line.replace(/^\s*(\d+\.\s*|[-*]\s*)+/, '').trim();
        clean = clean.replace(/^(?:AC|ac)-\d+\s*:\s*/, '').trim();
        return `- [ ] AC-${i + 1}: ${clean}`;
      });
    if (acItems.length > 0) acceptanceLines.push(...acItems);
  }
  // 始终保留关联 AC
  const acStart = acceptanceLines.length + 1;
  acceptanceLines.push(`- [ ] AC-${acStart}: 生成的 spec 可直接进入 \`docpath plan\``);
  acceptanceLines.push(`- [ ] AC-${acStart + 1}: backlog 条目 ${item.id} 与任务 ${taskId} 建立双向关联`);

  // Decision Brief 预填：如果 evidence.decision_brief 有非占位内容则注入
  const decisionBriefContent = item.evidence.decision_brief?.trim();
  const hasDecisionBrief = decisionBriefContent && !isPlaceholderValue(decisionBriefContent);

  const lines: string[] = [
    `# ${taskId} - ${item.title}`,
    '',
    `> backlog_id: ${item.id}`,
    `> backlog_source: ${item.source || 'unknown'}`,
    '',
    '## 1. 背景与动机',
    '',
    backgroundSection,
  ];

  if (evidenceSection) {
    lines.push('', evidenceSection);
  }

  lines.push(
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    ...functionalRequirementLines,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持与现有 DocPath 工作流兼容',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${item.title}`,
    '',
    '### 不包含',
    '- 待在后续规划中补充',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |',
    '',
    ...renderMajorDecisionGate(item, cwd),
  );

  // 如果 decision_brief 有预填内容，在 Decision Brief 段后追加
  if (hasDecisionBrief) {
    lines.push('', '### 已有 Decision Brief (来自 backlog evidence)', '', decisionBriefContent);
  }

  lines.push(
    '',
    '## 5. 验收标准',
    '',
    ...acceptanceLines,
    '',
    '---',
    '',
    '*此文件由 `docpath backlog promote` 生成。*',
    '',
  );

  return lines.join('\n');
}

function backlogSearchText(item: BacklogItem): string {
  return [
    item.title,
    item.body,
    item.evidence.user_confirmed || '',
    item.evidence.decision_brief || '',
  ].join('\n');
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isProductUiImplementationTask(item: BacklogItem): boolean {
  const text = backlogSearchText(item);
  if (includesAny(text, [
    /without[\s\S]{0,160}(product\s*UI\s*design|UI\/UX\s*design|design\s*assets|design-preview)/i,
    /no[\s\S]{0,160}(product\s*UI\s*design|UI\/UX\s*design|design\s*assets|design-preview)/i,
    /不涉及[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /不包含[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /不做[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /豁免[\s\S]{0,80}(设计五件套|UI\/UX\s*设计证据包|UI\s*设计门禁|design gate)/i,
  ])) {
    return false;
  }
  return hasExplicitUiDesignIntent(text);
}

function inferMajorChangeTypes(item: BacklogItem, cwd?: string): Set<string> {
  const types = new Set<string>();
  if (!cwd) return types;

  try {
    const report = detectDirtyWorktree(cwd);
    if (report.isGitRepo && report.dirty) {
      for (const file of report.files) {
        const normalized = file.replace(/\\/g, '/');
        if (
          normalized.startsWith('src/engine/') ||
          normalized.startsWith('src/commands/agent.ts') ||
          normalized.startsWith('src/commands/go.ts') ||
          normalized.startsWith('src/commands/transitions.ts') ||
          normalized.startsWith('.docpath/workspace/state.json')
        ) {
          types.add('工作流 / Agent 行为');
        }
        if (
          normalized.startsWith('src/utils/git-closeout.ts') ||
          normalized.startsWith('src/utils/git-dirty-guard.ts') ||
          normalized.startsWith('src/utils/lock.ts')
        ) {
          types.add('权限 / 写操作边界');
        }
        if (
          normalized.startsWith('package.json') ||
          normalized.startsWith('tsup.config.ts') ||
          normalized.startsWith('tsconfig.json') ||
          normalized.startsWith('src/utils/config.ts')
        ) {
          types.add('技术栈 / 框架');
        }
      }
    }
  } catch {
    // ignore
  }

  return types;
}

function renderMajorDecisionGate(item: BacklogItem, cwd?: string): string[] {
  const productUi = isProductUiImplementationTask(item);
  const inferredTypes = inferMajorChangeTypes(item, cwd);
  const userConfirmed = item.evidence.user_confirmed?.trim() || '';
  const requiresMajorConfirmation = item.level >= 3 || userConfirmed.length > 0 || inferredTypes.size > 0;
  const checked = (value: boolean) => value ? 'x' : ' ';
  const typeLine = (label: string) => `- [${checked(inferredTypes.has(label))}] ${label}`;
  const decisionBriefRef = item.evidence.decision_brief?.trim() || '';
  const hasDbRef = decisionBriefRef && !isPlaceholderValue(decisionBriefRef);

  // Problem extraction: extract first line of background section without heading
  const bgSection = getMarkdownSection(item.body, '背景');
  let problem = '';
  if (bgSection && !isPlaceholderValue(bgSection)) {
    const firstLine = bgSection.trim().split('\n').find((line) => line.trim().length > 0)?.trim();
    if (firstLine) {
      problem = firstLine.replace(/^\s*(\d+\.\s*|[-*]\s*)+/, '').trim();
    }
  }
  if (!problem || isPlaceholderValue(problem)) {
    problem = item.title;
  }

  return [
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    `- [${checked(!requiresMajorConfirmation)}] 否`,
    `- [${checked(requiresMajorConfirmation)}] 是，需要用户确认`,
    '',
    '### 变更类型',
    typeLine('技术栈 / 框架'),
    typeLine('UI 框架 / 设计系统'),
    typeLine('构建工具 / 打包方式'),
    typeLine('数据库 / 存储模型'),
    typeLine('API / 数据契约'),
    typeLine('部署 / 运行方式'),
    typeLine('安全 / 权限边界'),
    typeLine('外部 SDK / 大依赖'),
    typeLine('架构 / 模块边界'),
    typeLine('UI 信息架构 / 用户主路径'),
    typeLine('工作流 / Agent 行为'),
    typeLine('权限 / 写操作边界'),
    typeLine('范围扩大'),
    typeLine('删除 / 替换已有能力'),
    typeLine('长期维护成本增加'),
    typeLine('其他'),
    '',
    '### UI 设计门禁',
    `- [${checked(!productUi)}] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）`,
    `- [${checked(productUi)}] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）`,
    '',
    '### Decision Brief',
    `- 当前问题: ${problem}`,
    `- 目标: ${item.title}`,
    `- 背景: 来自 backlog ${item.id}${hasDbRef ? `，Decision Brief 证据: ${decisionBriefRef}` : ''}`,
    '- 可选方案:',
    '  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程',
    '  - 方案 B: 补充分析，扩展本任务范围',
    '- 推荐方案: 方案 A',
    '- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险',
    '- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围',
    '- 成本: 中等，按 plan 拆分后逐步验证',
    '- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移',
    '- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed',
    `- 用户确认: ${userConfirmed || '待确认'}`,
  ];
}

async function backlogAdd(options: BacklogCommandOptions): Promise<void> {
  const title = (options.title || options.id)?.trim();
  if (!title) {
    throw new Error('docpath backlog add requires --title <title> or <title>');
  }

  if (!hasBodyInput(options)) {
    throw new Error('docpath backlog add requires --background/--acceptance or --body-file; use `docpath backlog capture --title <title>` for raw ideas');
  }

  const body = await resolveBacklogBody(options);

  const readiness = normalizeReadiness(options.readiness, 'shaped');
  if (readiness === 'raw') {
    throw new Error('docpath backlog add: readiness=raw 请使用 `docpath backlog capture`');
  }

  const item = await createBacklogItem(options.cwd, {
    title,
    status: 'proposed',
    priority: normalizePriority(options.priority),
    level: normalizeLevel(options.level),
    source: 'docpath backlog add',
    readiness,
    evidence: buildEvidence(options),
    links: {
      task: null,
      spec: null,
    },
    created_at: today(),
    body,
  });

  console.log(`✅  已创建 backlog 条目: ${item.id}`);
  console.log(`   title: ${item.title}`);
  console.log(`   priority: ${item.priority}`);
  console.log(`   level: ${item.level}`);
  console.log(`   readiness: ${item.readiness}`);
  await refreshBacklogIndex(options.cwd);
}

async function backlogCapture(options: BacklogCommandOptions): Promise<void> {
  const title = (options.title || options.id)?.trim();
  if (!title) {
    throw new Error('docpath backlog capture requires --title <title> or <title>');
  }

  const body = hasBodyInput(options)
    ? await resolveBacklogBody(options)
    : buildInlineBacklogBody({ ...options, title });

  const item = await createBacklogItem(options.cwd, {
    title,
    status: 'proposed',
    priority: normalizePriority(options.priority),
    level: normalizeLevel(options.level),
    source: 'docpath backlog capture',
    readiness: 'raw',
    evidence: buildEvidence(options),
    links: {
      task: null,
      spec: null,
    },
    created_at: today(),
    body,
  });

  console.log(`✅  已捕获 raw backlog 条目: ${item.id}`);
  console.log(`   title: ${item.title}`);
  console.log(`   priority: ${item.priority}`);
  console.log(`   level: ${item.level}`);
  console.log('   readiness: raw');
  console.log(`   下一步: docpath analyze --dry-run --mode deep --content "${item.title}"，再用 docpath backlog edit ${item.id} 补充 evidence`);
  if (item.level <= 1) {
    console.log(`   ⚡ 微小改动可跳过完整流程: docpath quick "${item.title}"（R-310 轻量通道）`);
  }
  await refreshBacklogIndex(options.cwd);
}

async function backlogEdit(options: BacklogCommandOptions): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error('docpath backlog edit requires <id>');
  }
  if (!hasEditFields(options)) {
    throw new Error('docpath backlog edit requires at least one field option');
  }

  const item = await readBacklogItem(options.cwd, options.id.trim());
  if (!item) {
    throw new Error(`docpath backlog edit: backlog 条目不存在: ${options.id}`);
  }

  const updated: BacklogItem = { ...item };
  if (options.title?.trim()) updated.title = cleanBacklogTitle(options.title.trim());
  if (options.priority) updated.priority = normalizePriority(options.priority);
  if (options.level) updated.level = normalizeLevel(options.level);
  if (options.bodyFile || hasInlineBodyOptions(options)) {
    updated.body = await resolveBacklogBody(options, item.body);
    if (readinessRank(updated.readiness) < readinessRank('shaped') && !isPlaceholderBody(updated.body)) {
      updated.readiness = 'shaped';
    }
  }
  if (options.readiness) {
    updated.readiness = normalizeReadiness(options.readiness, updated.readiness);
  }
  if (hasEvidenceOptions(options)) {
    updated.evidence = buildEvidence(options, updated.evidence);
  }

  await writeBacklogItem(options.cwd, updated);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已编辑: ${updated.id}`);
  console.log(`   title: ${updated.title}`);
  console.log(`   priority: ${updated.priority}`);
  console.log(`   level: ${updated.level}`);
}

async function assertNotActiveInOtherWorktrees(cwd: string, backlogId: string): Promise<void> {
  const { isGitRepo } = await import('../utils/worktree.js');
  if (!(await isGitRepo(cwd))) return;

  const { listWorktrees, getGitTopLevel } = await import('../utils/worktree.js');
  const repoRoot = await getGitTopLevel(cwd);
  const worktrees = await listWorktrees(repoRoot);

  for (const wt of worktrees) {
    if (resolve(wt.path) === resolve(cwd)) continue;

    const stateJsonPath = join(wt.path, '.docpath', 'workspace', 'state.json');
    if (existsSync(stateJsonPath)) {
      try {
        const stateContent = await readFile(stateJsonPath, 'utf-8');
        const state = JSON.parse(stateContent) as { task_id?: string; backlog_id?: string };
        if (state.backlog_id === backlogId || (state.task_id && state.task_id.includes(backlogId))) {
          const wtName = wt.path.split(/[\\/]/).filter(Boolean).at(-1) || wt.path;
          throw new Error(
            `docpath backlog promote: backlog 条目 ${backlogId} 已经在另一个工作区 '${wtName}' 中处于活跃状态，禁止重复 promote。`
          );
        }
      } catch (err) {
        // R-344 WT-2: 活跃性阻断继续上抛；读取/解析失败不再静默吞掉——
        // 否则并发 promote 防重等于裸奔（state.json 损坏时永远验证通过）。
        if (err instanceof Error && err.message.includes('promote')) throw err;
        const wtName = wt.path.split(/[\\/]/).filter(Boolean).at(-1) || wt.path;
        throw new Error(
          `docpath backlog promote: 无法验证工作区 '${wtName}' 的任务活跃性（${err instanceof Error ? err.message : String(err)}）。` +
          `请检查该工作区 .docpath/workspace/state.json 后重试。`
        );
      }
    }
  }
}

/**
 * R-352：promote 前的重复登记探测（只报告、不拦、不改数据）。
 *
 * 检查同 id 撞号（R-321/FR-2）与同 title 在 active/archived 的副本。
 * 命中任一时输出可读提示并挂进条目 evidence.decision_brief（via writeBacklogItem），
 * 用户显式 --user-confirmed 后放行——真正 gate 留待后续迭代加硬拦。
 */
async function warnOnDuplicateRegistration(
  cwd: string,
  item: BacklogItem,
): Promise<boolean> {
  const dups = await detectBacklogDuplicates(cwd, { id: item.id, title: item.title });
  if (dups.length === 0) return false;
  console.warn(`\n⚠️  检测到 ${dups.length} 条可能的重复登记（R-352 非破坏性提示，不会拦 promote）：`);
  for (const d of dups) {
    if (d.kind === 'same-id') {
      console.warn(
        `- [${d.id}] 同 id 撞号：active「${d.active_title}」(${d.active_file}) vs archived「${d.archived_title ?? ''}」(${d.archived_file ?? ''})${d.identical ? '（内容一致）' : '（内容不同=两种需求撞了同号，走独立迁移）'}`,
      );
    } else if (d.archived_file) {
      console.warn(
        `- [${d.id}] 同标题已归档：当前「${d.active_title}」 vs ${d.archived_file}「${d.archived_title ?? ''}」——可能已做过，确认不是真新需求后再 promote`,
      );
    } else {
      console.warn(
        `- [${d.id}] 同标题现存：当前「${d.active_title}」 vs ${d.active_file}「${d.active_title}」——建议合并/skip 其一`,
      );
    }
  }
  if (!item.evidence.decision_brief) {
    item.evidence.decision_brief = `R-352 去重提示（${today()}）：检测到 ${dups.length} 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。`;
    await writeBacklogItem(cwd, item);
  }
  return true;
}

async function backlogPromote(options: BacklogCommandOptions): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error('docpath backlog promote requires <id>');
  }

  const current = await readCurrentState(options.cwd);
  const activeTaskExists = current && current.phase !== 'idle' && current.phase !== 'completed';

  const item = await readBacklogItem(options.cwd, options.id.trim());
  if (!item) {
    throw new Error(`docpath backlog promote: backlog 条目不存在: ${options.id}`);
  }

  if (item.links.task) {
    throw new Error(`docpath backlog promote: backlog 条目 ${item.id} 已关联任务 ${item.links.task}`);
  }

  await assertNotActiveInOtherWorktrees(options.cwd, item.id);

  // R-352：promote 前重复登记探测——只报告不拦（含同 id 撞号 R-321/FR-2 与同标题）
  await warnOnDuplicateRegistration(options.cwd, item);

  const dirtyReport = detectDirtyWorktree(options.cwd);
  const isDirty = dirtyReport.isGitRepo && dirtyReport.files.some(f => !isPromoteBacklogEvidencePath(f, item.id));

  let inWorktree = false;
  let worktreePath = options.cwd;

  const isInteractive = process.stdout.isTTY && !options.nonInteractive;

  if (!options.adopt && activeTaskExists && isInteractive) {
    const safeWtName = `wt-${item.id.toLowerCase()}`;
    const paths = await resolveWorktreePaths(options.cwd, safeWtName);
    worktreePath = paths.worktreePath;
    inWorktree = true;

    console.warn(`\n⚠️  检测到当前已有活跃任务进行中，自动启动隔离开发区 (Git Worktree)...`);
    
    await worktreeCommand({
      action: 'create',
      name: safeWtName,
      cwd: options.cwd,
    });

    options.cwd = worktreePath;
  } else {
    if (activeTaskExists && !options.adopt) {
      throw new Error(`docpath backlog promote: 当前已有活跃任务（phase=${current.phase}），请先 done，或用 docpath task abort/reset 显式清理当前任务`);
    }
    if (!options.adopt) {
      assertCleanWorktreeForNewTask(options.cwd, 'docpath backlog promote', {
        allowDirtyPath: (path) => isPromoteBacklogEvidencePath(path, item.id),
      });
    } else {
      console.log(`📦  已启用 --adopt 模式：就地认领当前工作区变更并启动任务`);
    }
  }

  assertBacklogReadyForExecution(item, 'promote', options.draft, options.cwd);

  const docpathDir = await resolveDocpathDir(options.cwd);
  const nextStatus = transitionBacklog(item.status, 'active');
  const taskId = generateUniqueTaskId(docpathDir, item.title);

  const aliasBackup = await backupCurrentTaskAlias(docpathDir);
  await clearCurrentTaskAlias(docpathDir);

  const specContent = renderPromotedSpec(item, taskId, options.cwd);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  item.status = nextStatus;
  item.links.task = taskId;
  item.links.spec = canonicalTaskRelativePath(taskId, 'spec.md');
  await writeBacklogItem(options.cwd, item);
  await refreshBacklogIndex(options.cwd);
  // R-338: 创建期风险评估（文本信号：标题 + backlog 正文），落盘 state.risk_tier
  const riskPolicy = riskPolicyFromConfig(await readRiskPolicyConfig(options.cwd));
  const riskVerdict = evaluateTaskRisk({ text: `${item.title}\n${item.body}`, policy: riskPolicy });

  await transitionWorkflow(options.cwd, 'task.created', {
    taskId,
    taskTitle: item.title,
    backlogId: item.id,
    level: item.level,
    workflowProfile: 'standard',
    riskTier: riskVerdict.tier,
    currentStep: `backlog promote ${item.id} 完成，下一步: docpath plan`,
  });

  console.log(`✅  已 promote backlog 条目: ${item.id}`);
  console.log(`   task_id: ${taskId}`);
  console.log(`   risk: ${riskTierName(riskVerdict.tier)}${riskVerdict.reasons.length > 0 ? `（${riskVerdict.reasons.join('；')}）` : ''}`);
  console.log(`   spec: .docpath/${canonicalTaskRelativePath(taskId, 'spec.md')}`);
  console.log(`   spec_seed: 已预填 backlog 背景/FR/AC/evidence —— 请在 seed 上增量修订，write-spec 全量重写仅用于推倒重来`);
  console.log(`   truth_sync: ${SPEC_TRUTH_SYNC_HINT}`);
  if (item.level <= 1) {
    console.log('   ⚡ level-1 提示: 可直接 docpath go --step S1（免 plan 直达单步计划, R-306）；下次微小改动可用 docpath quick（R-310）');
  }
  if (aliasBackup) {
    console.log(`   previous_current_backup: ${aliasBackup.backupDir}`);
    console.log(`   backup_files: ${aliasBackup.files.join(', ')}`);
  }

  if (inWorktree) {
    const parentRoot = dirtyReport.repoRoot || options.cwd;
    const relWorktreePath = relative(parentRoot, worktreePath);
    console.log(`\n🌳  自动隔离工作区已就绪！请立刻切换目录以执行后续命令：`);
    console.log(`    cd ${relWorktreePath}`);
    console.log(`    docpath next --agent\n`);
  } else {
    await emitNextHint(options.cwd);
  }
}

async function backlogAdvanceStatus(
  options: BacklogCommandOptions,
  target: 'accepted' | 'planned',
): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error(`docpath backlog ${target === 'accepted' ? 'accept' : 'plan'} requires <id>`);
  }

  const existing = await readBacklogItem(options.cwd, options.id.trim());
  if (!existing) {
    throw new Error(`[docpath] backlog 条目不存在: ${options.id}`);
  }
  assertBacklogReadyForExecution(existing, target === 'accepted' ? 'accept' : 'plan', options.draft, options.cwd);
  const item = await setBacklogStatus(options.cwd, existing.id, target);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
}

/**
 * backlog archive（R-352）: 显式把终态条目归档进 archived/。
 *
 * 只接受 done/dropped（引擎 archiveBacklogItem 内校验）。moved=false 即幂等静默收尾，
 * 由撞号安全阀非破坏性暴露给 `backlog groom`。
 */
async function backlogArchive(options: BacklogCommandOptions): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error('docpath backlog archive requires <id>');
  }
  const result = await archiveBacklogItem(options.cwd, options.id.trim());
  if (result.moved) {
    console.log(`✅  backlog 条目已归档: ${options.id.trim()} → ${result.file ?? 'backlog/archived/'}`);
    return;
  }
  console.log(`ℹ️  backlog 条目无需归档: ${options.id.trim()}（已在 archived 里或撞号安全阀拦截，见 backlog groom）`);
}

async function backlogUpdateTerminalStatus(
  options: BacklogCommandOptions,
  target: 'done' | 'dropped',
): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error(`docpath backlog ${target === 'done' ? 'done' : 'drop'} requires <id>`);
  }
  if (options.task?.trim() && target !== 'done') {
    throw new Error('docpath backlog --task 仅适用于 done（drop 不需要任务证据）');
  }

  const item = await setBacklogStatus(options.cwd, options.id.trim(), target, {
    linkTask: options.task?.trim() || undefined,
  });
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}${item.links.task ? `（任务 ${item.links.task}）` : ''}`);
}

function renderListTable(items: BacklogItem[]): string {
  const lines = [
    '',
    '📚  Backlog 条目',
    '',
    '| id | priority | status | level | title | task |',
    '|----|----------|--------|-------|-------|------|',
  ];

  for (const item of items) {
    lines.push(
      `| ${item.id} | ${item.priority} | ${item.status} | ${item.level} | ${item.title} | ${item.links.task ?? ''} |`
    );
  }

  if (items.length === 0) {
    lines.push('| - | - | - | - | 暂无条目 | - |');
  }

  lines.push('');
  return lines.join('\n');
}

async function backlogList(options: BacklogCommandOptions): Promise<void> {
  const status = normalizeStatusFilter(options.status);
  const priority = options.priority ? normalizePriority(options.priority) : undefined;
  const filtered = sortBacklogItems(
    (await listBacklogItems(options.cwd)).filter((item) => {
      if (status && item.status !== status) return false;
      if (priority && item.priority !== priority) return false;
      return true;
    })
  );

  if (options.agent) {
    console.log(stringify({
      count: filtered.length,
      items: filtered.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        level: item.level,
        readiness: item.readiness,
        task: item.links.task,
      })),
    }));
    return;
  }

  console.log(renderListTable(filtered));
}

async function backlogRefresh(options: BacklogCommandOptions): Promise<void> {
  const items = await listBacklogItems(options.cwd);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 索引已刷新: ${items.length} 个条目`);
  console.log('   index: .docpath/backlog/backlog.md');
}

async function backlogGroom(options: BacklogCommandOptions): Promise<void> {
  const issues = await collectBacklogGroomIssues(options);
  // R-321/FR-2：撞号检测为非破坏性告警，不计入 issues（不触发 groom 失败），
  // 只把 refreshBacklogIndex 归档时的「静默跳过」显式暴露；数据迁移另走独立条目。
  const collisions = await detectBacklogIdCollisions(options.cwd);

  if (options.agent) {
    console.log(stringify({
      passed: issues.length === 0,
      issue_count: issues.length,
      issues,
      id_collisions: collisions,
    }));
  } else {
    console.log(renderGroomReport(issues, collisions));
  }

  if (issues.length > 0) {
    throw new Error(`docpath backlog groom failed: ${issues.length} issue(s)`);
  }
}

/**
 * FR-4 动作单一真源：backlog 动作 → 处理器映射。帮助文案 / 校验 / 报错全部由
 * BACKLOG_ACTIONS 派生，扩展一个动作只改这里一处的映射项，其余（roster、usage、报错）自动跟随。
 */
const backlogActions = {
  add: backlogAdd,
  capture: backlogCapture,
  edit: backlogEdit,
  list: backlogList,
  groom: backlogGroom,
  refresh: backlogRefresh,
  promote: backlogPromote,
  accept: (o: BacklogCommandOptions) => backlogAdvanceStatus(o, 'accepted'),
  plan: (o: BacklogCommandOptions) => backlogAdvanceStatus(o, 'planned'),
  done: (o: BacklogCommandOptions) => backlogUpdateTerminalStatus(o, 'done'),
  drop: (o: BacklogCommandOptions) => backlogUpdateTerminalStatus(o, 'dropped'),
  archive: backlogArchive,
} as const satisfies Record<string, (o: BacklogCommandOptions) => Promise<void>>;

export type BacklogActionName = keyof typeof backlogActions;
/** 全部 backlog 动作名（单一真源，序保证帮助/报错可读性）。 */
export const BACKLOG_ACTIONS = Object.keys(backlogActions) as unknown as readonly BacklogActionName[];
/** 派生 usage 字符串（`a|b|c`），供无 action / 非法 action 报错复用。 */
function backlogActionUsage(): string {
  return BACKLOG_ACTIONS.join('|');
}

export async function backlogCommand(options: BacklogCommandOptions): Promise<void> {
  const raw = options.action?.trim().toLowerCase() ?? '';
  if (!raw) {
    throw new Error(`docpath backlog requires <${backlogActionUsage()}>`);
  }
  const handler = backlogActions[raw as BacklogActionName];
  if (!handler) {
    throw new Error(`docpath backlog: unsupported action ${raw}（允许: ${backlogActionUsage()}）`);
  }
  await handler(options);
}
