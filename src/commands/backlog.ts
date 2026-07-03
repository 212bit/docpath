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
  type BacklogPriority,
  type BacklogReadiness,
  type BacklogStatus,
  createBacklogItem,
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
import { archivedTaskDir, canonicalTaskRelativePath, canonicalTaskDir, clearCurrentTaskAlias, writeActiveTaskFile } from '../utils/task-files.js';
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
  agent?: boolean;
  draft?: boolean;
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

async function resolveBacklogBody(options: BacklogCommandOptions): Promise<string> {
  if (options.bodyFile && hasInlineBodyOptions(options)) {
    throw new Error('docpath backlog: --body-file 不能与 --background/--acceptance 同时使用');
  }

  if (options.bodyFile) {
    return readBacklogBodyFile(options.cwd, options.bodyFile);
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
  const lines = body.trim().split('\n');
  return !body.trim() || lines.some((line) =>
    /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
  );
}

function readinessRank(readiness: BacklogReadiness): number {
  return ['raw', 'shaped', 'analyzed', 'confirmed'].indexOf(readiness);
}

function missingReadinessEvidence(item: BacklogItem): string[] {
  const issues: string[] = [];
  if (isPlaceholderBody(item.body)) {
    issues.push('正文仍为空或包含占位内容');
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
  return issues;
}

function assertBacklogReadyForExecution(item: BacklogItem, action: 'accept' | 'plan' | 'promote', skipCheck = false): void {
  if (skipCheck) return;
  const issues = missingReadinessEvidence(item);
  if (issues.length === 0) return;
  throw new Error([
    `docpath backlog ${action}: backlog 条目 ${item.id} 尚未达到可执行成熟度`,
    ...issues.map((issue) => `- ${issue}`),
    `修复建议: docpath backlog edit ${item.id} --background <text> --acceptance <text> --readiness analyzed --evidence-analysis <path>`,
    item.level >= 3
      ? `level 3 还需: --readiness confirmed --evidence-decision <ref> --user-confirmed <text>`
      : '',
  ].filter(Boolean).join('\n'));
}

function isPromoteBacklogEvidencePath(path: string, itemId: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized === '.docpath/backlog/backlog.md'
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
  if ((item.status === 'proposed' || item.status === 'accepted') && isPlaceholderBody(item.body)) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body',
      message: '条目正文为空或仍包含占位内容',
      suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
    });
  }
  if (
    item.status !== 'dropped'
    && item.status !== 'proposed'
    && item.status !== 'accepted'
    && isPlaceholderBody(item.body)
  ) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body',
      message: '条目正文为空或仍包含占位内容',
      suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
    });
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

function renderGroomReport(issues: BacklogGroomIssue[]): string {
  const lines = ['', '🧹  Backlog 健康检查', ''];
  if (issues.length === 0) {
    lines.push('✅  Backlog 健康检查通过');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`❌  发现 ${issues.length} 个问题`);
  lines.push('');
  for (const issue of issues) {
    lines.push(`- [${issue.id}] ${issue.field}: ${issue.message}`);
    lines.push(`  修复建议: ${issue.suggestion}`);
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

function renderPromotedSpec(item: BacklogItem, taskId: string): string {
  const parsed = parseBacklogBody(item.body);
  const backgroundSection = parsed.background || '- 待补充';
  const evidenceSection = renderEvidenceSummary(item.evidence);

  // 验收标准：优先从 body 解析出的 acceptance，否则用默认骨架
  const acceptanceLines: string[] = [];
  if (parsed.acceptance) {
    // 将 body 中的验收内容转为 AC 条目
    const acItems = parsed.acceptance
      .split('\n')
      .filter(l => l.trim())
      .map((line, i) => `- [ ] AC-${i + 1}: ${line.replace(/^\s*(\d+\.\s*|[-*]\s*)+/, '').trim()}`);
    if (acItems.length > 0) acceptanceLines.push(...acItems);
  }
  // 始终保留关联 AC
  const acStart = acceptanceLines.length + 1;
  acceptanceLines.push(`- [ ] AC-${acStart}: 生成的 spec 可直接进入 \`docpath plan\``);
  acceptanceLines.push(`- [ ] AC-${acStart + 1}: backlog 条目 ${item.id} 与任务 ${taskId} 建立双向关联`);

  // Decision Brief 预填：如果 evidence.decision_brief 有内容则注入
  const decisionBriefContent = item.evidence.decision_brief?.trim();

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
    `- [ ] FR-1: ${item.title}`,
    `  - 来源 backlog: ${item.id}`,
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
    ...renderMajorDecisionGate(item),
  );

  // 如果 decision_brief 有预填内容，在 Decision Brief 段后追加
  if (decisionBriefContent) {
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

function inferMajorChangeTypes(item: BacklogItem): Set<string> {
  const text = backlogSearchText(item);
  const types = new Set<string>();
  if (includesAny(text, [/workflow|worktree|agent|docpath|fsm|门禁|工作流|状态机|任务流/i])) {
    types.add('工作流 / Agent 行为');
  }
  if (includesAny(text, [/permission|write boundary|staging|commit|git add|权限|写操作|索引|提交/i])) {
    types.add('权限 / 写操作边界');
  }
  if (includesAny(text, [/architecture|module boundary|架构|模块边界/i])) {
    types.add('架构 / 模块边界');
  }
  if (includesAny(text, [/api|contract|schema|协议|契约/i])) {
    types.add('API / 数据契约');
  }
  if (includesAny(text, [/scope|broad|全部|范围扩大/i])) {
    types.add('范围扩大');
  }
  return types;
}

function renderMajorDecisionGate(item: BacklogItem): string[] {
  const productUi = isProductUiImplementationTask(item);
  const inferredTypes = inferMajorChangeTypes(item);
  const userConfirmed = item.evidence.user_confirmed?.trim() || '';
  const requiresMajorConfirmation = item.level >= 3 || userConfirmed.length > 0 || inferredTypes.size > 0;
  const checked = (value: boolean) => value ? 'x' : ' ';
  const typeLine = (label: string) => `- [${checked(inferredTypes.has(label))}] ${label}`;
  const decisionBriefRef = item.evidence.decision_brief?.trim() || '';
  const problem = item.body.trim().split('\n').find((line) => line.trim().length > 0)?.trim() || item.title;

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
    `- 背景: 来自 backlog ${item.id}${decisionBriefRef ? `，Decision Brief 证据: ${decisionBriefRef}` : ''}`,
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
  if (!options.title?.trim()) {
    throw new Error('docpath backlog add requires --title <title>');
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
    title: options.title.trim(),
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
}

async function backlogCapture(options: BacklogCommandOptions): Promise<void> {
  if (!options.title?.trim()) {
    throw new Error('docpath backlog capture requires --title <title>');
  }

  const body = hasBodyInput(options)
    ? await resolveBacklogBody(options)
    : buildInlineBacklogBody(options);

  const item = await createBacklogItem(options.cwd, {
    title: options.title.trim(),
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
  if (options.title?.trim()) updated.title = options.title.trim();
  if (options.priority) updated.priority = normalizePriority(options.priority);
  if (options.level) updated.level = normalizeLevel(options.level);
  if (options.bodyFile || hasInlineBodyOptions(options)) {
    updated.body = await resolveBacklogBody(options);
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
        if (err instanceof Error && err.message.includes('promote')) throw err;
      }
    }
  }
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

  const dirtyReport = detectDirtyWorktree(options.cwd);
  const isDirty = dirtyReport.isGitRepo && dirtyReport.files.some(f => !isPromoteBacklogEvidencePath(f, item.id));

  let inWorktree = false;
  let worktreePath = options.cwd;

  const isInteractive = process.stdout.isTTY && !options.nonInteractive;

  if ((activeTaskExists || isDirty) && isInteractive) {
    const safeWtName = `wt-${item.id.toLowerCase()}`;
    const paths = await resolveWorktreePaths(options.cwd, safeWtName);
    worktreePath = paths.worktreePath;
    inWorktree = true;

    console.warn(`\n⚠️  检测到当前有活跃任务或 Git 处于非干净状态，将自动启动隔离开发区 (Git Worktree)...`);
    
    await worktreeCommand({
      action: 'create',
      name: safeWtName,
      cwd: options.cwd,
    });

    options.cwd = worktreePath;
  } else {
    if (activeTaskExists) {
      throw new Error(`docpath backlog promote: 当前已有活跃任务（phase=${current.phase}），请先 done，或用 docpath task abort/reset 显式清理当前任务`);
    }
    assertCleanWorktreeForNewTask(options.cwd, 'docpath backlog promote', {
      allowDirtyPath: (path) => isPromoteBacklogEvidencePath(path, item.id),
    });
  }

  assertBacklogReadyForExecution(item, 'promote', options.draft);

  const docpathDir = await resolveDocpathDir(options.cwd);
  const nextStatus = transitionBacklog(item.status, 'active');
  const taskId = generateUniqueTaskId(docpathDir, item.title);

  await clearCurrentTaskAlias(docpathDir);

  const specContent = renderPromotedSpec(item, taskId);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  item.status = nextStatus;
  item.links.task = taskId;
  item.links.spec = canonicalTaskRelativePath(taskId, 'spec.md');
  await writeBacklogItem(options.cwd, item);
  await refreshBacklogIndex(options.cwd);
  await transitionWorkflow(options.cwd, 'task.created', {
    taskId,
    taskTitle: item.title,
    backlogId: item.id,
    currentStep: `backlog promote ${item.id} 完成，下一步: docpath plan`,
  });

  console.log(`✅  已 promote backlog 条目: ${item.id}`);
  console.log(`   task_id: ${taskId}`);
  console.log(`   spec: .docpath/${canonicalTaskRelativePath(taskId, 'spec.md')}`);

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
  assertBacklogReadyForExecution(existing, target === 'accepted' ? 'accept' : 'plan', options.draft);
  const item = await setBacklogStatus(options.cwd, existing.id, target);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
}

async function backlogUpdateTerminalStatus(
  options: BacklogCommandOptions,
  target: 'done' | 'dropped',
): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error(`docpath backlog ${target === 'done' ? 'done' : 'drop'} requires <id>`);
  }

  const item = await setBacklogStatus(options.cwd, options.id.trim(), target);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
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

  if (options.agent) {
    console.log(stringify({
      passed: issues.length === 0,
      issue_count: issues.length,
      issues,
    }));
  } else {
    console.log(renderGroomReport(issues));
  }

  if (issues.length > 0) {
    throw new Error(`docpath backlog groom failed: ${issues.length} issue(s)`);
  }
}

export async function backlogCommand(options: BacklogCommandOptions): Promise<void> {
  const action = options.action?.trim().toLowerCase();
  if (!action) {
    throw new Error('docpath backlog requires <capture|add|edit|list|groom|refresh|accept|plan|promote|done|drop>');
  }

  switch (action) {
    case 'add':
      await backlogAdd(options);
      return;
    case 'capture':
      await backlogCapture(options);
      return;
    case 'edit':
      await backlogEdit(options);
      return;
    case 'list':
      await backlogList(options);
      return;
    case 'groom':
      await backlogGroom(options);
      return;
    case 'refresh':
      await backlogRefresh(options);
      return;
    case 'promote':
      await backlogPromote(options);
      return;
    case 'accept':
      await backlogAdvanceStatus(options, 'accepted');
      return;
    case 'plan':
      await backlogAdvanceStatus(options, 'planned');
      return;
    case 'done':
      await backlogUpdateTerminalStatus(options, 'done');
      return;
    case 'drop':
      await backlogUpdateTerminalStatus(options, 'dropped');
      return;
    default:
      throw new Error(`docpath backlog: unsupported action ${action}（允许: capture|add|edit|list|groom|refresh|accept|plan|promote|done|drop）`);
  }
}
