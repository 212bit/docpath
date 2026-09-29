/**
 * docpath:docs — 文档资产管理
 *
 * 扫描 .docpath/ 目录下的 .md 文件，生成 docs-index.json 索引。
 * 人类可读索引见 INDEX.md (静态,手工维护)。
 */

import { existsSync } from 'fs';
import { readFile, readdir, writeFile, stat } from 'fs/promises';
import { join, relative, extname, basename, dirname, resolve, sep } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { readDeclaredDocumentScanPaths } from '../utils/config.js';
import { isExcludedForScan } from '../utils/scan-existing-tree.js';
import {
  ARCHIVE_RETENTION_DAYS,
  DOC_GRAPH_HIGH_CONFIDENCE_SCORE,
  DOC_GRAPH_MIN_REPORT_SCORE,
  PROJECT_DOCS_INDEX_VERSION,
  buildDocGraph,
  buildProjectDocumentEntry,
  documentIndexStats,
  findOrphanDocPaths,
  isArchiveDocumentExpired,
  isIndexOnlyDocument,
  isProjectDocumentScanExcludedPath,
  normalizeDocPath,
  readProjectDocumentIndex,
  recommendRelatedDocs,
  refreshProjectDocumentIndex,
  sortDocumentEntries,
  toDocsRelatedDeclaredValue,
  upsertFrontmatterRelated,
  type DocGraph,
  type DocGraphNode,
  type ProjectDocumentIndexEntry,
} from '../utils/document-index.js';

export { refreshProjectDocumentIndex };
import {
  diagnoseDocumentHealth,
  fixDocumentHealth,
  renderDocHealthTable,
  type DocHealthReport,
  type DocFixResult,
} from '../utils/docs-doctor.js';

export interface DocsOptions {
  cwd: string;
  /** 子命令：scan | list | add | lint | search | doctor | fix | graph */
  action?: string;
  /** add/search 命令的参数 */
  args?: string[];
  /** list: print the full generated docs.md table */
  full?: boolean;
  /** search/find 关键词 */
  query?: string;
  /** Agent 模式输出结构化 YAML */
  agent?: boolean;
  /** 预览模式 */
  dryRun?: boolean;
  /** JSON 格式输出 */
  json?: boolean;
  /** graph: 半自动修复模式（写入高置信度唯一候选 + 重建 README 机器区） */
  graphFix?: boolean;
  /** graph: 输出 mermaid 全景关联图 */
  mermaid?: boolean;
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

/** 外部扫描收集到的文件（abs 用于读盘，rel 为项目根相对的索引路径） */
interface ExternalDocFile {
  abs: string;
  rel: string;
}

/**
 * FR-5/§4.d：按 document_scan_paths 声明收集 .docpath/ 之外的 .md 文件。
 *
 * - 项目根 = docpathDir 的父目录（linked 模式下即目标项目根）。
 * - noise 排除复用 scan-existing 的 §4.d 语义（.gitignore + 硬黑名单），
 *   声明的根路径自身也受排除约束（显式声明 node_modules/ 也不放行）。
 * - 只进声明路径，不递归未声明目录；`.docpath/` 及其内部由内部扫描覆盖，跳过。
 * - 越出项目根的声明（../ 等）拒绝；不存在的声明路径静默跳过（默认三路径
 *   中 README.md/docs/ 可缺）。
 * - 与内部扫描路径同名（normalize 后）的外部文件跳过，内部优先，避免
 *   docs-index 重复路径与 body 解析歧义。
 */
async function collectExternalDocFiles(
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
    let entries: import('node:fs').Dirent[];
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
    // R-335 FR-3: 不渲染扫描时间戳 —— 同状态重扫描必须字节一致（幂等），
    // 否则并发 worktree 各自刷新后合并必冲突；时间真源在 docs-index.json generated_at。
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

/** docs scan — 扫描文档生成索引 */
async function docsScan(cwd: string): Promise<void> {
  const docpathDir = await ensureDocpathDir(cwd);

  console.log('\n🔍  扫描文档...\n');

  const { entries, docsIndexPath, externalCount, declaredExternal } = await refreshProjectDocumentIndex(docpathDir, cwd);

  if (entries.length === 0) {
    console.log('📭  未找到任何 .md 文件');
    return;
  }

  console.log(`✅  已生成 docs-index.json (${entries.length} 个文档)`);
  if (declaredExternal) {
    console.log(`📎  外部文档: ${externalCount} 个（document_scan_paths 声明路径，§4.d 去噪）`);
  }
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

/** docs list — 列出注册文档摘要，--full 输出完整 human table（R-336: 从索引渲染，docs.md 已下线） */
async function docsList(cwd: string, full = false): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const index = await readProjectDocumentIndex(docpathDir);

  if (!index?.entries.length) {
    console.error('❌  未找到 docs-index.json 或索引为空。请先运行 `docpath docs scan`');
    process.exit(1);
  }

  if (!full) {
    console.log(renderCompactDocsList(index.entries));
    return;
  }

  console.log(generateDocsMd(index.entries as ProjectDocumentIndexEntry[]));
}

/** docs add — 添加文档到索引（R-336: 纯索引操作；旧实现只写 docs.md 表格行，会被下次 scan 冲掉） */
async function docsAdd(cwd: string, args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('❌  用法: docpath docs add <path> <kind> [scope] [level]');
    console.error('   示例: docpath docs add spec/api.md reference backend 2');
    process.exit(1);
  }

  const [docPath, kind, scope = 'project', level = '0'] = args;

  const docpathDir = await resolveDocpathDir(cwd);
  const docsIndexPath = join(docpathDir, 'docs-index.json');
  if (!existsSync(docsIndexPath)) {
    console.error('❌  未找到 docs-index.json。请先运行 `docpath docs scan`');
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(docsIndexPath, 'utf-8')) as {
    version: number;
    generated_at: string;
    policy: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  };

  const normalizedPath = docPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (raw.entries.some((entry) => entry.path === normalizedPath)) {
    console.log(`ℹ️  已存在索引条目: ${normalizedPath}（如需刷新请重跑 docpath docs scan）`);
    return;
  }

  const absPath = join(docpathDir, normalizedPath);
  let size = 0;
  let updated = new Date().toISOString();
  try {
    const fileStat = await stat(absPath);
    size = fileStat.size;
    updated = fileStat.mtime.toISOString();
  } catch {
    // 文件不存在也允许登记（占位条目，scan 会校正）
  }

  raw.entries.push({
    path: normalizedPath,
    type: kind,
    scope,
    level: Number.parseInt(level, 10) || 0,
    title: basename(docPath, extname(docPath)),
    summary: '',
    updated_at: updated,
    size,
    token_estimate: 0,
    default_read: false,
    archive: false,
  });
  raw.generated_at = new Date().toISOString();

  await writeFile(docsIndexPath, `${JSON.stringify(raw)}\n`, 'utf-8');

  console.log(`\n✅  已添加文档到索引: ${normalizedPath}`);
  console.log(`   kind: ${kind}, scope: ${scope}, level: ${level}\n`);
}

/**
 * 确保索引处于图谱就绪状态（version 2 且含 related/backlinks）。
 * 缺失或 version < 2 时自动刷新一次（一次性迁移，向后兼容 v1 读取）。
 */
async function ensureGraphReadyIndex(cwd: string): Promise<{ docpathDir: string; entries: ProjectDocumentIndexEntry[] } | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  let index = await readProjectDocumentIndex(docpathDir);
  if (!index || index.version < PROJECT_DOCS_INDEX_VERSION) {
    await refreshProjectDocumentIndex(docpathDir, cwd);
    index = await readProjectDocumentIndex(docpathDir);
  }
  if (!index?.entries.length) return null;
  return { docpathDir, entries: index.entries };
}

/** docs lint / doctor — 巡检文档健康度：检查死链、空文件、缺少标题与索引对齐（+ docs graph 孤立规则） */
async function docsDoctor(cwd: string, agent = false, json = false): Promise<void> {
  const report = await diagnoseDocumentHealth(cwd);

  // 孤立文档规则（孤立 = 无出链且无入链，error 级报告项）：
  // 并入 docs lint 规则集输出；仅单向一条不算孤立，不告警。
  const graphContext = await ensureGraphReadyIndex(cwd);
  const orphanPaths = graphContext ? findOrphanDocPaths(graphContext.entries) : [];

  if (json) {
    console.log(JSON.stringify({ ...report, orphan_docs: orphanPaths }, null, 2));
    return;
  }

  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'docs_doctor',
        healthy: report.healthy,
        scanned_count: report.scannedCount,
        indexed_count: report.indexedCount,
        orphan_count: orphanPaths.length,
        orphan_docs: orphanPaths,
        stats: report.stats,
        issues: report.issues.map((i) => ({
          file: i.file,
          type: i.type,
          message: i.message,
          auto_fixable: i.autoFixable,
          fix_detail: i.fixDetail,
        })),
      }),
    );
    return;
  }

  console.log(renderDocHealthTable(report));

  if (orphanPaths.length > 0) {
    console.log('🕸️  孤立文档检测 (docs graph 规则: 孤立 = 无出链且无入链):');
    for (const path of orphanPaths) {
      console.log(`    ⚠️  孤立文档: ${path}`);
    }
    console.log('    💡 运行 `docpath docs graph` 查看推荐关联，`docpath docs graph --fix` 半自动修复。\n');
  }
}

/** docs fix — 一键自愈修复活文档问题 */
async function docsFix(
  cwd: string,
  options: { dryRun?: boolean; agent?: boolean; json?: boolean } = {},
): Promise<void> {
  const { dryRun = false, agent = false, json = false } = options;
  const fixResult = await fixDocumentHealth(cwd, { dryRun });

  if (json) {
    console.log(JSON.stringify(fixResult, null, 2));
    return;
  }

  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'docs_fix',
        dry_run: dryRun,
        fixed_count: fixResult.fixedCount,
        healed_headings: fixResult.healedHeadings,
        repaired_links: fixResult.repairedLinks,
        refreshed_index: fixResult.refreshedIndex,
        cleaned_empty_docs: fixResult.cleanedEmptyDocs,
        remaining_issues_count: fixResult.remainingIssues.length,
      }),
    );
    return;
  }

  if (dryRun) {
    console.log('\n🧹  [dry-run] 活文档自愈修复预览:');
    console.log(`    - 拟修复一级标题 (# H1): ${fixResult.healedHeadings.length} 个文件`);
    for (const h of fixResult.healedHeadings) console.log(`      + ${h}`);
    console.log(`    - 拟修复死链重定向: ${fixResult.repairedLinks.length} 处`);
    for (const r of fixResult.repairedLinks) console.log(`      + ${r.file}: [${r.from}] -> [${r.to}]`);
    console.log(`    - 拟初始化空白文档: ${fixResult.cleanedEmptyDocs.length} 个`);
    for (const c of fixResult.cleanedEmptyDocs) console.log(`      + ${c}`);
    console.log(`    - 拟刷新文档索引: ${fixResult.refreshedIndex ? '是' : '否'}`);
    console.log('\n[dry-run] 预览结束，未修改任何文件。运行 `docpath docs fix` 执行实际修复。\n');
    return;
  }

  console.log('\n✨  活文档自愈修复完成！');
  console.log(`    - 修复/补齐 H1 标题: ${fixResult.healedHeadings.length} 个文档`);
  console.log(`    - 修复/重定向死链: ${fixResult.repairedLinks.length} 处`);
  console.log(`    - 补充空白文档脚手架: ${fixResult.cleanedEmptyDocs.length} 个`);
  console.log(`    - 活文档索引 (docs-index.json): ${fixResult.refreshedIndex ? '已全量同步' : '已是最新'}`);
  if (fixResult.remainingIssues.length > 0) {
    console.log(`\n⚠️  尚有 ${fixResult.remainingIssues.length} 个需要手动确认的问题（运行 docpath docs doctor 查看明细）。\n`);
  } else {
    console.log('\n🎉  全部活文档已恢复 100% 健康规范状态！\n');
  }
}

/** docs search — 根据关键词或同义词快速检索文档条目 */
async function docsSearch(cwd: string, query: string, agent = false): Promise<void> {
  const { normalizeTopic } = await import('../utils/topic-synonyms.js');
  const docpathDir = await resolveDocpathDir(cwd);
  const index = await readProjectDocumentIndex(docpathDir);

  if (!index?.entries.length) {
    if (agent) {
      const { stringify } = await import('yaml');
      console.log(stringify({ agent_view: 'docs_search', query, results_count: 0, results: [] }));
    } else {
      console.error('❌  未找到 docs-index.json 或索引为空。请先运行 `docpath docs scan`');
    }
    return;
  }

  const trimmed = query.trim();
  if (!trimmed) {
    console.log('ℹ️  请输入检索关键词: docpath docs search <keyword>');
    return;
  }

  const synonyms = normalizeTopic(trimmed);
  const matched = index.entries.filter((entry) => {
    const text = `${entry.path} ${entry.title} ${entry.summary} ${entry.topic_tags?.join(' ') || ''} ${(entry.content_terms || []).join(' ')}`.toLowerCase();
    return synonyms.some((syn) => text.includes(syn));
  });

  const sorted = sortDocumentEntries(matched as ProjectDocumentIndexEntry[]);

  if (agent) {
    const { stringify } = await import('yaml');
    console.log(stringify({
      agent_view: 'docs_search',
      query: trimmed,
      synonyms,
      results_count: sorted.length,
      results: sorted.slice(0, 10).map((e) => ({
        path: e.path,
        title: e.title,
        summary: e.summary,
        type: e.type,
        scope: e.scope,
        level: e.level,
        token_estimate: e.token_estimate,
        default_read: e.default_read,
        archive: e.archive,
      })),
    }));
    return;
  }

  console.log(`\n🔍  文档检索: "${trimmed}" (匹配 ${sorted.length} 个文档)\n`);
  if (sorted.length === 0) {
    console.log('   未找到匹配的文档条目。可尝试更换关键词或运行 docpath docs scan 刷新索引。\n');
    return;
  }

  for (const entry of sorted.slice(0, 10)) {
    const flags = [
      entry.default_read ? 'default' : '',
      entry.archive ? 'archive' : '',
      entry.task_id ? `task:${entry.task_id}` : '',
    ].filter(Boolean).join(', ') || 'indexed';
    console.log(`  📄 ${entry.path} [${flags}] (~${entry.token_estimate} tokens)`);
    console.log(`     ${entry.title} — ${entry.summary || '无摘要'}\n`);
  }
}

/* ------------------------------------------------------------------ */
/* docs graph — 文档关联图谱：报告 / 半自动修复 / mermaid 全景图        */
/* ------------------------------------------------------------------ */

/** 转义 mermaid 双引号标签中的特殊字符 */
function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, '/').replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' ').trim();
}

/** 渲染合法 mermaid graph：节点全量声明 + related 有向边（A --> B） */
export function renderGraphMermaid(graph: DocGraph): string {
  const lines: string[] = ['graph TD'];
  const ids = new Map<string, string>();
  graph.nodes.forEach((node, index) => {
    const id = `n${index}`;
    ids.set(node.path, id);
    lines.push(`  ${id}["${escapeMermaidLabel(node.path)}"]`);
  });
  for (const node of graph.nodes) {
    for (const target of node.related) {
      const targetId = ids.get(target);
      if (!targetId) continue;
      lines.push(`  ${ids.get(node.path)} --> ${targetId}`);
    }
  }
  return lines.join('\n');
}

/** 按目录分类渲染 docs-index 机器区（docs/README.md 的 docpath:block，块外手工内容不动） */
export function renderDocsIndexBlock(graph: DocGraph): string {
  const groups = new Map<string, DocGraphNode[]>();
  for (const node of graph.nodes) {
    const dir = node.path === 'docs/README.md' || !node.path.slice('docs/'.length).includes('/')
      ? 'docs/'
      : `docs/${node.path.slice('docs/'.length).split('/')[0]}/`;
    const bucket = groups.get(dir) || [];
    bucket.push(node);
    groups.set(dir, bucket);
  }

  const lines: string[] = [
    '<!-- docpath:block docs-index -->',
    '<!-- 由 `docpath docs graph --fix` 自动生成；块外内容手工维护，请勿编辑本机器区 -->',
    '',
    '## 文档关联图谱 (docs graph)',
    '',
    `> 全部 ${graph.nodes.length} 篇文档，按目录分类；出/入为 docs graph 关联计数。孤立 = 无出链且无入链。`,
    '',
  ];

  for (const dir of Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))) {
    lines.push(`### ${dir}`);
    lines.push('');
    for (const node of groups.get(dir)!) {
      const flags = [
        node.orphan ? '⚠️ 孤立' : '',
        `出 ${node.related.length}`,
        `入 ${node.backlinks.length}`,
      ].filter(Boolean).join(' / ');
      const relLink = `./${node.path.replace(/^docs\//, '')}`;
      lines.push(`- [${node.path}](${relLink}) — ${node.title} — ${flags}`);
    }
    lines.push('');
  }

  lines.push('<!-- /docpath:block -->');
  return lines.join('\n');
}

/** 重建 docs/README.md 的 docpath:block docs-index 机器区；块外内容逐字节保留 */
async function rebuildDocsIndexBlock(
  docpathDir: string,
  graph: DocGraph,
): Promise<{ updated: boolean; readmePath: string }> {
  const readmePath = join(dirname(resolve(docpathDir)), 'docs', 'README.md');
  const blockStart = '<!-- docpath:block docs-index -->';
  const blockEnd = '<!-- /docpath:block -->';
  const block = renderDocsIndexBlock(graph);

  if (!existsSync(readmePath)) {
    await writeFile(readmePath, `${block}\n`, 'utf-8');
    return { updated: true, readmePath };
  }

  const content = await readFile(readmePath, 'utf-8');
  const start = content.indexOf(blockStart);
  const end = start === -1 ? -1 : content.indexOf(blockEnd, start);
  let next: string;
  if (start !== -1 && end !== -1) {
    next = content.slice(0, start) + block + content.slice(end + blockEnd.length);
  } else {
    // 块外内容逐字节保留：仅在文档缺尾部换行时补接缝，其余原样追加
    const seam = content.endsWith('\n') ? '' : '\n\n';
    next = content + seam + block + '\n';
  }
  const updated = next !== content;
  if (updated) {
    await writeFile(readmePath, next, 'utf-8');
  }
  return { updated, readmePath };
}

/** docs graph — 报告孤立清单 + 每篇出入链 + 推荐候选（带分数） */
async function docsGraph(
  cwd: string,
  options: { graphFix?: boolean; mermaid?: boolean } = {},
): Promise<void> {
  const { graphFix = false, mermaid = false } = options;
  const ready = await ensureGraphReadyIndex(cwd);
  if (!ready) {
    console.error('❌  未找到 docs-index.json 或索引为空。请先运行 `docpath docs scan`');
    process.exit(1);
  }
  const { docpathDir, entries } = ready;
  const projectRoot = dirname(resolve(docpathDir));

  const graph = buildDocGraph(entries);
  const recommendations = recommendRelatedDocs(entries, { minScore: DOC_GRAPH_MIN_REPORT_SCORE });

  if (mermaid) {
    console.log(renderGraphMermaid(graph));
    return;
  }

  const orphans = graph.nodes.filter((node) => node.orphan);

  if (!graphFix) {
    const totalOut = graph.nodes.reduce((sum, node) => sum + node.related.length, 0);
    const totalIn = graph.nodes.reduce((sum, node) => sum + node.backlinks.length, 0);
    console.log('\n🕸️  文档关联图谱报告 (docs graph)');
    console.log(`    节点: ${graph.nodes.length} | 出链: ${totalOut} | 入链: ${totalIn} | 孤立: ${orphans.length}`);
    console.log('');

    if (orphans.length > 0) {
      console.log('  ⚠️  孤立文档 (无出链且无入链):');
      for (const node of orphans) console.log(`    - ${node.path}`);
      console.log('');
    }

    console.log('  🔗 关联明细 (出 → related / 入 ← backlinks):');
    for (const node of graph.nodes) {
      const flags = node.orphan ? ' [孤立]' : '';
      console.log(`    - ${node.path}${flags}`);
      console.log(`        出 ${node.related.length}: ${node.related.join(', ') || '—'}`);
      console.log(`        入 ${node.backlinks.length}: ${node.backlinks.join(', ') || '—'}`);
    }
    console.log('');

    console.log(`  💡 推荐候选 (content_terms Jaccard + 标题词重叠, 0..1):`);
    let recommended = 0;
    for (const node of graph.nodes) {
      const candidates = recommendations.get(node.path) || [];
      if (candidates.length === 0) continue;
      recommended++;
      console.log(`    - ${node.path}`);
      for (const candidate of candidates) {
        const highConfidence = candidate.score >= DOC_GRAPH_HIGH_CONFIDENCE_SCORE;
        console.log(`        → ${candidate.path} (score ${candidate.score.toFixed(2)})${highConfidence ? ' ✓高置信' : ''}`);
      }
    }
    if (recommended === 0) console.log('    - 无候选（可调阈值常量 DOC_GRAPH_HIGH_CONFIDENCE_SCORE）');
    console.log('');
    return;
  }

  // ---- docs graph --fix: 半自动修复 ----
  const highConfidenceThreshold = DOC_GRAPH_HIGH_CONFIDENCE_SCORE;
  const writtenLinks: Array<{ file: string; added: string[] }> = [];
  const ambiguous: Array<{ file: string; candidates: Array<{ path: string; score: number }> }> = [];
  const noCandidate: string[] = [];

  for (const node of graph.nodes) {
    const candidates = (recommendations.get(node.path) || []).filter((item) => item.score >= highConfidenceThreshold);
    if (candidates.length === 0) {
      const anyCandidate = (recommendations.get(node.path) || []).length > 0;
      if (anyCandidate) noCandidate.push(node.path);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ file: node.path, candidates });
      continue;
    }
    // 高置信度唯一候选 → 自动写入该文档 frontmatter related（原文声明相对 docs/）
    const target = candidates[0];
    const absPath = join(projectRoot, node.path);
    if (!existsSync(absPath)) continue;
    const content = await readFile(absPath, 'utf-8');
    const { content: nextContent, added } = upsertFrontmatterRelated(content, [
      toDocsRelatedDeclaredValue(target.path),
    ]);
    if (added.length === 0) continue;
    await writeFile(absPath, nextContent, 'utf-8');
    writtenLinks.push({ file: node.path, added: added.map((item) => `docs/${item}`) });
  }

  // 写入 related 后刷新索引，使 README 机器区基于最新图谱
  await refreshProjectDocumentIndex(docpathDir, cwd);
  const refreshed = await readProjectDocumentIndex(docpathDir);
  const freshGraph = buildDocGraph(refreshed?.entries || []);

  // 重建 docs/README.md 机器区（块外内容逐字节保留）
  await rebuildDocsIndexBlock(docpathDir, freshGraph);
  // README 自身体积变化后再同步一次索引，保证 size/updated_at 一致
  await refreshProjectDocumentIndex(docpathDir, cwd);

  const remaining = recommendRelatedDocs(refreshed?.entries || [], { minScore: DOC_GRAPH_MIN_REPORT_SCORE });

  console.log('\n🛠️  docs graph --fix 完成');
  console.log(`    - 高置信度唯一候选写入 frontmatter related: ${writtenLinks.length} 篇`);
  for (const item of writtenLinks) {
    console.log(`      + ${item.file} → ${item.added.join(', ')}`);
  }
  console.log(`    - docs/README.md 机器区 (docpath:block docs-index): 已重建`);

  const remainingList: string[] = [];
  for (const node of freshGraph.nodes) {
    const candidates = remaining.get(node.path) || [];
    if (candidates.length === 0) continue;
    remainingList.push(node.path);
    console.log(`    - 低置信度候选 (需人工决策): ${node.path}`);
    for (const candidate of candidates) {
      const highConfidence = candidate.score >= highConfidenceThreshold;
      console.log(`        → ${candidate.path} (score ${candidate.score.toFixed(2)})${highConfidence ? ' (多候选未自动写入)' : ''}`);
    }
  }
  if (remainingList.length === 0 && ambiguous.length === 0) {
    console.log('    - 无剩余低置信度候选');
  }
  console.log('');
}

async function docsSync(cwd: string, agent: boolean, json: boolean): Promise<void> {
  console.log('🔄  文档资产全量同步与自愈...\n');
  await docsFix(cwd, { dryRun: false, agent, json });
  await docsScan(cwd);
  console.log('✅  文档索引已刷新并完成自愈！\n');
}

/** 主命令入口 */
export async function docsCommand(options: DocsOptions): Promise<void> {
  const { cwd, action, args = [], full = false, query, agent = false, dryRun = false, json = false, graphFix = false, mermaid = false } = options;

  switch (action) {
    case 'scan':
      await docsScan(cwd);
      break;
    case 'sync':
      await docsSync(cwd, agent, json);
      break;
    case 'list':
      await docsList(cwd, full);
      break;
    case 'add':
      await docsAdd(cwd, args);
      break;
    case 'lint':
    case 'doctor':
    case 'check':
      await docsDoctor(cwd, agent, json);
      break;
    case 'fix':
    case 'repair':
      await docsFix(cwd, { dryRun, agent, json });
      break;
    case 'graph':
      await docsGraph(cwd, { graphFix, mermaid });
      break;
    case 'search':
    case 'find':
    case 'query':
      await docsSearch(cwd, args.join(' ') || query || '', agent);
      break;
    default:
      // 默认执行 scan
      await docsScan(cwd);
  }
}
