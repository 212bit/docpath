/**
 * docpath:docs — 文档资产管理
 *
 * 扫描 .docpath/ 目录下的 .md 文件，生成 docs.md 索引。
 * AI 可直接读写 docs.md，无需接触 YAML。
 */

import { existsSync } from 'fs';
import { readFile, readdir, writeFile, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { resolveDocpathDir } from '../utils/file.js';

interface DocsOptions {
  cwd: string;
  /** 子命令：scan | list | add */
  action?: string;
  /** add 命令的参数 */
  args?: string[];
}

/** 文档条目 */
interface DocEntry {
  path: string;
  type: string;
  kind: string;
  scope: string;
  level: string;
  title: string;
  summary: string;
  updated_at: string;
  lastModified: string;
  size: number;
}

/** 根据文件路径推断 kind */
function inferKind(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.startsWith('spec/') || normalized.includes('/spec/')) return 'reference';
  if (normalized.startsWith('tasks/') || normalized.includes('/tasks/')) return 'runbook';
  if (normalized.startsWith('workspace/') || normalized.includes('/workspace/')) return 'index';
  if (normalized.startsWith('journal/') || normalized.includes('/journal/')) return 'log';
  if (normalized.startsWith('templates/') || normalized.includes('/templates/')) return 'template';

  // 根据文件名推断
  const name = basename(filePath).toLowerCase();
  if (name === 'current.md') return 'runbook';
  if (name === 'breadcrumb.md') return 'log';
  if (name === 'style.md') return 'reference';
  if (name === 'config.yaml') return 'reference';

  return 'index';
}

/** 根据文件路径推断 scope */
function inferScope(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.startsWith('spec/backend/') || normalized.includes('/spec/backend/')) return 'backend';
  if (normalized.startsWith('spec/frontend/') || normalized.includes('/spec/frontend/')) return 'frontend';
  if (normalized.startsWith('spec/infra/') || normalized.includes('/spec/infra/')) return 'infra';
  if (normalized.startsWith('spec/shared/') || normalized.includes('/spec/shared/')) return 'shared';
  if (normalized.startsWith('tasks/current/') || normalized.includes('/tasks/current/')) return 'task';
  if (/^tasks\/T-[^/]+\//.test(normalized) || /\/tasks\/T-[^/]+\//.test(normalized)) return 'task';

  return 'project';
}

/** 根据文件路径推断 level */
function inferLevel(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  // 任务级文档默认 level 1
  if (normalized.startsWith('tasks/') || normalized.includes('/tasks/')) return '1';

  // 规范文档默认 level 2
  if (normalized.startsWith('spec/') || normalized.includes('/spec/')) return '2';

  // 工作区文档默认 level 0
  if (normalized.startsWith('workspace/') || normalized.includes('/workspace/')) return '0';

  return '0';
}

/** 从 markdown 中提取标题 */
async function extractTitle(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // 查找第一个 # 标题
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)/);
      if (match) return match[1].trim();
    }

    // 没有标题，使用文件名
    return basename(filePath, extname(filePath));
  } catch {
    return basename(filePath, extname(filePath));
  }
}

/** 从 markdown 中提取简短摘要 */
async function extractSummary(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content
      .replace(/^---[\s\S]*?---\s*\n?/, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('>'));
    return (lines[0] || basename(filePath, extname(filePath))).replace(/\s+/g, ' ').slice(0, 180);
  } catch {
    return basename(filePath, extname(filePath));
  }
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
function generateDocsMd(entries: DocEntry[]): string {
  const lines: string[] = [
    '# DocPath 文档索引',
    '',
    '> 自动生成，AI 可直接读写',
    '',
    `> 扫描时间: ${new Date().toISOString()}`,
    '',
    '## 文档列表',
    '',
    '| 路径 | type | scope | level | 标题 | 摘要 | 更新时间 | 大小 |',
    '|------|------|-------|-------|------|----------|------|',
  ];

  for (const entry of entries) {
    lines.push(
      `| ${entry.path} | ${entry.type} | ${entry.scope} | ${entry.level} | ${entry.title} | ${entry.summary} | ${entry.updated_at} | ${entry.size} |`
    );
  }

  lines.push('');
  lines.push('## 用途说明');
  lines.push('');
  lines.push('- **type**: 文档类型 (reference|runbook|template|index|log)');
  lines.push('- **scope**: 作用域 (project|task|backend|frontend|infra|shared)');
  lines.push('- **level**: 渐进式披露层级 (0|1|2|3)');
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

async function buildDocEntries(docpathDir: string, mdFiles: string[]): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];

  for (const file of mdFiles) {
    const fullPath = join(docpathDir, file);
    const fileStat = await stat(fullPath);
    const kind = inferKind(file);
    const updated = fileStat.mtime.toISOString();
    entries.push({
      path: file,
      type: kind,
      kind,
      scope: inferScope(file),
      level: inferLevel(file),
      title: await extractTitle(fullPath),
      summary: await extractSummary(fullPath),
      updated_at: updated,
      lastModified: formatDate(fileStat.mtime),
      size: fileStat.size,
    });
  }

  return entries;
}

async function writeDocsIndexes(docpathDir: string, entries: DocEntry[]): Promise<string> {
  const docsMdPath = join(docpathDir, 'docs.md');
  const docsIndexPath = join(docpathDir, 'docs-index.json');

  await writeFile(docsMdPath, generateDocsMd(entries), 'utf-8');
  await writeFile(docsIndexPath, JSON.stringify({ generated_at: new Date().toISOString(), entries }, null, 2), 'utf-8');

  return docsMdPath;
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
  const docsMdPath = await writeDocsIndexes(docpathDir, entries);

  console.log(`✅  已生成 docs.md / docs-index.json (${entries.length} 个文档)`);
  console.log(`📁  位置: ${docsMdPath}`);
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

  const newLine = `| ${docPath} | ${kind} | ${scope} | ${level} | ${basename(docPath, extname(docPath))} | ${formatDate(new Date())} | - |`;

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
