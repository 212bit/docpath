/**
 * docpath:docs — 文档资产管理
 *
 * 扫描 .docpath/ 目录下的 .md 文件，生成 docs-index.json 索引。
 * 人类可读索引见 INDEX.md (静态,手工维护)。
 */

import { existsSync } from 'fs';
import { readFile, readdir, writeFile, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  ARCHIVE_RETENTION_DAYS,
  PROJECT_DOCS_INDEX_VERSION,
  buildProjectDocumentEntry,
  documentIndexStats,
  isArchiveDocumentExpired,
  isIndexOnlyDocument,
  isProjectDocumentScanExcludedPath,
  normalizeDocPath,
  readProjectDocumentIndex,
  sortDocumentEntries,
  type ProjectDocumentIndexEntry,
} from '../utils/document-index.js';

interface DocsOptions {
  cwd: string;
  /** 子命令：scan | list | add */
  action?: string;
  /** add 命令的参数 */
  args?: string[];
  /** list: print the full generated docs.md table */
  full?: boolean;
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
async function scanDirectory(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = normalizeDocPath(relative(baseDir, fullPath));

      if (entry.isDirectory()) {
        // 跳过 node_modules 和隐藏目录
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        if (isProjectDocumentScanExcludedPath(relativePath)) continue;
        const subResults = await scanDirectory(fullPath, baseDir);
        results.push(...subResults);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        if (isProjectDocumentScanExcludedPath(relativePath)) continue;
        results.push(relativePath);
      }
    }
  } catch { /* ignore permission errors */ }

  return results;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 格式化日期 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** 生成 docs.md 内容 */
function generateDocsMd(entries: ProjectDocumentIndexEntry[]): string {
  const lines: string[] = [
    '# DocPath 文档索引',
    '',
    '> 自动生成。默认请先读本索引；正文按 `default_read`、当前任务、topic/task-id 或显式归档展开读取。',
    '',
    `> 扫描时间: ${new Date().toISOString()}`,
    '',
    '## 文档列表',
    '',
    '| 路径 | type | scope | level | default_read | archive | stale | tokens | task_id | 标题 | 摘要 | 更新时间 | 大小 |',
    '|------|------|-------|-------|--------------|---------|-------|--------|---------|------|------|----------|------|',
  ];

  for (const entry of entries) {
    lines.push(
      `| ${entry.path} | ${entry.type} | ${entry.scope} | ${entry.level} | ${entry.default_read} | ${entry.archive} | ${entry.stale === true} | ${entry.token_estimate} | ${entry.task_id || ''} | ${entry.title} | ${entry.summary} | ${entry.updated_at} | ${formatSize(entry.size)} |`
    );
  }

  lines.push('');
  lines.push('## 用途说明');
  lines.push('');
  lines.push('- **type**: 文档类型 (reference|runbook|template|index|log)');
  lines.push('- **scope**: 作用域 (project|task|backend|frontend|infra|shared)');
  lines.push('- **level**: 渐进式披露层级 (0|1|2|3)');
  lines.push('- **default_read**: 默认上下文允许读取的高信号文档；归档、模板、大日志默认 false');
  lines.push('- **archive**: 历史归档或大日志，只应通过 topic/task-id/include-archive 按需展开');
  lines.push(`- **stale**: 兼容字段；新 scan 会物理排除超过 ${ARCHIVE_RETENTION_DAYS} 天的 archive 条目`);
  lines.push('- **tokens**: 粗略 token 估算，用于预算门禁和上下文裁剪');
  lines.push('- **title**: 文档标题或用途');
  lines.push('- **summary**: 文档首段摘要');
  lines.push('');

  return lines.join('\n');
}

async function ensureDocpathDir(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  return docpathDir;
}

async function readCurrentTaskId(docpathDir: string): Promise<string | undefined> {
  try {
    const state = JSON.parse(await readFile(join(docpathDir, 'workspace', 'state.json'), 'utf-8')) as { task_id?: string };
    return state.task_id || undefined;
  } catch {
    return undefined;
  }
}

async function buildDocEntries(docpathDir: string, mdFiles: string[]): Promise<ProjectDocumentIndexEntry[]> {
  const entries: ProjectDocumentIndexEntry[] = [];
  const currentTaskId = await readCurrentTaskId(docpathDir);
  const hasPreferredRules = existsSync(join(docpathDir, 'rules'));
  const now = Date.now();

  for (const file of mdFiles) {
    const fullPath = join(docpathDir, file);
    const fileStat = await stat(fullPath);
    const content = await readFile(fullPath, 'utf-8');
    const entry = buildProjectDocumentEntry({
      path: file,
      size: fileStat.size,
      mtime: fileStat.mtime,
      content,
      title: extractTitleFromContent(fullPath, content),
      summary: extractSummaryFromContent(fullPath, content),
      currentTaskId,
      hasPreferredRules,
    });

    if (entry.archive && isArchiveDocumentExpired(fileStat.mtime, now)) {
      continue;
    }

    entries.push(entry);
  }

  return entries;
}

async function writeDocsIndexes(docpathDir: string, entries: ProjectDocumentIndexEntry[]): Promise<string> {
  const docsIndexPath = join(docpathDir, 'docs-index.json');
  const docsMdPath = join(docpathDir, 'docs.md');

  const compactEntries = entries.map(compactIndexEntry);
  await writeFile(docsIndexPath, `${JSON.stringify({
    version: PROJECT_DOCS_INDEX_VERSION,
    generated_at: new Date().toISOString(),
    policy: {
      mode: 'index-first',
      default_context_token_budget: 15000,
      archive_body_requires: ['--topic', '--task-id', '--include-archive'],
      archive_retention_days: ARCHIVE_RETENTION_DAYS,
    },
    entries: compactEntries,
  })}\n`, 'utf-8');
  // 保留 docs.md 作为人类可读兼容索引；机器读取以 docs-index.json 为准。
  await writeFile(docsMdPath, generateDocsMd(entries), 'utf-8');

  return docsIndexPath;
}

function compactIndexEntry(entry: ProjectDocumentIndexEntry): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    path: entry.path,
    type: entry.type,
    scope: entry.scope,
    level: entry.level,
    title: entry.title,
    summary: entry.summary.slice(0, 140),
    updated_at: entry.updated_at,
    size: entry.size,
    token_estimate: entry.token_estimate,
    default_read: entry.default_read,
    archive: entry.archive,
  };

  if (entry.task_id) compact.task_id = entry.task_id;
  if (entry.generated_view === true) compact.generated_view = true;
  if (entry.index_only === true) compact.index_only = true;
  if (entry.stale === true) compact.stale = true;

  return compact;
}

export async function refreshProjectDocumentIndex(docpathDir: string): Promise<{ entries: ProjectDocumentIndexEntry[]; docsIndexPath: string }> {
  const mdFiles = await scanDirectory(docpathDir, docpathDir);

  if (mdFiles.length === 0) {
    return { entries: [], docsIndexPath: join(docpathDir, 'docs-index.json') };
  }

  const entries = await buildDocEntries(docpathDir, mdFiles);
  const docsIndexPath = await writeDocsIndexes(docpathDir, entries);
  return { entries, docsIndexPath };
}

/** docs scan — 扫描文档生成索引 */
async function docsScan(cwd: string): Promise<void> {
  const docpathDir = await ensureDocpathDir(cwd);

  console.log('\n🔍  扫描文档...\n');

  const { entries, docsIndexPath } = await refreshProjectDocumentIndex(docpathDir);

  if (entries.length === 0) {
    console.log('📭  未找到任何 .md 文件');
    return;
  }

  console.log(`✅  已生成 docs-index.json (${entries.length} 个文档)`);
  console.log(`📁  位置: ${docsIndexPath}`);
  console.log('');
}

function renderCompactDocsList(entries: ProjectDocumentIndexEntry[]): string {
  const stats = documentIndexStats(entries);
  const indexOnlyCount = entries.filter(isIndexOnlyDocument).length;
  const highSignal = sortDocumentEntries(entries)
    .filter((entry) => !isIndexOnlyDocument(entry))
    .slice(0, 12);
  const lines: string[] = [
    '',
    '📚  DocPath 文档索引摘要',
    '',
    `  total_docs: ${stats.total}`,
    `  default_read_docs: ${stats.defaultRead} (~${stats.defaultReadTokens} tokens)`,
    `  archive_docs: ${stats.archive}`,
    `  generated_or_index_only_docs: ${indexOnlyCount}`,
    '',
    '  高信号条目:',
  ];

  for (const entry of highSignal) {
    const flags = [
      entry.default_read ? 'default' : '',
      entry.archive ? 'archive' : '',
      entry.task_id ? `task:${entry.task_id}` : '',
    ].filter(Boolean).join(', ') || 'indexed';
    lines.push(`    - ${entry.path} [${flags}] ~${entry.token_estimate} tokens — ${entry.summary || entry.title}`);
  }

  if (highSignal.length === 0) lines.push('    - 无');
  lines.push('');
  lines.push('  完整表格: docpath docs list --full');
  lines.push('');
  return lines.join('\n');
}

/** docs list — 列出注册文档摘要，--full 输出完整 human table */
async function docsList(cwd: string, full = false): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const docsMdPath = join(docpathDir, 'docs.md');

  if (!existsSync(docsMdPath)) {
    console.error('❌  未找到 docs.md。请先运行 `docpath docs scan`');
    process.exit(1);
  }

  if (!full) {
    const index = await readProjectDocumentIndex(docpathDir);
    if (index?.entries.length) {
      console.log(renderCompactDocsList(index.entries));
      return;
    }
  }

  const content = await readFile(docsMdPath, 'utf-8');
  console.log(content);
}

/** docs add — 添加文档到索引 */
async function docsAdd(cwd: string, args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('❌  用法: docpath docs add <path> <kind> [scope] [level]');
    console.error('   示例: docpath docs add spec/api.md reference backend 2');
    process.exit(1);
  }

  const [docPath, kind, scope = 'project', level = '0'] = args;

  const docpathDir = await resolveDocpathDir(cwd);
  const docsMdPath = join(docpathDir, 'docs.md');

  if (!existsSync(docsMdPath)) {
    console.error('❌  未找到 docs.md。请先运行 `docpath docs scan`');
    process.exit(1);
  }

  // 读取现有内容
  const content = await readFile(docsMdPath, 'utf-8');

  // 添加新行到表格
  const lines = content.split('\n');
  const tableEnd = lines.findIndex((line, i) => i > 5 && !line.startsWith('|'));

  const newLine = `| ${docPath} | ${kind} | ${scope} | ${level} | false | false | false | 0 |  | ${basename(docPath, extname(docPath))} | - | ${formatDate(new Date())} | - |`;

  if (tableEnd > 0) {
    lines.splice(tableEnd, 0, newLine);
  } else {
    lines.push(newLine);
  }

  await writeFile(docsMdPath, lines.join('\n'), 'utf-8');

  console.log(`\n✅  已添加文档: ${docPath}`);
  console.log(`   kind: ${kind}, scope: ${scope}, level: ${level}\n`);
}

/** 主命令入口 */
export async function docsCommand(options: DocsOptions): Promise<void> {
  const { cwd, action, args = [], full = false } = options;

  switch (action) {
    case 'scan':
      await docsScan(cwd);
      break;
    case 'list':
      await docsList(cwd, full);
      break;
    case 'add':
      await docsAdd(cwd, args);
      break;
    default:
      // 默认执行 scan
      await docsScan(cwd);
  }
}
