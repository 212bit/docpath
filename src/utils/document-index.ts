import { existsSync, type Dirent } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep, dirname, relative } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { normalizeTopic } from './topic-synonyms.js';
import { readDeclaredDocumentScanPaths } from './config.js';
import { isExcludedForScan } from './scan-existing-tree.js';

export const PROJECT_DOCS_INDEX_VERSION = 2;
/** docs graph 高置信度阈值：唯一候选且 score ≥ 该值才允许 --fix 自动写入 frontmatter（工程自定值，可调） */
export const DOC_GRAPH_HIGH_CONFIDENCE_SCORE = 0.15;
/** docs graph 报告中推荐候选的最低展示分数（低于此值的候选不进报告，避免噪音） */
export const DOC_GRAPH_MIN_REPORT_SCORE = 0.05;
/** docs graph 报告中每篇文档最多展示的推荐候选数 */
export const DOC_GRAPH_RECOMMEND_LIMIT = 3;
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 15000;
export const ARCHIVE_RETENTION_DAYS = 180;
export const ARCHIVE_RETENTION_MS = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const PROJECT_DOCS_SCAN_EXCLUDED_DIRS = [
  'workspace/commands',
  'workspace/bin',
  'workspace/leases',
  'workspace/sessions',
  'tasks/promote-backups',
  'promote-backups',
];

export type DocLifecycleStatus = 'active' | 'wip' | 'deprecated';

export interface ProjectDocumentIndexEntry {
  path: string;
  type: string;
  kind: string;
  scope: string;
  level: string;
  title: string;
  summary: string;
  updated_at: string;
  lastModified?: string;
  size: number;
  token_estimate: number;
  default_read: boolean;
  archive: boolean;
  generated_view?: boolean;
  index_only?: boolean;
  stale?: boolean;
  task_id?: string;
  status?: DocLifecycleStatus;
  deprecated_by?: string;
  topic_tags: string[];
  content_terms?: string[];
  /** frontmatter `related` 原文声明（相对 docs/ 的路径），docs graph 关联图谱数据源 */
  related?: string[];
  /** 反向链接聚合：A.related 含 B ⇒ B.backlinks 含 A（仅索引层存在，绝不回写对方文件） */
  backlinks?: string[];
}

export interface ProjectDocumentIndex {
  version: number;
  generated_at: string;
  entries: ProjectDocumentIndexEntry[];
}

/** docs graph 图谱节点：仅覆盖 docs/*.md 与 docs/ 一级子目录 md（范围红线） */
export interface DocGraphNode {
  path: string;
  title: string;
  /** 出链（解析自 frontmatter related，仅保留指向图谱内节点的有效边） */
  related: string[];
  /** frontmatter 原文声明，未做路径归一 */
  declaredRelated: string[];
  /** 入链（由全图 related 反推聚合，不落文件） */
  backlinks: string[];
  /** 孤立 = 无出链且无入链 */
  orphan: boolean;
}

export interface DocGraph {
  nodes: DocGraphNode[];
  byPath: Map<string, DocGraphNode>;
}

export interface RelatedRecommendation {
  path: string;
  score: number;
}

export interface DocumentIndexBuildInput {
  path: string;
  content: string;
  size: number;
  mtime: Date;
  title?: string;
  summary?: string;
  currentTaskId?: string;
  hasPreferredRules?: boolean;
}

export interface DocumentSelectionOptions {
  topic?: string;
  taskId?: string;
  includeArchive?: boolean;
  currentTaskId?: string;
}

export interface DocumentIndexStats {
  total: number;
  defaultRead: number;
  archive: number;
  selected: number;
  estimatedTokens: number;
  defaultReadTokens: number;
  selectedTokens: number;
  archiveTokens: number;
  selectedIndexOnly: number;
  selectedIndexOnlyTokens: number;
}

export function normalizeDocPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.docpath\//, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

export function isProjectDocumentScanExcludedPath(filePath: string): boolean {
  const normalized = normalizeDocPath(filePath);
  return PROJECT_DOCS_SCAN_EXCLUDED_DIRS.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}

export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = text.length - cjk;
  return Math.ceil(cjk * 1.5 + ascii / 4);
}

export function estimateTokensFromBytes(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 3));
}

export function inferDocumentKind(filePath: string): string {
  const normalized = normalizeDocPath(filePath);
  const name = basename(normalized).toLowerCase();

  if (normalized.startsWith('rules/') || normalized.startsWith('spec/')) return 'reference';
  if (normalized.startsWith('tasks/')) return 'runbook';
  if (normalized.startsWith('backlog/')) return 'runbook';
  if (normalized.startsWith('workspace/journal/') || name === 'decisions.md' || name === 'lesson-candidates.md') return 'log';
  if (normalized.startsWith('workspace/')) return 'index';
  if (normalized.startsWith('templates/')) return 'template';
  if (normalized.startsWith('commands/')) return 'reference';
  if (name === 'docs.md') return 'index';

  return 'index';
}

export function inferDocumentScope(filePath: string): string {
  const normalized = normalizeDocPath(filePath);

  if (normalized.startsWith('spec/backend/')) return 'backend';
  if (normalized.startsWith('spec/frontend/')) return 'frontend';
  if (normalized.startsWith('spec/infra/')) return 'infra';
  if (normalized.startsWith('spec/shared/')) return 'shared';
  if (normalized.startsWith('tasks/current/')) return 'task';
  if (/^tasks\/(?:done\/)?T-[^/]+\//.test(normalized)) return 'task';
  if (normalized.startsWith('rules/') || normalized.startsWith('spec/')) return 'project';

  return 'project';
}

export function isArchiveDocPath(filePath: string): boolean {
  const normalized = normalizeDocPath(filePath);
  return normalized.startsWith('tasks/done/')
    || normalized.startsWith('archive/')
    || normalized.startsWith('workspace/journal/')
    || normalized.startsWith('backlog/archived/')
    || normalized.startsWith('backlog/analysis/')
    || normalized === 'workspace/decisions.md'
    || normalized === 'workspace/check-history.md';
}

export function isArchiveDocumentExpired(filePath: string, mtime: Date, now = Date.now()): boolean {
  const normalized = normalizeDocPath(filePath);
  if (!normalized.startsWith('tasks/done/') && !normalized.startsWith('archive/')) {
    return false;
  }
  return now - mtime.getTime() > ARCHIVE_RETENTION_MS;
}

export function formatMissingTaskIdMessage(docpathDir: string, taskId: string): string {
  const archivedTaskDir = join(docpathDir, 'tasks', 'done', taskId);
  if (existsSync(archivedTaskDir)) {
    return [
      `task_id ${taskId} 的归档文档已超出 docs-index ${ARCHIVE_RETENTION_DAYS} 天保留窗口，已被 docs scan 物理移除索引。`,
      '这不是 docs-index 损坏；默认索引只保留窗口内归档以控制上下文体积。',
      `如需人工追溯，请直接读取 .docpath/tasks/done/${taskId}/，或调整保留策略后重新运行 docpath docs scan。`,
    ].join('\n');
  }
  return `未在 docs-index 中找到 task_id: ${taskId}`;
}

export function assertDocumentIndexContainsTaskId(
  docpathDir: string,
  entries: ProjectDocumentIndexEntry[],
  taskId: string | undefined,
): void {
  if (!taskId) return;
  if (entries.some((entry) => entry.task_id === taskId)) return;
  throw new Error(formatMissingTaskIdMessage(docpathDir, taskId));
}

export function isGeneratedViewDocPath(filePath: string): boolean {
  const normalized = normalizeDocPath(filePath);
  return normalized === 'docs.md'
    || normalized === 'backlog/backlog.md'
    || normalized.startsWith('archive/')
    || normalized.startsWith('workspace/');
}

export function isIndexOnlyDocument(entry: Pick<ProjectDocumentIndexEntry, 'path' | 'generated_view' | 'index_only'>): boolean {
  return Boolean(entry.index_only || entry.generated_view || isGeneratedViewDocPath(entry.path));
}

export function isTemplateDocPath(filePath: string): boolean {
  const normalized = normalizeDocPath(filePath);
  return normalized.startsWith('templates/') || normalized.includes('/template/');
}

export function inferDocumentLevel(filePath: string): string {
  const normalized = normalizeDocPath(filePath);
  if (isArchiveDocPath(normalized) || isTemplateDocPath(normalized) || normalized.startsWith('commands/')) return '3';
  if (normalized.startsWith('workspace/')) return '0';
  if (normalized.startsWith('tasks/current/') || /^tasks\/T-[^/]+\//.test(normalized)) return '1';
  if (normalized.startsWith('rules/') || normalized.startsWith('spec/')) return '2';
  return '2';
}

export function extractTaskIdFromDocPath(filePath: string, currentTaskId?: string): string | undefined {
  const normalized = normalizeDocPath(filePath);
  if (normalized.startsWith('tasks/current/')) return currentTaskId;
  return normalized.match(/^tasks\/(?:done\/)?(T-[^/]+)\//)?.[1];
}

function normalizedWordTags(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 48);
}

export function inferTopicTags(input: {
  path: string;
  title?: string;
  summary?: string;
  kind?: string;
  scope?: string;
  taskId?: string;
}): string[] {
  const tags = new Set<string>();
  const normalized = normalizeDocPath(input.path);
  for (const segment of normalized.split('/')) {
    const clean = segment.replace(extname(segment), '');
    for (const tag of normalizedWordTags(clean)) tags.add(tag);
  }
  for (const value of [input.kind, input.scope, input.taskId, input.title, input.summary]) {
    if (!value) continue;
    for (const tag of normalizedWordTags(value)) tags.add(tag);
  }
  return Array.from(tags).slice(0, 24);
}

export function inferContentTerms(content: string): string[] {
  const terms = new Set<string>();
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*\n?/, '');
  for (const term of normalizedWordTags(withoutFrontmatter)) {
    terms.add(term);
    if (terms.size >= 24) break;
  }
  return Array.from(terms);
}

/* ------------------------------------------------------------------ */
/* 文档关联图谱 (docs graph) — frontmatter related / backlinks / 推荐  */
/* ------------------------------------------------------------------ */

export interface DocFrontmatterMetadata {
  related: string[];
  status?: DocLifecycleStatus;
  deprecated_by?: string;
  status_reason?: string;
}

/**
 * 容错解析 frontmatter 元数据（related, status, deprecated_by 等）。
 */
export function parseFrontmatterMetadata(content: string): DocFrontmatterMetadata {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { related: [] };
  try {
    const fm: unknown = parseYaml(match[1] || '');
    if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return { related: [] };
    const rec = fm as Record<string, unknown>;

    let related: string[] = [];
    if (typeof rec.related === 'string') {
      const value = rec.related.trim();
      if (value) related = [value];
    } else if (Array.isArray(rec.related)) {
      related = rec.related
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
    }

    let status: DocLifecycleStatus | undefined;
    if (typeof rec.status === 'string') {
      const s = rec.status.trim().toLowerCase();
      if (s === 'active' || s === 'wip' || s === 'deprecated') {
        status = s;
      }
    }

    const deprecated_by = typeof rec.deprecated_by === 'string' && rec.deprecated_by.trim()
      ? rec.deprecated_by.trim()
      : undefined;

    const status_reason = typeof rec.status_reason === 'string' && rec.status_reason.trim()
      ? rec.status_reason.trim()
      : undefined;

    return { related, status, deprecated_by, status_reason };
  } catch {
    return { related: [] };
  }
}

/**
 * 容错解析 frontmatter `related` 声明。
 * 无 frontmatter、空 related、非法 YAML、非字符串项一律返回空数组，绝不抛异常。
 */
export function parseFrontmatterRelated(content: string): string[] {
  return parseFrontmatterMetadata(content).related;
}

/**
 * 更新或插入文档的生命周期状态 (status, deprecated_by, status_reason)
 */
export function upsertFrontmatterStatus(
  content: string,
  status: DocLifecycleStatus,
  options?: { deprecatedBy?: string; statusReason?: string },
): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (match) {
    let fm: Record<string, unknown>;
    try {
      const parsed: unknown = parseYaml(match[1] || '');
      fm = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? (parsed as Record<string, unknown>) : {};
    } catch {
      fm = {};
    }
    fm.status = status;
    if (options?.deprecatedBy) {
      fm.deprecated_by = options.deprecatedBy;
    } else if (status === 'active' && fm.deprecated_by) {
      delete fm.deprecated_by;
    }
    if (options?.statusReason) {
      fm.status_reason = options.statusReason;
    } else if (status === 'active' && fm.status_reason) {
      delete fm.status_reason;
    }
    const body = content.slice(match[0].length);
    return `---\n${stringifyYaml(fm).trim()}\n---\n${body}`;
  }

  const fmObj: Record<string, unknown> = { status };
  if (options?.deprecatedBy) fmObj.deprecated_by = options.deprecatedBy;
  if (options?.statusReason) fmObj.status_reason = options.statusReason;
  return `---\n${stringifyYaml(fmObj).trim()}\n---\n\n${content}`;
}

/** docs graph 节点范围红线：仅 docs/ 一级（根 md + 一级子目录 md），更深嵌套与 .docpath/ 资产不入图 */
export function isDocsGraphNodePath(filePath: string): boolean {
  const normalized = normalizeDocPath(filePath);
  return /^docs\/[^/]+\.md$/.test(normalized) || /^docs\/[^/]+\/[^/]+\.md$/.test(normalized);
}

/** 图谱节点路径 → frontmatter 声明值（相对 docs/ 的路径，原文约定） */
export function toDocsRelatedDeclaredValue(nodePath: string): string {
  return normalizeDocPath(nodePath).replace(/^docs\//, '');
}

/**
 * 解析 related 声明为图谱节点路径。容错：http/锚点/越出 docs/（../）等一律返回 null。
 * 声明值约定相对 docs/；同时兼容 './x.md' 与 'docs/x.md' 全写形式。
 */
export function resolveDocsRelatedTarget(value: string): string | null {
  const raw = String(value ?? '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('#') || raw.startsWith('mailto:') || raw.includes('\0')) return null;
  const rel = raw.replace(/^\.\//, '').replace(/^docs\//, '');
  if (!rel || rel.startsWith('../') || rel.startsWith('/')) return null;
  const candidate = normalizeDocPath(`docs/${rel}`);
  return isDocsGraphNodePath(candidate) ? candidate : null;
}

/**
 * 由索引条目构建关联图谱：
 * - 节点集 = isDocsGraphNodePath 命中的条目
 * - 出链 = frontmatter related 解析（非法路径与自引用静默丢弃）
 * - 入链 = 全图 related 反推聚合（A.related 含 B ⇒ B.backlinks 含 A），绝不回写文件
 * - orphan = 无出链且无入链
 */
export function buildDocGraph(entries: ProjectDocumentIndexEntry[]): DocGraph {
  const byPath = new Map<string, DocGraphNode>();
  const nodeEntries = new Map<string, ProjectDocumentIndexEntry>();

  for (const entry of entries) {
    if (!isDocsGraphNodePath(entry.path)) continue;
    nodeEntries.set(entry.path, entry);
    byPath.set(entry.path, {
      path: entry.path,
      title: entry.title || basename(entry.path, extname(entry.path)),
      related: [],
      declaredRelated: [],
      backlinks: [],
      orphan: true,
    });
  }

  for (const entry of nodeEntries.values()) {
    const source = byPath.get(entry.path)!;
    const declared = Array.isArray(entry.related) ? entry.related : [];
    source.declaredRelated = [...declared];
    for (const value of declared) {
      const target = resolveDocsRelatedTarget(value);
      if (!target || target === entry.path) continue;
      const targetNode = byPath.get(target);
      if (!targetNode) continue;
      if (!source.related.includes(target)) source.related.push(target);
      if (!targetNode.backlinks.includes(entry.path)) targetNode.backlinks.push(entry.path);
    }
  }

  for (const node of byPath.values()) {
    node.orphan = node.related.length === 0 && node.backlinks.length === 0;
  }

  return {
    nodes: Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
    byPath,
  };
}

/** 孤立文档路径清单（无出链且无入链，error 级报告项） */
export function findOrphanDocPaths(entries: ProjectDocumentIndexEntry[]): string[] {
  return buildDocGraph(entries).nodes.filter((node) => node.orphan).map((node) => node.path);
}

/**
 * 推荐相似度（纯本地、零 LLM）：
 * score = min(1, content_terms 交集 Jaccard + 0.5 × 标题词重叠)
 * 归一到 0..1；两端均为空集合时分量记 0。
 */
export function relatedDocScore(a: ProjectDocumentIndexEntry, b: ProjectDocumentIndexEntry): number {
  const termsA = new Set((a.content_terms || []).filter(Boolean));
  const termsB = new Set((b.content_terms || []).filter(Boolean));
  let shared = 0;
  for (const term of termsA) {
    if (termsB.has(term)) shared++;
  }
  const unionSize = new Set([...termsA, ...termsB]).size;
  const jaccard = unionSize === 0 ? 0 : shared / unionSize;

  const titleA = new Set(normalizedWordTags(a.title || ''));
  const titleB = new Set(normalizedWordTags(b.title || ''));
  const smaller = Math.min(titleA.size, titleB.size);
  let titleShared = 0;
  for (const word of titleA) {
    if (titleB.has(word)) titleShared++;
  }
  const titleOverlap = smaller === 0 ? 0 : titleShared / smaller;

  return Math.min(1, jaccard + 0.5 * titleOverlap);
}

/**
 * 关联推荐：对每个图谱节点给出候选（排除自引用与已存在关联 related/backlinks），
 * 按 score 降序取前 limit 个；score 低于 minScore 的候选不出现在结果中。
 */
export function recommendRelatedDocs(
  entries: ProjectDocumentIndexEntry[],
  options: { limit?: number; minScore?: number } = {},
): Map<string, RelatedRecommendation[]> {
  const limit = options.limit ?? DOC_GRAPH_RECOMMEND_LIMIT;
  const minScore = options.minScore ?? DOC_GRAPH_MIN_REPORT_SCORE;
  const graph = buildDocGraph(entries);
  const nodes = entries.filter((entry) => isDocsGraphNodePath(entry.path));
  const result = new Map<string, RelatedRecommendation[]>();

  for (const entry of nodes) {
    const node = graph.byPath.get(entry.path);
    const linked = new Set<string>([...(node?.related || []), ...(node?.backlinks || [])]);
    const candidates: RelatedRecommendation[] = [];
    for (const other of nodes) {
      if (other.path === entry.path || linked.has(other.path)) continue;
      const score = relatedDocScore(entry, other);
      if (score >= minScore) {
        candidates.push({ path: other.path, score: Math.round(score * 1000) / 1000 });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    result.set(entry.path, candidates.slice(0, limit));
  }

  return result;
}

/**
 * 在 markdown 内容上安全写入 frontmatter `related`（合并去重，排除已存在关联）。
 * - 已有 frontmatter：仅重写 frontmatter 区，正文逐字节保留；YAML 不可安全改写时原样返回
 * - 无 frontmatter：前置新增 frontmatter 块，原文逐字节保留
 * 返回 added 为空表示未发生任何写入。
 */
export function upsertFrontmatterRelated(
  content: string,
  relatedToAdd: string[],
): { content: string; added: string[] } {
  const normalizedKey = (value: string): string =>
    String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^docs\//, '');
  const seen = new Set<string>();
  const additions: string[] = [];
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (match) {
    for (const item of parseFrontmatterRelated(content)) seen.add(normalizedKey(item));
    for (const raw of relatedToAdd) {
      const key = normalizedKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      additions.push(key);
    }
    if (additions.length === 0) return { content, added: [] };

    let fm: Record<string, unknown>;
    try {
      const parsed: unknown = parseYaml(match[1] || '');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { content, added: [] };
      fm = parsed as Record<string, unknown>;
    } catch {
      return { content, added: [] };
    }

    const current = Array.isArray(fm.related)
      ? fm.related.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : typeof fm.related === 'string' && fm.related.trim()
        ? [fm.related.trim()]
        : [];
    fm.related = [...current, ...additions];

    const body = content.slice(match[0].length);
    return { content: `---\n${stringifyYaml(fm).trim()}\n---\n${body}`, added: additions };
  }

  for (const raw of relatedToAdd) {
    const key = normalizedKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    additions.push(key);
  }
  if (additions.length === 0) return { content, added: [] };

  const block = ['---', 'related:', ...additions.map((item) => `  - ${item}`), '---', ''].join('\n');
  return { content: `${block}\n${content}`, added: additions };
}

export function shouldDefaultReadDocPath(filePath: string, _currentTaskId?: string, hasPreferredRules = false): boolean {
  const normalized = normalizeDocPath(filePath);

  if (isArchiveDocPath(normalized) || isTemplateDocPath(normalized) || normalized.startsWith('commands/')) return false;
  if (normalized === 'workspace/decisions.md' || normalized === 'workspace/lesson-candidates.md') return false;
  if (normalized === 'workspace/current.md') return true;
  if (normalized === 'workspace/last-check.md' || normalized === 'workspace/review.md') return true;
  if (normalized === 'workspace/breadcrumb.md') return false;
  if (normalized === 'backlog/backlog.md') return false;
  if (normalized === 'docs.md') return false;
  if (normalized.startsWith('archive/')) return false;
  if (normalized.startsWith('rules/')) return true;
  if (!hasPreferredRules && (normalized === 'spec/style.md' || normalized === 'spec/architecture.md')) return true;
  if (normalized.startsWith('tasks/current/') && /\/?(spec|plan)\.md$/.test(normalized)) return true;

  return false;
}

function compactFirstLine(value: string, fallback: string): string {
  const line = value
    .replace(/^---[\s\S]*?---\s*\n?/, '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('#') && !item.startsWith('|') && !item.startsWith('>'));
  return (line || fallback).replace(/\s+/g, ' ').slice(0, 180);
}

export function buildProjectDocumentEntry(input: DocumentIndexBuildInput): ProjectDocumentIndexEntry {
  const normalizedPath = normalizeDocPath(input.path);
  const kind = inferDocumentKind(normalizedPath);
  const scope = inferDocumentScope(normalizedPath);
  const taskId = extractTaskIdFromDocPath(normalizedPath, input.currentTaskId);
  const title = input.title || basename(normalizedPath, extname(normalizedPath));
  const summary = input.summary || compactFirstLine(input.content, title);
  const archive = isArchiveDocPath(normalizedPath);
  const generatedView = isGeneratedViewDocPath(normalizedPath);
  const metadata = parseFrontmatterMetadata(input.content);

  return {
    path: normalizedPath,
    type: kind,
    kind,
    scope,
    level: inferDocumentLevel(normalizedPath),
    title,
    summary,
    updated_at: input.mtime.toISOString(),
    lastModified: input.mtime.toISOString().split('T')[0],
    size: input.size,
    token_estimate: estimateTokens(input.content),
    default_read: shouldDefaultReadDocPath(normalizedPath, input.currentTaskId, input.hasPreferredRules),
    archive,
    generated_view: generatedView,
    index_only: generatedView,
    task_id: taskId,
    status: metadata.status || (archive ? 'deprecated' : 'active'),
    deprecated_by: metadata.deprecated_by,
    topic_tags: inferTopicTags({ path: normalizedPath, title, summary, kind, scope, taskId }),
    content_terms: archive ? [] : inferContentTerms(input.content),
    related: metadata.related,
  };
}

export function normalizeProjectDocumentEntry(
  raw: Partial<ProjectDocumentIndexEntry> & { path: string },
  currentTaskId?: string,
  hasPreferredRules = false,
): ProjectDocumentIndexEntry {
  const normalizedPath = normalizeDocPath(raw.path);
  const kind = raw.kind || raw.type || inferDocumentKind(normalizedPath);
  const scope = raw.scope || inferDocumentScope(normalizedPath);
  const taskId = raw.task_id || extractTaskIdFromDocPath(normalizedPath, currentTaskId);
  const title = raw.title || basename(normalizedPath, extname(normalizedPath));
  const summary = raw.summary || title;
  const size = typeof raw.size === 'number' ? raw.size : 0;
  const generatedView = typeof raw.generated_view === 'boolean'
    ? raw.generated_view
    : isGeneratedViewDocPath(normalizedPath);
  const indexOnly = typeof raw.index_only === 'boolean'
    ? raw.index_only
    : generatedView;
  const tokenEstimate = typeof raw.token_estimate === 'number'
    ? raw.token_estimate
    : estimateTokens(summary || '') + estimateTokensFromBytes(size);
  const archive = typeof raw.archive === 'boolean' ? raw.archive : isArchiveDocPath(normalizedPath);

  return {
    path: normalizedPath,
    type: raw.type || kind,
    kind,
    scope,
    level: raw.level || inferDocumentLevel(normalizedPath),
    title,
    summary,
    updated_at: raw.updated_at || '',
    lastModified: raw.lastModified,
    size,
    token_estimate: tokenEstimate,
    default_read: typeof raw.default_read === 'boolean'
      ? raw.default_read
      : shouldDefaultReadDocPath(normalizedPath, currentTaskId, hasPreferredRules),
    archive,
    generated_view: generatedView,
    index_only: indexOnly,
    stale: raw.stale,
    task_id: taskId,
    status: raw.status || (archive ? 'deprecated' : 'active'),
    deprecated_by: raw.deprecated_by,
    topic_tags: Array.isArray(raw.topic_tags) && raw.topic_tags.length > 0
      ? raw.topic_tags
      : inferTopicTags({ path: normalizedPath, title, summary, kind, scope, taskId }),
    content_terms: Array.isArray(raw.content_terms) ? raw.content_terms.filter((term) => typeof term === 'string') : [],
    related: Array.isArray(raw.related) ? raw.related.filter((item): item is string => typeof item === 'string') : [],
    backlinks: Array.isArray(raw.backlinks) ? raw.backlinks.filter((item): item is string => typeof item === 'string') : [],
  };
}

export async function readProjectDocumentIndex(
  docpathDir: string,
  currentTaskId?: string,
  hasPreferredRules = existsSync(join(docpathDir, 'rules')),
): Promise<ProjectDocumentIndex | null> {
  const indexPath = join(docpathDir, 'docs-index.json');
  if (!existsSync(indexPath)) return null;

  const parsed = JSON.parse(await readFile(indexPath, 'utf-8')) as Partial<ProjectDocumentIndex>;
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return {
    version: parsed.version || PROJECT_DOCS_INDEX_VERSION,
    generated_at: parsed.generated_at || '',
    entries: rawEntries
      .filter((entry): entry is ProjectDocumentIndexEntry => !!entry && typeof entry.path === 'string')
      .map((entry) => normalizeProjectDocumentEntry(entry, currentTaskId, hasPreferredRules))
      .filter((entry) => entry.stale !== true),
  };
}

export function validateTaskId(taskId: string | undefined): void {
  if (!taskId) return;
  if (!/^T-[A-Za-z0-9._-]+$/.test(taskId)) {
    throw new Error(`非法 task_id: ${taskId}`);
  }
}

export function matchesDocumentSelection(entry: ProjectDocumentIndexEntry, options: DocumentSelectionOptions): boolean {
  const topic = options.topic?.trim();
  const taskId = options.taskId?.trim();
  const hasExplicitSelection = !!topic || !!taskId;
  const taskMatched = !!taskId && entry.task_id === taskId;
  
  // 使用同义词扩展进行主题匹配
  let topicMatched = false;
  if (topic) {
    // 将用户输入扩展为同义词集合
    const synonymSet = normalizeTopic(topic);
    
    // 构建文档的可搜索文本（小写）
    const searchableText = [
      entry.path,
      entry.type,
      entry.kind,
      entry.scope,
      entry.title,
      entry.summary,
      entry.task_id || '',
      ...entry.topic_tags,
      ...(entry.content_terms || []),
    ].join(' ').toLowerCase();
    
    // 检查任意一个同义词是否匹配
    topicMatched = synonymSet.some(synonym => searchableText.includes(synonym.toLowerCase()));
  }

  if (taskMatched || topicMatched) return true;
  if (hasExplicitSelection) return false;
  if (entry.archive && !options.includeArchive) return false;
  if (options.includeArchive) return true;
  return entry.default_read;
}

export function shouldReadDocumentBody(entry: ProjectDocumentIndexEntry, options: DocumentSelectionOptions): boolean {
  const explicitSelection = !!options.topic?.trim() || !!options.taskId?.trim() || !!options.includeArchive;
  if (!explicitSelection) return false;
  if (isIndexOnlyDocument(entry) && !options.includeArchive) return false;
  if (normalizeDocPath(entry.path) === 'docs.md') return false;
  return matchesDocumentSelection(entry, options);
}

export function documentPriority(entry: ProjectDocumentIndexEntry): number {
  let score = 0;
  const path = normalizeDocPath(entry.path);
  const level = parseInt(entry.level || '3', 10);

  if (entry.default_read) score += 120;
  if (entry.scope === 'task') score += 100;
  if (path.includes('tasks/current/')) score += 90;
  if (path === 'docs/README.md' || path === 'README.md') score += 85;
  if (path === 'workspace/current.md') score += 80;
  if (entry.task_id && path.includes(`tasks/${entry.task_id}/`)) score += 75;
  if (path.startsWith('docs/architecture/') || path.startsWith('docs/features/') || path.startsWith('docs/workflows/') || path.startsWith('docs/design/')) score += 75;
  if (path.startsWith('docs/')) score += 70;
  if (path === 'workspace/breadcrumb.md') score += 70;
  if (path === 'workspace/last-check.md') score += 60;
  if (path.includes('rules/style.md') || path.includes('rules/architecture.md')) score += 55;
  if (path.includes('spec/style.md') || path.includes('spec/architecture.md')) score += 50;
  if (path.startsWith('backlog/analysis/')) score -= 20;
  if (path.startsWith('backlog/archived/')) score -= 40;
  if (entry.archive) score -= 120;
  if (isIndexOnlyDocument(entry)) score -= 90;
  if (entry.token_estimate > DEFAULT_CONTEXT_TOKEN_BUDGET) score -= 35;
  if (entry.kind === 'template') score -= 80;
  if (!Number.isNaN(level)) score += Math.max(0, 10 - level);

  return score;
}

export function sortDocumentEntries(entries: ProjectDocumentIndexEntry[]): ProjectDocumentIndexEntry[] {
  return [...entries].sort((a, b) => {
    const score = documentPriority(b) - documentPriority(a);
    return score === 0 ? a.path.localeCompare(b.path) : score;
  });
}

export function documentIndexStats(entries: ProjectDocumentIndexEntry[], options: DocumentSelectionOptions = {}): DocumentIndexStats {
  const selected = entries.filter((entry) => matchesDocumentSelection(entry, options));
  const selectedIndexOnly = selected.filter(isIndexOnlyDocument);
  const selectedBudgeted = selected.filter((entry) => !isIndexOnlyDocument(entry));
  const defaultRead = entries.filter((entry) => entry.default_read);
  const archive = entries.filter((entry) => entry.archive);
  return {
    total: entries.length,
    defaultRead: defaultRead.length,
    archive: archive.length,
    selected: selected.length,
    estimatedTokens: entries.reduce((sum, entry) => sum + entry.token_estimate, 0),
    defaultReadTokens: defaultRead.reduce((sum, entry) => sum + entry.token_estimate, 0),
    selectedTokens: selectedBudgeted.reduce((sum, entry) => sum + entry.token_estimate, 0),
    archiveTokens: archive.reduce((sum, entry) => sum + entry.token_estimate, 0),
    selectedIndexOnly: selectedIndexOnly.length,
    selectedIndexOnlyTokens: selectedIndexOnly.reduce((sum, entry) => sum + entry.token_estimate, 0),
  };
}

export function resolveDocpathDocumentPath(docpathDir: string, entryPath: string): string | null {
  const normalized = normalizeDocPath(entryPath);
  if (!normalized || normalized.includes('\0') || normalized.startsWith('../') || normalized.includes('/../')) return null;

  const base = resolve(docpathDir);
  const full = resolve(base, normalized);
  if (full !== base && !full.startsWith(`${base}${sep}`)) return null;
  return full;
}

async function collectMarkdownFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = normalizeDocPath(fullPath.slice(baseDir.length + 1));
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (isProjectDocumentScanExcludedPath(relativePath)) continue;
      results.push(...await collectMarkdownFiles(fullPath, baseDir));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.md') {
      if (isProjectDocumentScanExcludedPath(relativePath)) continue;
      results.push(relativePath);
    }
  }
  return results;
}

export async function isProjectDocumentIndexStale(
  docpathDir: string,
  entries: ProjectDocumentIndexEntry[],
  currentTaskId?: string,
): Promise<boolean> {
  const entriesMap = new Map<string, number>();
  for (const entry of entries) {
    entriesMap.set(entry.path, entry.size);
  }

  const files = await collectMarkdownFiles(docpathDir, docpathDir);
  for (const file of files) {
    if (isGeneratedViewDocPath(file)) continue;
    if (file.startsWith('tasks/current/')) continue;
    if (file.startsWith('tasks/promote-backups/')) continue;
    if (currentTaskId && file.startsWith(`tasks/${currentTaskId}/`)) continue;

    const recordedSize = entriesMap.get(file);
    if (recordedSize === undefined) {
      return true;
    }

    const fileStat = await stat(join(docpathDir, file));
    if (fileStat.size !== recordedSize) {
      return true;
    }
  }
  return false;
}

/** 从 markdown 中提取标题 */
function extractTitleFromContent(filePath: string, content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/);
    if (match) return match[1].trim();
  }
  return basename(filePath, extname(filePath));
}

/** 从 markdown 中提取简短摘要 */
function extractSummaryFromContent(filePath: string, content: string): string {
  const lines = content
    .replace(/^---[\s\S]*?---\s*\n?/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('>'));
  return (lines[0] || basename(filePath, extname(filePath))).replace(/\s+/g, ' ').slice(0, 180);
}

/** 递归扫描目录 */
export async function scanDirectory(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = normalizeDocPath(relative(baseDir, fullPath));

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        if (isProjectDocumentScanExcludedPath(relativePath)) continue;
        const subResults = await scanDirectory(fullPath, baseDir);
        results.push(...subResults);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        if (isProjectDocumentScanExcludedPath(relativePath)) continue;
        results.push(relativePath);
      }
    }
  } catch {
    /* ignore permission errors */
  }
  return results;
}

export interface ExternalDocFile {
  abs: string;
  rel: string;
}

export async function collectExternalDocFiles(
  docpathDir: string,
  declaredPaths: string[],
  internalPaths: ReadonlySet<string>,
): Promise<ExternalDocFile[]> {
  const projectRoot = dirname(resolve(docpathDir));
  const docpathAbs = resolve(docpathDir);
  const results: ExternalDocFile[] = [];
  const seen = new Set<string>();

  const relOf = (abs: string): string => normalizeDocPath(relative(projectRoot, abs));

  const pushFile = (abs: string): void => {
    if (extname(abs) !== '.md') return;
    if (isExcludedForScan(projectRoot, abs, basename(abs), false)) return;
    const rel = relOf(abs);
    if (internalPaths.has(rel) || seen.has(rel)) return;
    seen.add(rel);
    results.push({ abs, rel });
  };

  const walkDir = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (resolve(abs) === docpathAbs) continue;
        if (isExcludedForScan(projectRoot, abs, entry.name, true)) continue;
        await walkDir(abs);
      } else if (entry.isFile()) {
        pushFile(abs);
      }
    }
  };

  for (const declared of declaredPaths) {
    const abs = resolve(projectRoot, declared);
    if (abs === docpathAbs || abs.startsWith(`${docpathAbs}${sep}`)) continue;
    if (abs !== projectRoot && !abs.startsWith(`${projectRoot}${sep}`)) continue;

    let info;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }
    if (info.isFile()) {
      pushFile(abs);
    } else if (info.isDirectory()) {
      if (abs !== projectRoot && isExcludedForScan(projectRoot, abs, basename(abs), true)) continue;
      await walkDir(abs);
    }
  }

  return results;
}

async function readCurrentTaskId(docpathDir: string): Promise<string | undefined> {
  try {
    const state = JSON.parse(await readFile(join(docpathDir, 'workspace', 'state.json'), 'utf-8')) as { task_id?: string };
    return state.task_id || undefined;
  } catch {
    return undefined;
  }
}

async function buildDocEntries(
  docpathDir: string,
  mdFiles: string[],
  externalFiles: ExternalDocFile[] = [],
): Promise<ProjectDocumentIndexEntry[]> {
  const entries: ProjectDocumentIndexEntry[] = [];
  const currentTaskId = await readCurrentTaskId(docpathDir);
  const hasPreferredRules = existsSync(join(docpathDir, 'rules'));
  const now = Date.now();

  const pushEntry = async (fullPath: string, relPath: string): Promise<void> => {
    const fileStat = await stat(fullPath);
    const content = await readFile(fullPath, 'utf-8');
    const entry = buildProjectDocumentEntry({
      path: relPath,
      size: fileStat.size,
      mtime: fileStat.mtime,
      content,
      title: extractTitleFromContent(fullPath, content),
      summary: extractSummaryFromContent(fullPath, content),
      currentTaskId,
      hasPreferredRules,
    });

    if (entry.archive && isArchiveDocumentExpired(relPath, fileStat.mtime, now)) {
      return;
    }

    entries.push(entry);
  };

  const GENERATED_ARTIFACTS = new Set(['docs.md', 'docs-index.json']);
  for (const file of mdFiles) {
    if (GENERATED_ARTIFACTS.has(file)) continue;
    await pushEntry(join(docpathDir, file), file);
  }
  for (const external of externalFiles) {
    await pushEntry(external.abs, external.rel);
  }

  return entries;
}

function compactIndexEntry(entry: ProjectDocumentIndexEntry): Record<string, unknown> {
  const isArchive = entry.archive === true;
  const compact: Record<string, unknown> = {
    path: entry.path,
    type: entry.type,
    scope: entry.scope,
    level: entry.level,
    title: entry.title,
    ...(isArchive ? {} : { summary: entry.summary.slice(0, 140) }),
    updated_at: entry.updated_at,
    size: entry.size,
    token_estimate: entry.token_estimate,
    default_read: entry.default_read,
    archive: entry.archive,
  };

  if (entry.task_id) compact.task_id = entry.task_id;
  if (!isArchive && entry.content_terms && entry.content_terms.length > 0) {
    compact.content_terms = entry.content_terms.slice(0, 16);
  }
  // docs graph（version 2）：related/backlinks 仅在非空时落盘，避免全量空数组膨胀索引
  if (Array.isArray(entry.related) && entry.related.length > 0) {
    compact.related = entry.related;
  }
  if (Array.isArray(entry.backlinks) && entry.backlinks.length > 0) {
    compact.backlinks = entry.backlinks;
  }
  if (entry.generated_view === true) compact.generated_view = true;
  if (entry.index_only === true) compact.index_only = true;
  if (entry.stale === true) compact.stale = true;

  return compact;
}

async function writeDocsIndexes(docpathDir: string, entries: ProjectDocumentIndexEntry[]): Promise<string> {
  const docsIndexPath = join(docpathDir, 'docs-index.json');
  // backlinks 是跨条目聚合视图，落盘前按 related 全图反推（仅索引层存在，绝不回写文档文件）
  const graph = buildDocGraph(entries);
  const compactEntries = entries.map((entry) => {
    const node = graph.byPath.get(entry.path);
    if (!node) return compactIndexEntry(entry);
    return compactIndexEntry({ ...entry, backlinks: [...node.backlinks] });
  });
  await writeFile(
    docsIndexPath,
    `${JSON.stringify({
      version: PROJECT_DOCS_INDEX_VERSION,
      generated_at: new Date().toISOString(),
      policy: {
        mode: 'index-first',
        default_context_token_budget: 15000,
        archive_body_requires: ['--topic', '--task-id', '--include-archive'],
        archive_retention_days: ARCHIVE_RETENTION_DAYS,
      },
      entries: compactEntries,
    })}\n`,
    'utf-8',
  );
  return docsIndexPath;
}

export async function refreshProjectDocumentIndex(
  docpathDir: string,
  cwd: string = dirname(resolve(docpathDir)),
): Promise<{ entries: ProjectDocumentIndexEntry[]; docsIndexPath: string; externalCount: number; declaredExternal: boolean }> {
  const mdFiles = await scanDirectory(docpathDir, docpathDir);
  const declaredPaths = await readDeclaredDocumentScanPaths(cwd);
  const externalFiles = declaredPaths
    ? await collectExternalDocFiles(docpathDir, declaredPaths, new Set(mdFiles))
    : [];

  if (mdFiles.length === 0 && externalFiles.length === 0) {
    return {
      entries: [],
      docsIndexPath: join(docpathDir, 'docs-index.json'),
      externalCount: 0,
      declaredExternal: !!declaredPaths,
    };
  }

  const entries = await buildDocEntries(docpathDir, mdFiles, externalFiles);
  const docsIndexPath = await writeDocsIndexes(docpathDir, entries);
  return {
    entries,
    docsIndexPath,
    externalCount: externalFiles.length,
    declaredExternal: !!declaredPaths,
  };
}

