import { existsSync, type Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

export const PROJECT_DOCS_INDEX_VERSION = 1;
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 15000;
export const ARCHIVE_RETENTION_DAYS = 180;
export const ARCHIVE_RETENTION_MS = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const PROJECT_DOCS_SCAN_EXCLUDED_DIRS = [
  'workspace/commands',
  'workspace/bin',
  'workspace/leases',
  'workspace/sessions',
];

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
  topic_tags: string[];
}

export interface ProjectDocumentIndex {
  version: number;
  generated_at: string;
  entries: ProjectDocumentIndexEntry[];
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
    || normalized === 'workspace/decisions.md'
    || normalized === 'workspace/check-history.md';
}

export function isArchiveDocumentExpired(mtime: Date, now = Date.now()): boolean {
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
    topic_tags: inferTopicTags({ path: normalizedPath, title, summary, kind, scope, taskId }),
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
    archive: typeof raw.archive === 'boolean' ? raw.archive : isArchiveDocPath(normalizedPath),
    generated_view: generatedView,
    index_only: indexOnly,
    stale: raw.stale,
    task_id: taskId,
    topic_tags: Array.isArray(raw.topic_tags) && raw.topic_tags.length > 0
      ? raw.topic_tags
      : inferTopicTags({ path: normalizedPath, title, summary, kind, scope, taskId }),
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
  const topic = options.topic?.trim().toLowerCase();
  const taskId = options.taskId?.trim();
  const hasExplicitSelection = !!topic || !!taskId;
  const taskMatched = !!taskId && entry.task_id === taskId;
  const topicMatched = !!topic && [
    entry.path,
    entry.type,
    entry.kind,
    entry.scope,
    entry.title,
    entry.summary,
    entry.task_id || '',
    ...entry.topic_tags,
  ].join(' ').toLowerCase().includes(topic);

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
  if (entry.task_id && path.includes(`tasks/${entry.task_id}/`)) score += 75;
  if (path === 'workspace/current.md') score += 80;
  if (path === 'workspace/breadcrumb.md') score += 70;
  if (path === 'workspace/last-check.md') score += 60;
  if (path.includes('rules/style.md') || path.includes('rules/architecture.md')) score += 55;
  if (path.includes('spec/style.md') || path.includes('spec/architecture.md')) score += 50;
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

export async function isProjectDocumentIndexStale(docpathDir: string, generatedAt: string | undefined): Promise<boolean> {
  if (!generatedAt) return true;
  const generatedTime = Date.parse(generatedAt);
  if (Number.isNaN(generatedTime)) return true;

  const files = await collectMarkdownFiles(docpathDir, docpathDir);
  for (const file of files) {
    if (isGeneratedViewDocPath(file)) continue;
    const fileStat = await stat(join(docpathDir, file));
    if (fileStat.mtime.getTime() > generatedTime + 1000) return true;
  }
  return false;
}
