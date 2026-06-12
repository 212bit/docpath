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
  PROJECT_DOCS_INDEX_VERSION,
  buildProjectDocumentEntry,
  type ProjectDocumentIndexEntry,
} from '../utils/document-index.js';

interface DocsOptions {
  cwd: string;
  /** 子命令：scan | list | add */
  action?: string;
  /** add 命令的参数 */
  args?: string[];
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

      if (entry.isDirectory()) {
        // 跳过 node_modules 和隐藏目录
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const subResults = await scanDirectory(fullPath, baseDir);
        results.push(...subResults);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        results.push(relative(baseDir, fullPath));
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
    '| 路径 | type | scope | level | default_read | archive | tokens | task_id | 标题 | 摘要 | 更新时间 | 大小 |',
    '|------|------|-------|-------|--------------|---------|--------|---------|------|------|----------|------|',
  ];

  for (const entry of entries) {
    lines.push(
      `| ${entry.path} | ${entry.type} | ${entry.scope} | ${entry.level} | ${entry.default_read} | ${entry.archive} | ${entry.token_estimate} | ${entry.task_id || ''} | ${entry.title} | ${entry.summary} | ${entry.updated_at} | ${formatSize(entry.size)} |`
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

  for (const file of mdFiles) {
    const fullPath = join(docpathDir, file);
    const fileStat = await stat(fullPath);
    const content = await readFile(fullPath, 'utf-8');
    entries.push(buildProjectDocumentEntry({
      path: file,
      size: fileStat.size,
      mtime: fileStat.mtime,
      content,
      title: extractTitleFromContent(fullPath, content),
      summary: extractSummaryFromContent(fullPath, content),
      currentTaskId,
      hasPreferredRules,
    }));
  }

  return entries;
}

async function writeDocsIndexes(docpathDir: string, entries: ProjectDocumentIndexEntry[]): Promise<string> {
  const docsIndexPath = join(docpathDir, 'docs-index.json');

  // 不再生成 docs.md (已替换为静态 INDEX.md)
  await writeFile(docsIndexPath, JSON.stringify({
    version: PROJECT_DOCS_INDEX_VERSION,
    generated_at: new Date().toISOString(),
    policy: {
      mode: 'index-first',
      default_context_token_budget: 15000,
      archive_body_requires: ['--topic', '--task-id', '--include-archive'],
    },
    entries,
  }, null, 2), 'utf-8');

  return docsIndexPath;
}

/** docs scan — 扫描文档生成索引 */
async function docsScan(cwd: string): Promise<void> {
  const docpathDir = await ensureDocpathDir(cwd);

  console.log('\n🔍  扫描文档...\n');

  const mdFiles = await scanDirectory(docpathDir, docpathDir);

  if (mdFiles.length === 0) {
    console.log('📭  未找到任何 .md 文件');
    return;
  }

  const entries = await buildDocEntries(docpathDir, mdFiles);
  const docsIndexPath = await writeDocsIndexes(docpathDir, entries);

  console.log(`✅  已生成 docs-index.json (${entries.length} 个文档)`);
  console.log(`📁  位置: ${docsIndexPath}`);
  console.log('');
}

/** docs list — 列出所有注册文档 */
async function docsList(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const docsMdPath = join(docpathDir, 'docs.md');

  if (!existsSync(docsMdPath)) {
    console.error('❌  未找到 docs.md。请先运行 `docpath docs scan`');
    process.exit(1);
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

  const newLine = `| ${docPath} | ${kind} | ${scope} | ${level} | false | false | 0 |  | ${basename(docPath, extname(docPath))} | - | ${formatDate(new Date())} | - |`;

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
  const { cwd, action, args = [] } = options;

  switch (action) {
    case 'scan':
      await docsScan(cwd);
      break;
    case 'list':
      await docsList(cwd);
      break;
    case 'add':
      await docsAdd(cwd, args);
      break;
    default:
      // 默认执行 scan
      await docsScan(cwd);
  }
}
