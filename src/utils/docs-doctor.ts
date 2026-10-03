/**
 * 活文档全景体检与自愈修复引擎 (Living Docs Doctor & Self-Healing Engine)
 *
 * 针对 Markdown 文档生态进行深度巡检：
 * 1. 死链检测与智能重定向/自愈 (Broken links resolution)
 * 2. 未索引文档自动捕获与 docs-index.json 索引同步
 * 3. 缺失一级标题 (# Title) 自动提炼与修复
 * 4. 空文档/无效占位符检测与清理
 * 5. 废弃或过时索引条目自动对齐
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, rm, rename, mkdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename, dirname, resolve, isAbsolute } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveDocpathDir, readFileSafe, writeFileAtomic } from './file.js';
import {
  readProjectDocumentIndex,
  normalizeDocPath,
  refreshProjectDocumentIndex,
  parseFrontmatterMetadata,
  inferDocumentTier,
  buildDocGraph,
  isDocsGraphNodePath,
  type DocLifecycleStatus,
  type ProjectDocumentIndexEntry,
} from './document-index.js';

import { COMMAND_METADATA } from './command-metadata.js';

export type DocIssueType =
  | 'broken-link'
  | 'deprecated-reference'
  | 'code-drift'
  | 'symbol-drift'
  | 'command-drift'
  | 'stale-unreviewed'
  | 'archive-candidate'
  | 'empty-doc'
  | 'missing-heading'
  | 'missing-frontmatter'
  | 'invalid-frontmatter'
  | 'unindexed'
  | 'stale-index'
  | 'stale-archive'
  | 'backlog-misplaced'
  | 'broken-evidence';

export interface DocIssue {
  file: string;
  absPath: string;
  type: DocIssueType;
  message: string;
  autoFixable: boolean;
  fixDetail?: string;
  linkData?: {
    originalText: string;
    originalTarget: string;
    suggestedTarget?: string;
  };
}

export interface DocHealthReport {
  scannedCount: number;
  indexedCount: number;
  healthy: boolean;
  issues: DocIssue[];
  stats: {
    brokenLinks: number;
    deprecatedReferences: number;
    codeDrift: number;
    symbolDrift: number;
    commandDrift: number;
    staleUnreviewed: number;
    archiveCandidates: number;
    unindexed: number;
    missingHeadings: number;
    emptyDocs: number;
    staleIndex: number;
    backlogIssues: number;
    frontmatterIssues: number;
    lifecycle: {
      active: number;
      wip: number;
      deprecated: number;
    };
  };
}

/** 计算两个字符串的 Levenshtein 相似度 (0 ~ 1) */
export function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 0.95;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  const maxLen = Math.max(len1, len2);
  const dist = matrix[len1][len2];
  return 1 - dist / maxLen;
}

/** 从源码文件中提取 export 导出的符号集合 */
export function extractExportedSymbols(code: string): Set<string> {
  const symbols = new Set<string>();
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // export function foo / export async function foo
    const fnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
    if (fnMatch) {
      symbols.add(fnMatch[1]);
      continue;
    }
    // export class Foo / export abstract class Foo / export default class Foo
    const classMatch = trimmed.match(/^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (classMatch) {
      symbols.add(classMatch[1]);
      continue;
    }
    // export interface Foo
    const ifaceMatch = trimmed.match(/^export\s+interface\s+([a-zA-Z0-9_$]+)/);
    if (ifaceMatch) {
      symbols.add(ifaceMatch[1]);
      continue;
    }
    // export type Foo
    const typeMatch = trimmed.match(/^export\s+type\s+([a-zA-Z0-9_$]+)/);
    if (typeMatch) {
      symbols.add(typeMatch[1]);
      continue;
    }
    // export const / let / var foo =
    const varMatch = trimmed.match(/^export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/);
    if (varMatch) {
      symbols.add(varMatch[1]);
      continue;
    }
    // export { a, b as c }
    const blockMatch = trimmed.match(/^export\s+\{([^}]+)\}/);
    if (blockMatch) {
      const items = blockMatch[1].split(',');
      for (const item of items) {
        const parts = item.trim().split(/\s+as\s+/);
        const exportedName = (parts[1] || parts[0]).trim();
        if (exportedName && /^[a-zA-Z0-9_$]+$/.test(exportedName)) {
          symbols.add(exportedName);
        }
      }
    }
  }
  return symbols;
}

export interface DocFixResult {
  fixedCount: number;
  healedHeadings: string[];
  healedFrontmatters: string[];
  repairedLinks: Array<{ file: string; from: string; to: string }>;
  refreshedIndex: boolean;
  cleanedEmptyDocs: string[];
  remainingIssues: DocIssue[];
}

/**
 * 递归收集目录下的所有 .md 文件
 */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          const sub = await collectMarkdownFiles(full);
          results.push(...sub);
        }
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        results.push(full);
      }
    }
  } catch {
    // 忽略权限错误
  }

  return results;
}

/**
 * 递归收集源码与测试文件
 */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          const sub = await collectSourceFiles(full);
          results.push(...sub);
        }
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  } catch {
    // 忽略权限错误
  }

  return results;
}

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function getStagedFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git diff --cached --name-only', { cwd });
    return stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 诊断活文档全景健康度
 */
export async function diagnoseDocumentHealth(
  cwd: string,
  options: { stagedOnly?: boolean; targetFiles?: string[] } = {},
): Promise<DocHealthReport> {
  const { stagedOnly = false, targetFiles } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const projectRoot = dirname(resolve(docpathDir));

  const issues: DocIssue[] = [];
  const scannedFiles: Array<{ abs: string; rel: string }> = [];

  const allMarkdownAbsPaths = new Set<string>();

  if (stagedOnly) {
    const rawStaged = targetFiles || (await getStagedFiles(projectRoot));
    for (const relPath of rawStaged) {
      if (relPath.endsWith('.md')) {
        const abs = resolve(projectRoot, relPath);
        if (existsSync(abs)) {
          allMarkdownAbsPaths.add(abs);
        }
      }
    }

    // 暂存区无 markdown 文件时，极速放行 (< 20ms)
    if (allMarkdownAbsPaths.size === 0) {
      return {
        scannedCount: 0,
        indexedCount: 0,
        healthy: true,
        issues: [],
        stats: {
          brokenLinks: 0,
          deprecatedReferences: 0,
          codeDrift: 0,
          symbolDrift: 0,
          commandDrift: 0,
          staleUnreviewed: 0,
          archiveCandidates: 0,
          unindexed: 0,
          missingHeadings: 0,
          emptyDocs: 0,
          staleIndex: 0,
          backlogIssues: 0,
          frontmatterIssues: 0,
          lifecycle: { active: 0, wip: 0, deprecated: 0 },
        },
      };
    }
  } else {
    // 1. 扫描 docs/, .docpath/rules/, 根目录 README.md 以及 config 声明路径
    const scanDirs = [
      join(projectRoot, 'docs'),
      join(docpathDir, 'rules'),
    ];

    for (const dir of scanDirs) {
      const files = await collectMarkdownFiles(dir);
      for (const f of files) allMarkdownAbsPaths.add(f);
    }

    const rootReadme = join(projectRoot, 'README.md');
    if (existsSync(rootReadme)) {
      allMarkdownAbsPaths.add(rootReadme);
    }
  }

  // 收集源码文件全集用于代码引用漂移检测
  const sourceDirs = ['src', 'tests', 'lib', 'pkg', 'cmd'].map((d) => join(projectRoot, d));
  const allSourceAbsPaths: string[] = [];
  for (const d of sourceDirs) {
    const sFiles = await collectSourceFiles(d);
    allSourceAbsPaths.push(...sFiles);
  }

  const allSourceFilesBaseMap = new Map<string, string>(); // basename -> absPath
  const sourceFileExportsMap = new Map<string, Set<string>>(); // absPath -> Set<exportedSymbols>

  for (const sAbs of allSourceAbsPaths) {
    allSourceFilesBaseMap.set(basename(sAbs).toLowerCase(), sAbs);
    try {
      const code = await readFileSafe(sAbs);
      if (code) {
        const syms = extractExportedSymbols(code);
        if (syms.size > 0) {
          sourceFileExportsMap.set(sAbs, syms);
        }
      }
    } catch {
      // 容错
    }
  }

  // 收集可用于死链重定向匹配的目标全集
  const taskDoneFiles = await collectMarkdownFiles(join(docpathDir, 'tasks', 'done'));
  const allKnownMarkdown = new Set([...allMarkdownAbsPaths, ...taskDoneFiles]);

  const allFilesBaseMap = new Map<string, string>(); // basename -> absPath
  const allFilesMetaMap = new Map<string, { status: DocLifecycleStatus; deprecatedBy?: string; tier?: string; is_core?: boolean; level?: string }>();

  for (const abs of allKnownMarkdown) {
    const bName = basename(abs).toLowerCase();
    allFilesBaseMap.set(bName, abs);
    try {
      const content = await readFileSafe(abs);
      if (content) {
        const meta = parseFrontmatterMetadata(content);
        const isArchive = abs.includes('/tasks/done/') || abs.includes('/archive/');
        const status: DocLifecycleStatus = meta.status || (isArchive ? 'deprecated' : 'active');
        allFilesMetaMap.set(abs, {
          status,
          deprecatedBy: meta.deprecated_by,
          tier: meta.tier,
          is_core: meta.is_core,
          level: meta.level,
        });
      }
    } catch {
      // 容错
    }
  }

  let activeDocsCount = 0;
  let wipDocsCount = 0;
  let deprecatedDocsCount = 0;

  // 2. 逐一检查每个文件内容
  for (const abs of allMarkdownAbsPaths) {
    const rel = normalizeDocPath(relative(projectRoot, abs));
    scannedFiles.push({ abs, rel });
    const selfMeta = allFilesMetaMap.get(abs) || { status: 'active' };

    if (selfMeta.status === 'active') activeDocsCount++;
    else if (selfMeta.status === 'wip') wipDocsCount++;
    else if (selfMeta.status === 'deprecated') deprecatedDocsCount++;

    try {
      const content = await readFile(abs, 'utf-8');
      const trimmed = content.trim();

      // 空文档检查
      if (trimmed.length === 0) {
        issues.push({
          file: rel,
          absPath: abs,
          type: 'empty-doc',
          message: '文档内容为空',
          autoFixable: true,
          fixDetail: '生成基础标题脚手架',
        });
        continue;
      }

      // 一级标题检查
      if (!/^#\s+/m.test(content)) {
        const inferredTitle = basename(abs, extname(abs))
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        issues.push({
          file: rel,
          absPath: abs,
          type: 'missing-heading',
          message: '缺少一级标题 (# 标题)',
          autoFixable: true,
          fixDetail: `添加 H1 标题: "# ${inferredTitle}"`,
        });
      }

      // Frontmatter 元数据规范检查 (Frontmatter & Metadata Check)
      if (
        rel.startsWith('docs/architecture/') &&
        !rel.startsWith('docs/archive/') &&
        trimmed.length > 0
      ) {
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!fmMatch) {
          const inferredKind = 'architecture';
          const inferredScope = rel.split('/')[1] || 'project';
          const inferredLevel = 2;
          issues.push({
            file: rel,
            absPath: abs,
            type: 'missing-frontmatter',
            message: '核心架构文档缺失 YAML 元数据 Frontmatter (缺少 kind, scope, level, status 规范头)',
            autoFixable: true,
            fixDetail: `自动注入标准 Frontmatter (kind: ${inferredKind}, scope: ${inferredScope}, level: ${inferredLevel}, status: active)`,
          });
        }
      }

      if (rel.startsWith('docs/') && !rel.startsWith('docs/archive/') && trimmed.length > 0) {
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (fmMatch) {
          try {
            const parsedFm = (parseYaml(fmMatch[1]) || {}) as Record<string, unknown>;
            if (typeof parsedFm === 'object' && parsedFm !== null) {
              if (parsedFm.status && !['active', 'wip', 'deprecated', 'draft'].includes(String(parsedFm.status).toLowerCase())) {
                issues.push({
                  file: rel,
                  absPath: abs,
                  type: 'invalid-frontmatter',
                  message: `Frontmatter status 字段取值无效: "${parsedFm.status}" (有效值: active | wip | deprecated | draft)`,
                  autoFixable: true,
                  fixDetail: '修正 status 为 active',
                });
              }
            }
          } catch {
            issues.push({
              file: rel,
              absPath: abs,
              type: 'invalid-frontmatter',
              message: 'Frontmatter YAML 格式解析异常',
              autoFixable: false,
              fixDetail: '请检查并修正 YAML 语法',
            });
          }
        }
      }

      // Markdown 链接与死链/符号检查
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(content)) !== null) {
        const originalText = match[1];
        const linkTarget = match[2].trim();

        // 跳过外部链接、锚点、mailto
        if (
          linkTarget.startsWith('http://') ||
          linkTarget.startsWith('https://') ||
          linkTarget.startsWith('#') ||
          linkTarget.startsWith('mailto:')
        ) {
          continue;
        }

        let targetFilePath = '';
        if (linkTarget.startsWith('file://')) {
          targetFilePath = linkTarget.replace(/^file:\/\//, '').split('#')[0];
        } else {
          const cleanPath = linkTarget.split('#')[0];
          if (!cleanPath) continue;
          targetFilePath = resolve(dirname(abs), cleanPath);
        }

        if (targetFilePath && existsSync(targetFilePath)) {
          // 检查是否引用了已废弃文档
          const targetMeta = allFilesMetaMap.get(targetFilePath);
          if (targetMeta?.status === 'deprecated' && selfMeta.status !== 'deprecated') {
            const targetRel = normalizeDocPath(relative(projectRoot, targetFilePath));
            issues.push({
              file: rel,
              absPath: abs,
              type: 'deprecated-reference',
              message: `引用了已废弃/归档文档: [${originalText}](${linkTarget})${targetMeta.deprecatedBy ? ` (替代方案: ${targetMeta.deprecatedBy})` : ''}`,
              autoFixable: false,
              fixDetail: targetMeta.deprecatedBy ? `建议更新引用为: ${targetMeta.deprecatedBy}` : '建议评估是否更新引用或明确废弃依赖',
            });
          }

          // 代码符号漂移检查 (Symbol Drift for markdown links to source files)
          const ext = extname(targetFilePath).toLowerCase();
          const isSource = ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '.go', '.rs', '.py'].includes(ext);
          if (isSource && sourceFileExportsMap.has(targetFilePath)) {
            const exports = sourceFileExportsMap.get(targetFilePath)!;
            const cleanRaw = originalText.replace(/[`()]/g, '').trim();
            const symbolName = cleanRaw.split(/[.#]/)[0].trim();
            if (symbolName && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(symbolName) && !exports.has(symbolName)) {
              let closestSymbol: string | undefined;
              let bestSim = 0;
              for (const exp of exports) {
                const sim = computeSimilarity(symbolName, exp);
                if (sim > bestSim) {
                  bestSim = sim;
                  closestSymbol = exp;
                }
              }

              const hasValidSuggestion = bestSim >= 0.7 && !!closestSymbol;
              const targetRel = normalizeDocPath(relative(projectRoot, targetFilePath));
              issues.push({
                file: rel,
                absPath: abs,
                type: 'symbol-drift',
                message: `代码符号漂移: 引用 \`${symbolName}\` 在源码 \`${targetRel}\` 中未导出${hasValidSuggestion ? ` (建议使用 \`${closestSymbol}\`)` : ''}`,
                autoFixable: hasValidSuggestion,
                fixDetail: hasValidSuggestion
                  ? `更新符号引用为: \`${closestSymbol}\``
                  : `源码文件 \`${targetRel}\` 中未找到同名导出符号`,
                linkData: {
                  originalText: originalText,
                  originalTarget: symbolName,
                  suggestedTarget: hasValidSuggestion ? closestSymbol : undefined,
                },
              });
            }
          }
        } else if (targetFilePath && !existsSync(targetFilePath)) {
          // 尝试根据文件名寻找重命名或移动后的目标（优先精确匹配，其次 Levenshtein 模糊相似度）
          const targetBase = basename(targetFilePath).toLowerCase();
          let candidateAbs = allFilesBaseMap.get(targetBase);

          if (!candidateAbs) {
            let bestSim = 0;
            let bestCandidate: string | undefined;
            for (const [knownBase, knownAbs] of allFilesBaseMap.entries()) {
              const sim = computeSimilarity(targetBase, knownBase);
              if (sim > bestSim && sim >= 0.75) {
                bestSim = sim;
                bestCandidate = knownAbs;
              }
            }
            if (bestCandidate) {
              candidateAbs = bestCandidate;
            }
          }

          let suggestedTarget: string | undefined;
          if (candidateAbs && existsSync(candidateAbs)) {
            suggestedTarget = relative(dirname(abs), candidateAbs);
            if (!suggestedTarget.startsWith('.')) {
              suggestedTarget = `./${suggestedTarget}`;
            }
          }

          issues.push({
            file: rel,
            absPath: abs,
            type: 'broken-link',
            message: `死链: [${originalText}](${linkTarget}) 目标文件不存在`,
            autoFixable: !!suggestedTarget,
            fixDetail: suggestedTarget ? `重定向至匹配文件: ${suggestedTarget}` : '无法推断有效目标',
            linkData: {
              originalText,
              originalTarget: linkTarget,
              suggestedTarget,
            },
          });
        }
      }

      // 源码与代码引用漂移检查 (Code Drift Check)
      // 设计草案/提案/归档文档、WIP/Draft 状态文档或显式声明豁免的文档，不作为已上线代码引用强制校验
      const isDesignOrDraft = rel.startsWith('docs/design/')
        || rel.startsWith('docs/archive/')
        || rel.startsWith('docs/proposals/')
        || ['wip', 'draft', 'proposal', 'deprecated'].includes(selfMeta.status || '')
        || content.includes('docpath:drift-exempt')
        || content.includes('docpath:no-code-drift');

      if (!isDesignOrDraft) {
        const codeRefRegex = /`((?:src|tests|lib|cmd|pkg|internal|core)\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`/g;
        let codeMatch: RegExpExecArray | null;
        while ((codeMatch = codeRefRegex.exec(content)) !== null) {
          const codeRef = codeMatch[1].trim();
          if (codeRef.includes('*') || codeRef.includes('{')) continue;

          const absCodePath = resolve(projectRoot, codeRef);
          if (!existsSync(absCodePath)) {
            const codeBase = basename(codeRef).toLowerCase();
            const candidateCodeAbs = allSourceFilesBaseMap.get(codeBase);
            let suggestedCodeTarget: string | undefined;

            if (candidateCodeAbs && existsSync(candidateCodeAbs)) {
              suggestedCodeTarget = normalizeDocPath(relative(projectRoot, candidateCodeAbs));
            }

            issues.push({
              file: rel,
              absPath: abs,
              type: 'code-drift',
              message: `代码引用漂移: \`${codeRef}\` 在源码目录中不存在`,
              autoFixable: !!suggestedCodeTarget,
              fixDetail: suggestedCodeTarget ? `更新代码引用为: \`${suggestedCodeTarget}\`` : '源码文件已删除或已重构',
              linkData: {
                originalText: codeRef,
                originalTarget: codeRef,
                suggestedTarget: suggestedCodeTarget,
              },
            });
          }
        }

        // 行内带符号代码引用漂移检查 (如 `src/utils/file.ts:readFileSafe`)
        const inlineSymbolRegex = /`((?:src|tests|lib|cmd|pkg|internal|core)\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[:#]([a-zA-Z_$][a-zA-Z0-9_$]*)`/g;
        let inlineSymMatch: RegExpExecArray | null;
        while ((inlineSymMatch = inlineSymbolRegex.exec(content)) !== null) {
          const fullMatchText = inlineSymMatch[0];
          const filePart = inlineSymMatch[1];
          const symPart = inlineSymMatch[2];
          const absSrc = resolve(projectRoot, filePart);
          if (existsSync(absSrc) && sourceFileExportsMap.has(absSrc)) {
            const exports = sourceFileExportsMap.get(absSrc)!;
            if (!exports.has(symPart)) {
              let closestSymbol: string | undefined;
              let bestSim = 0;
              for (const exp of exports) {
                const sim = computeSimilarity(symPart, exp);
                if (sim > bestSim) {
                  bestSim = sim;
                  closestSymbol = exp;
                }
              }
              const hasValidSuggestion = bestSim >= 0.7 && !!closestSymbol;
              const suggestedTarget = hasValidSuggestion ? `\`${filePart}:${closestSymbol}\`` : undefined;
              issues.push({
                file: rel,
                absPath: abs,
                type: 'symbol-drift',
                message: `代码符号漂移: 引用 \`${symPart}\` 在源码 \`${filePart}\` 中未导出${hasValidSuggestion ? ` (建议使用 \`${closestSymbol}\`)` : ''}`,
                autoFixable: hasValidSuggestion,
                fixDetail: hasValidSuggestion ? `更新符号引用为: ${suggestedTarget}` : `源码中未找到同名导出符号`,
                linkData: {
                  originalText: fullMatchText,
                  originalTarget: symPart,
                  suggestedTarget: suggestedTarget,
                },
              });
            }
          }
        }
      }

      // DocPath CLI 命令漂移检查 (Command Drift Check)
      const validCommands = new Set(COMMAND_METADATA.map((c) => c.name));
      const commandReplacements = new Map<string, string>();
      for (const cmd of COMMAND_METADATA) {
        if (cmd.replacement) commandReplacements.set(cmd.name, cmd.replacement);
      }
      validCommands.add('help');
      validCommands.add('version');

      const cmdRegex = /`docpath\s+([a-zA-Z0-9_-]+)`/g;
      let cmdMatch: RegExpExecArray | null;
      while ((cmdMatch = cmdRegex.exec(content)) !== null) {
        const fullCmd = cmdMatch[0];
        const sub = cmdMatch[1].trim();
        if (sub.startsWith('<') || sub.startsWith('[') || sub.startsWith('$') || sub === '...') continue;

        if (commandReplacements.has(sub)) {
          const repl = commandReplacements.get(sub)!;
          issues.push({
            file: rel,
            absPath: abs,
            type: 'command-drift',
            message: `命令已废弃: \`docpath ${sub}\` (建议使用 \`docpath ${repl}\`)`,
            autoFixable: true,
            fixDetail: `更新废弃命令为: \`docpath ${repl}\``,
            linkData: {
              originalText: fullCmd,
              originalTarget: `docpath ${sub}`,
              suggestedTarget: `docpath ${repl}`,
            },
          });
        }
      }

      // 归档建议检查 (Archive Candidate Check)
      if (rel.startsWith('docs/') && !rel.startsWith('docs/archive/')) {
        const isDeprecated =
          selfMeta.status === 'deprecated' ||
          content.includes('status: deprecated') ||
          content.includes('deprecated: true') ||
          />\s*(?:⚠️\s*)?\*\*(?:Deprecated|已废弃)\*\*/i.test(content);

        if (isDeprecated) {
          const archiveRel = normalizeDocPath(join('docs/archive', relative(join(projectRoot, 'docs'), abs)));
          issues.push({
            file: rel,
            absPath: abs,
            type: 'archive-candidate',
            message: `文档已标记为废弃但仍位于活跃目录，建议归档至 ${archiveRel}`,
            autoFixable: false,
            fixDetail: `建议移动文件至 \`${archiveRel}\`，或运行 docpath docs archive ${rel}`,
            linkData: {
              originalText: rel,
              originalTarget: rel,
              suggestedTarget: archiveRel,
            },
          });
        }
      }

      // 核心与常规活文档长期未复核检查 (Stale Unreviewed Check - 核心架构文档标准为 90 天，常规文档为 180 天)
      const tierInfo = inferDocumentTier(rel, selfMeta.tier, selfMeta.is_core, selfMeta.level);
      const isCoreDoc = tierInfo.is_core || tierInfo.tier === 'core' || tierInfo.tier === 'architecture';

      if (rel.startsWith('docs/') && !rel.startsWith('docs/archive/') && selfMeta.status !== 'deprecated') {
        const fileStat = await stat(abs);
        const daysSinceModified = Math.floor((Date.now() - fileStat.mtimeMs) / (1000 * 60 * 60 * 24));
        const staleThreshold = isCoreDoc ? 90 : 180;
        if (daysSinceModified > staleThreshold) {
          issues.push({
            file: rel,
            absPath: abs,
            type: 'stale-unreviewed',
            message: isCoreDoc
              ? `核心架构文档长期未校准 (距今已 ${daysSinceModified} 天未复核，核心文档治理标准为 90 天)`
              : `文档长期未复核 (距今已 ${daysSinceModified} 天未校准)`,
            autoFixable: false,
            fixDetail: `建议架构负责人复核其有效性，或使用 docpath docs touch ${rel} 确认有效`,
          });
        }

        // 核心架构文档必须具备非空段落概述
        if (isCoreDoc) {
          const rawWithoutFm = content.replace(/^---[\s\S]*?---\s*\n?/, '').trim();
          const meaningfulLines = rawWithoutFm
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('>') && !l.startsWith('<!--'));
          if (meaningfulLines.length === 0) {
            issues.push({
              file: rel,
              absPath: abs,
              type: 'missing-heading',
              message: '核心架构文档缺失段落概述 (Summary)，建议补充核心设计意图',
              autoFixable: false,
              fixDetail: '在文档顶部标题下方补充简要设计概述段落',
            });
          }
        }
      }
    } catch {
      // 容错
    }
  }

  // 3. 索引对齐检查 (Unindexed / Stale Index)
  const index = await readProjectDocumentIndex(docpathDir);
  const indexedPaths = new Set(index?.entries.map((e) => e.path) || []);

  for (const item of scannedFiles) {
    if (item.rel.startsWith('docs/') && !indexedPaths.has(item.rel)) {
      issues.push({
        file: item.rel,
        absPath: item.abs,
        type: 'unindexed',
        message: '未被 docs-index.json 索引',
        autoFixable: true,
        fixDetail: '重新扫描并加入文档索引',
      });
    }
  }

  // 检查索引中是否存在已被删除的幽灵文档
  if (index?.entries) {
    for (const entry of index.entries) {
      if (entry.path.startsWith('docs/')) {
        const full = join(projectRoot, entry.path);
        if (!existsSync(full)) {
          issues.push({
            file: entry.path,
            absPath: full,
            type: 'stale-index',
            message: '索引中包含已删除或不存在的幽灵文档',
            autoFixable: true,
            fixDetail: '刷新索引清除幽灵条目',
          });
        }
      }
    }
  }

  // 4. Backlog 目录规范与证据死链检查 (Backlog Layout & Evidence Integrity)
  const backlogDir = join(docpathDir, 'backlog');
  if (existsSync(backlogDir)) {
    try {
      const entries = await readdir(backlogDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(backlogDir, entry.name);
        const rel = normalizeDocPath(relative(projectRoot, full));
        if (entry.isDirectory()) {
          if (entry.name !== 'analysis' && entry.name !== 'archived') {
            issues.push({
              file: rel,
              absPath: full,
              type: 'backlog-misplaced',
              message: `未预期的 Backlog 子目录: ${entry.name}（仅允许 analysis/ 与 archived/）`,
              autoFixable: false,
            });
          }
        } else if (entry.isFile()) {
          if (
            entry.name === '.id-counter' ||
            entry.name === 'backlog.md' ||
            /^R-\d+(-[^\x00-\x1f/\\:*?"<>|]+)?\.md$/iu.test(entry.name)
          ) {
            continue;
          }
          const isAnalysisOrBrief = /(?:analysis|decision|brief|summary|product|technical|requirements|risks|questions)/i.test(
            entry.name,
          );
          let targetName = entry.name;
          if (/^R\d+/i.test(targetName)) {
            targetName = targetName.replace(/^R(\d+)/i, 'R-$1');
          }
          const suggestedTarget = isAnalysisOrBrief
            ? normalizeDocPath(relative(projectRoot, join(backlogDir, 'analysis', targetName)))
            : undefined;
          issues.push({
            file: rel,
            absPath: full,
            type: 'backlog-misplaced',
            message: isAnalysisOrBrief
              ? `Backlog 根目录下存在游离分析/决策文件: ${entry.name}，应移至 analysis/ 目录`
              : `非标准的 Backlog 文件命名: ${entry.name}`,
            autoFixable: !!suggestedTarget,
            fixDetail: suggestedTarget ? `自动移动至 ${suggestedTarget}` : undefined,
            linkData: suggestedTarget
              ? {
                  originalText: entry.name,
                  originalTarget: rel,
                  suggestedTarget,
                }
              : undefined,
          });
        }
      }

      // 扫描 active 与 archived 内的所有 backlog 文件，校验 evidence 路径有效性
      const backlogRoots = [backlogDir, join(backlogDir, 'archived')];
      for (const bDir of backlogRoots) {
        if (!existsSync(bDir)) continue;
        const bEntries = await readdir(bDir, { withFileTypes: true });
        for (const bEntry of bEntries) {
          if (!bEntry.isFile() || !bEntry.name.endsWith('.md') || bEntry.name === 'backlog.md') continue;
          const bAbs = join(bDir, bEntry.name);
          const bRel = normalizeDocPath(relative(projectRoot, bAbs));
          const content = await readFileSafe(bAbs);
          if (!content) continue;
          const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
          if (!match) continue;
          try {
            const fm = (parseYaml(match[1]) || {}) as Record<string, unknown>;
            if (fm.evidence && typeof fm.evidence === 'object') {
              const evidenceObj = fm.evidence as Record<string, unknown>;
              for (const field of ['brainstorm', 'analysis', 'spec', 'decision_brief'] as const) {
                const val = evidenceObj[field];
                if (typeof val === 'string' && val.trim()) {
                  const target = val.trim();
                  // 忽略内联叙述文本、对话确认或远程 URL
                  if (
                    target.includes('\n') ||
                    target.startsWith('http://') ||
                    target.startsWith('https://') ||
                    target.startsWith('conversation:') ||
                    /\s/.test(target) ||
                    (!/\.(?:md|markdown|json|ya?ml|txt)$/i.test(target) &&
                      !target.startsWith('./') &&
                      !target.startsWith('../') &&
                      !target.startsWith('.docpath/') &&
                      !target.startsWith('tasks/'))
                  ) {
                    continue;
                  }

                  let found = false;
                  if (existsSync(isAbsolute(target) ? target : resolve(projectRoot, target))) {
                    found = true;
                  } else if (target.startsWith('tasks/')) {
                    const sub = target.replace(/^tasks\//, '');
                    const directTask = join(docpathDir, 'tasks', sub);
                    const doneTask = join(docpathDir, 'tasks', 'done', sub);
                    if (existsSync(directTask) || existsSync(doneTask)) {
                      found = true;
                    }
                  } else if (target.startsWith('.docpath/tasks/')) {
                    const sub = target.replace(/^\.docpath\/tasks\//, '');
                    const directTask = join(docpathDir, 'tasks', sub);
                    const doneTask = join(docpathDir, 'tasks', 'done', sub);
                    if (existsSync(directTask) || existsSync(doneTask)) {
                      found = true;
                    }
                  } else if (existsSync(join(docpathDir, target))) {
                    found = true;
                  }

                  if (!found) {
                    // 尝试推断移动后的候选路径
                    let suggestedTarget: string | undefined;
                    const candidateAnalysis = join(backlogDir, 'analysis', basename(target));
                    let normalizedAnalysisCandidate = '';
                    if (/^R\d+/i.test(basename(target))) {
                      normalizedAnalysisCandidate = join(
                        backlogDir,
                        'analysis',
                        basename(target).replace(/^R(\d+)/i, 'R-$1'),
                      );
                    }
                    if (existsSync(candidateAnalysis)) {
                      suggestedTarget = normalizeDocPath(relative(projectRoot, candidateAnalysis));
                    } else if (normalizedAnalysisCandidate && existsSync(normalizedAnalysisCandidate)) {
                      suggestedTarget = normalizeDocPath(relative(projectRoot, normalizedAnalysisCandidate));
                    }

                    issues.push({
                      file: bRel,
                      absPath: bAbs,
                      type: 'broken-evidence',
                      message: `Backlog 证据死链: [${field}] "${target}" 目标文件不存在`,
                      autoFixable: !!suggestedTarget,
                      fixDetail: suggestedTarget ? `修正证据路径为 ${suggestedTarget}` : '无法推断有效证据路径',
                      linkData: {
                        originalText: field,
                        originalTarget: target,
                        suggestedTarget,
                      },
                    });
                  }
                }
              }
            }
          } catch {
            // 忽略 yaml 解析错误
          }
        }
      }
    } catch {
      // 容错
    }
  }

  const stats = {
    brokenLinks: issues.filter((i) => i.type === 'broken-link').length,
    deprecatedReferences: issues.filter((i) => i.type === 'deprecated-reference').length,
    codeDrift: issues.filter((i) => i.type === 'code-drift').length,
    symbolDrift: issues.filter((i) => i.type === 'symbol-drift').length,
    commandDrift: issues.filter((i) => i.type === 'command-drift').length,
    staleUnreviewed: issues.filter((i) => i.type === 'stale-unreviewed').length,
    archiveCandidates: issues.filter((i) => i.type === 'archive-candidate').length,
    unindexed: issues.filter((i) => i.type === 'unindexed').length,
    missingHeadings: issues.filter((i) => i.type === 'missing-heading').length,
    emptyDocs: issues.filter((i) => i.type === 'empty-doc').length,
    staleIndex: issues.filter((i) => i.type === 'stale-index').length,
    backlogIssues: issues.filter((i) => i.type === 'backlog-misplaced' || i.type === 'broken-evidence').length,
    frontmatterIssues: issues.filter((i) => i.type === 'missing-frontmatter' || i.type === 'invalid-frontmatter').length,
    lifecycle: {
      active: activeDocsCount,
      wip: wipDocsCount,
      deprecated: deprecatedDocsCount,
    },
  };

  return {
    scannedCount: scannedFiles.length,
    indexedCount: index?.entries.length || 0,
    healthy: issues.length === 0,
    issues,
    stats,
  };
}

/**
 * 自动修复活文档中的可自愈问题
 */
export async function fixDocumentHealth(
  cwd: string,
  options: { dryRun?: boolean; stagedOnly?: boolean; reStage?: boolean } = {},
): Promise<DocFixResult> {
  const { dryRun = false, stagedOnly = false, reStage = false } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const projectRoot = dirname(resolve(docpathDir));
  const report = await diagnoseDocumentHealth(cwd, { stagedOnly });

  const healedHeadings: string[] = [];
  const healedFrontmatters: string[] = [];
  const repairedLinks: Array<{ file: string; from: string; to: string }> = [];
  const cleanedEmptyDocs: string[] = [];
  const modifiedAbsFiles = new Set<string>();
  let refreshedIndex = false;

  let fixedCount = 0;

  // 1. 修复空文档与缺失的一级标题/Frontmatter
  for (const issue of report.issues) {
    if (issue.type === 'empty-doc' && issue.autoFixable) {
      const inferredTitle = basename(issue.absPath, extname(issue.absPath))
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const scaffold = `# ${inferredTitle}\n\n> 本文档自动初始化。\n\n## 概述\n\n`;
      if (!dryRun) {
        await writeFile(issue.absPath, scaffold, 'utf-8');
        modifiedAbsFiles.add(issue.absPath);
      }
      cleanedEmptyDocs.push(issue.file);
      fixedCount++;
    } else if (issue.type === 'missing-heading' && issue.autoFixable) {
      try {
        const content = (await readFileSafe(issue.absPath)) || '';
        const inferredTitle = basename(issue.absPath, extname(issue.absPath))
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const newContent = `# ${inferredTitle}\n\n${content.trimStart()}`;
        if (!dryRun) {
          await writeFile(issue.absPath, newContent, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        healedHeadings.push(issue.file);
        fixedCount++;
      } catch {
        // 容错
      }
    } else if (issue.type === 'missing-frontmatter' && issue.autoFixable) {
      try {
        const content = (await readFileSafe(issue.absPath)) || '';
        const rel = issue.file;
        const inferredKind = rel.includes('architecture') || rel.includes('arch')
          ? 'architecture'
          : rel.includes('design')
            ? 'design'
            : rel.includes('feature')
              ? 'feature'
              : rel.includes('guide') || rel.includes('tutorial')
                ? 'guide'
                : rel.includes('adr') || rel.includes('decision')
                  ? 'decision'
                  : 'reference';
        const inferredScope = rel.split('/')[1] || 'project';
        const inferredLevel = inferredKind === 'guide' ? 1 : 2;
        const fmHeader = `---\nkind: ${inferredKind}\nscope: ${inferredScope}\nlevel: ${inferredLevel}\nstatus: active\n---\n\n`;
        const updatedContent = `${fmHeader}${content.trimStart()}`;
        if (!dryRun) {
          await writeFile(issue.absPath, updatedContent, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        healedFrontmatters.push(issue.file);
        fixedCount++;
      } catch {
        // 容错
      }
    }
  }

  // 2. 修复可重定向的死链
  const brokenLinkIssues = report.issues.filter((i) => i.type === 'broken-link' && i.autoFixable && i.linkData?.suggestedTarget);
  for (const issue of brokenLinkIssues) {
    try {
      const content = (await readFileSafe(issue.absPath)) || '';
      const originalTarget = issue.linkData!.originalTarget;
      const suggestedTarget = issue.linkData!.suggestedTarget!;

      // 替换死链目标
      const escapedTarget = originalTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const targetRegex = new RegExp(`\\]\\(${escapedTarget}\\)`, 'g');
      const updatedContent = content.replace(targetRegex, `](${suggestedTarget})`);

      if (updatedContent !== content) {
        if (!dryRun) {
          await writeFile(issue.absPath, updatedContent, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        repairedLinks.push({
          file: issue.file,
          from: originalTarget,
          to: suggestedTarget,
        });
        fixedCount++;
      }
    } catch {
      // 容错
    }
  }

  // 3. 修复代码引用漂移 (Code Drift)
  const codeDriftIssues = report.issues.filter((i) => i.type === 'code-drift' && i.autoFixable && i.linkData?.suggestedTarget);
  for (const issue of codeDriftIssues) {
    try {
      const content = (await readFileSafe(issue.absPath)) || '';
      const oldCodeRef = `\`${issue.linkData!.originalTarget}\``;
      const newCodeRef = `\`${issue.linkData!.suggestedTarget}\``;
      if (content.includes(oldCodeRef)) {
        const updated = content.replaceAll(oldCodeRef, newCodeRef);
        if (!dryRun) {
          await writeFile(issue.absPath, updated, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        repairedLinks.push({
          file: issue.file,
          from: issue.linkData!.originalTarget,
          to: issue.linkData!.suggestedTarget!,
        });
        fixedCount++;
      }
    } catch {
      // 容错
    }
  }

  // 4. 修复代码符号漂移 (Symbol Drift)
  const symbolDriftIssues = report.issues.filter((i) => i.type === 'symbol-drift' && i.autoFixable && i.linkData?.suggestedTarget);
  for (const issue of symbolDriftIssues) {
    try {
      const content = (await readFileSafe(issue.absPath)) || '';
      let updatedContent = content;
      if (issue.linkData!.originalText.startsWith('`') && issue.linkData!.suggestedTarget!.startsWith('`')) {
        // 行内符号引用如 `src/foo.ts:oldSym` -> `src/foo.ts:newSym`
        updatedContent = updatedContent.replaceAll(issue.linkData!.originalText, issue.linkData!.suggestedTarget!);
      } else {
        // Markdown 链接文本中的符号 [`oldSym`](...) -> [`newSym`](...)
        const rawText = issue.linkData!.originalText;
        const oldSym = issue.linkData!.originalTarget;
        const newSym = issue.linkData!.suggestedTarget!;
        const replacedRaw = rawText.replaceAll(oldSym, newSym);
        updatedContent = updatedContent.replaceAll(`[${rawText}]`, `[${replacedRaw}]`);
      }

      if (updatedContent !== content) {
        if (!dryRun) {
          await writeFile(issue.absPath, updatedContent, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        repairedLinks.push({
          file: issue.file,
          from: issue.linkData!.originalTarget,
          to: issue.linkData!.suggestedTarget!,
        });
        fixedCount++;
      }
    } catch {
      // 容错
    }
  }

  // 5. 修复 DocPath 命令漂移 (Command Drift)
  const commandDriftIssues = report.issues.filter((i) => i.type === 'command-drift' && i.autoFixable && i.linkData?.suggestedTarget);
  for (const issue of commandDriftIssues) {
    try {
      const content = (await readFileSafe(issue.absPath)) || '';
      const oldCmd = `\`${issue.linkData!.originalTarget}\``;
      const newCmd = `\`${issue.linkData!.suggestedTarget}\``;
      if (content.includes(oldCmd)) {
        const updated = content.replaceAll(oldCmd, newCmd);
        if (!dryRun) {
          await writeFile(issue.absPath, updated, 'utf-8');
          modifiedAbsFiles.add(issue.absPath);
        }
        repairedLinks.push({
          file: issue.file,
          from: issue.linkData!.originalTarget,
          to: issue.linkData!.suggestedTarget!,
        });
        fixedCount++;
      }
    } catch {
      // 容错
    }
  }

  // 6. 修复 Backlog 游离文件移动与证据死链自愈
  for (const issue of report.issues) {
    if (issue.type === 'backlog-misplaced' && issue.autoFixable && issue.linkData?.suggestedTarget) {
      try {
        const dest = resolve(projectRoot, issue.linkData.suggestedTarget);
        if (!dryRun) {
          await mkdir(dirname(dest), { recursive: true });
          await rename(issue.absPath, dest);
          modifiedAbsFiles.add(dest);
        }
        repairedLinks.push({
          file: issue.file,
          from: issue.linkData.originalTarget,
          to: issue.linkData.suggestedTarget,
        });
        fixedCount++;
      } catch {
        // 容错
      }
    } else if (issue.type === 'broken-evidence' && issue.autoFixable && issue.linkData?.suggestedTarget) {
      try {
        const content = (await readFileSafe(issue.absPath)) || '';
        const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (match) {
          const fm = (parseYaml(match[1]) || {}) as Record<string, any>;
          const field = issue.linkData.originalText;
          if (fm.evidence && typeof fm.evidence === 'object') {
            fm.evidence[field] = issue.linkData.suggestedTarget;
            const newContent = `---\n${stringifyYaml(fm).trim()}\n---\n${match[2] || ''}`;
            if (!dryRun) {
              await writeFile(issue.absPath, newContent, 'utf-8');
              modifiedAbsFiles.add(issue.absPath);
            }
            repairedLinks.push({
              file: issue.file,
              from: issue.linkData.originalTarget,
              to: issue.linkData.suggestedTarget,
            });
            fixedCount++;
          }
        }
      } catch {
        // 容错
      }
    }
  }

  // 7. 刷新活文档索引 (如果有未索引或幽灵索引条目)
  const needsIndexRefresh = report.stats.unindexed > 0 || report.stats.staleIndex > 0;
  if (needsIndexRefresh) {
    if (!dryRun) {
      await refreshProjectDocumentIndex(docpathDir, cwd);
    }
    refreshedIndex = true;
    fixedCount += report.stats.unindexed + report.stats.staleIndex;
  }

  // 若启用了 reStage 且发生了自愈修改，自动将修复后的文件重新加入 Git 暂存区
  if (reStage && !dryRun && modifiedAbsFiles.size > 0) {
    try {
      const relPaths = Array.from(modifiedAbsFiles).map((abs) => `"${relative(projectRoot, abs)}"`);
      await execAsync(`git add ${relPaths.join(' ')}`, { cwd: projectRoot });
    } catch {
      // 容错
    }
  }

  // 8. 重新诊断剩余未自愈问题
  const afterReport = dryRun ? report : await diagnoseDocumentHealth(cwd, { stagedOnly });

  return {
    fixedCount,
    healedHeadings,
    healedFrontmatters,
    repairedLinks,
    refreshedIndex,
    cleanedEmptyDocs,
    remainingIssues: afterReport.issues,
  };
}

/**
 * 安装或更新 Git pre-commit 防腐守卫钩子
 */
export async function installDocGuardHook(cwd: string): Promise<{ success: boolean; hookPath: string; message: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const projectRoot = dirname(resolve(docpathDir));
  const gitHooksDir = join(projectRoot, '.git', 'hooks');

  if (!existsSync(join(projectRoot, '.git'))) {
    return { success: false, hookPath: '', message: '当前目录不是有效的 Git 仓库 (.git 目录不存在)' };
  }

  await mkdir(gitHooksDir, { recursive: true });
  const precommitPath = join(gitHooksDir, 'pre-commit');

  const hookScript = `#!/usr/bin/env sh
# DocPath Living Docs Pre-Commit Guard (Auto-installed)
# Intercepts broken links, symbol drift, and command drift before git commit

if command -v docpath >/dev/null 2>&1; then
  docpath doc guard --staged || exit 1
elif [ -f "./dist/index.js" ]; then
  node "./dist/index.js" doc guard --staged || exit 1
elif [ -f "./node_modules/.bin/docpath" ]; then
  ./node_modules/.bin/docpath doc guard --staged || exit 1
fi
`;

  if (existsSync(precommitPath)) {
    const existing = await readFile(precommitPath, 'utf-8');
    if (!existing.includes('docpath doc guard')) {
      const appended = `${existing.trimEnd()}\n\n# DocPath Living Docs Guard\nif command -v docpath >/dev/null 2>&1; then\n  docpath doc guard --staged || exit 1\nfi\n`;
      await writeFile(precommitPath, appended, 'utf-8');
      const { chmod } = await import('node:fs/promises');
      await chmod(precommitPath, 0o755);
      return { success: true, hookPath: precommitPath, message: '已向现有的 .git/hooks/pre-commit 追加 DocPath 防腐钩子' };
    }
    return { success: true, hookPath: precommitPath, message: '.git/hooks/pre-commit 中已存在 DocPath 防腐钩子' };
  }

  await writeFile(precommitPath, hookScript, 'utf-8');
  const { chmod } = await import('node:fs/promises');
  await chmod(precommitPath, 0o755);
  return { success: true, hookPath: precommitPath, message: '已成功创建并配置 .git/hooks/pre-commit 防腐钩子' };
}

export interface DocGuardResult {
  passed: boolean;
  staged: boolean;
  scannedCount: number;
  blockingCount: number;
  warningCount: number;
  blockingIssues: DocIssue[];
  warningIssues: DocIssue[];
  repairedCount?: number;
}

/**
 * 运行活文档防腐守卫 (Doc Guard)
 */
export async function runDocGuard(
  cwd: string,
  options: {
    staged?: boolean;
    fix?: boolean;
    install?: boolean;
    agent?: boolean;
    json?: boolean;
  } = {},
): Promise<DocGuardResult> {
  const { staged = true, fix = false, install = false, agent = false, json = false } = options;

  if (install) {
    const instRes = await installDocGuardHook(cwd);
    if (json) {
      console.log(JSON.stringify(instRes, null, 2));
    } else if (agent) {
      const { stringify } = await import('yaml');
      console.log(stringify({ agent_view: 'doc_guard_install', ...instRes }));
    } else {
      console.log(`\n🪝  ${instRes.message}`);
      console.log(`    钩子位置: ${instRes.hookPath}\n`);
    }
    return {
      passed: instRes.success,
      staged,
      scannedCount: 0,
      blockingCount: 0,
      warningCount: 0,
      blockingIssues: [],
      warningIssues: [],
    };
  }

  let repairedCount = 0;
  if (fix) {
    const fixRes = await fixDocumentHealth(cwd, { stagedOnly: staged, reStage: staged });
    repairedCount = fixRes.fixedCount;
  }

  const report = await diagnoseDocumentHealth(cwd, { stagedOnly: staged });

  const BLOCKING_TYPES: Set<DocIssueType> = new Set([
    'broken-link',
    'symbol-drift',
    'command-drift',
    'empty-doc',
  ]);

  const blockingIssues = report.issues.filter((i) => BLOCKING_TYPES.has(i.type));
  const warningIssues = report.issues.filter((i) => !BLOCKING_TYPES.has(i.type));
  const passed = blockingIssues.length === 0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          passed,
          staged,
          scannedCount: report.scannedCount,
          blockingCount: blockingIssues.length,
          warningCount: warningIssues.length,
          repairedCount,
          blockingIssues,
          warningIssues,
        },
        null,
        2,
      ),
    );
    return { passed, staged, scannedCount: report.scannedCount, blockingCount: blockingIssues.length, warningCount: warningIssues.length, blockingIssues, warningIssues, repairedCount };
  }

  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'doc_guard',
        passed,
        staged,
        scanned_count: report.scannedCount,
        blocking_count: blockingIssues.length,
        warning_count: warningIssues.length,
        repaired_count: repairedCount,
        blocking_issues: blockingIssues.map((i) => ({ file: i.file, type: i.type, message: i.message, fix: i.fixDetail })),
        warning_issues: warningIssues.map((i) => ({ file: i.file, type: i.type, message: i.message })),
      }),
    );
    return { passed, staged, scannedCount: report.scannedCount, blockingCount: blockingIssues.length, warningCount: warningIssues.length, blockingIssues, warningIssues, repairedCount };
  }

  const targetDesc = staged ? '暂存区增量' : '全量工作区';
  if (report.scannedCount === 0 && staged) {
    return { passed: true, staged, scannedCount: 0, blockingCount: 0, warningCount: 0, blockingIssues: [], warningIssues: [] };
  }

  console.log(`\n🛡️   DocPath 活文档防腐守卫 (Doc Guard) [${targetDesc}]`);
  if (repairedCount > 0) {
    console.log(`    ✨ 已自动自愈修复 ${repairedCount} 处问题并重新暂存入 Git！`);
  }

  if (blockingIssues.length > 0) {
    console.log(`\n❌  拦截到 ${blockingIssues.length} 处致命文档腐化问题，拒绝提交 (Git Commit Blocked):`);
    for (const issue of blockingIssues) {
      console.log(`    - [${issue.type}] ${issue.file}: ${issue.message}`);
      if (issue.fixDetail) {
        console.log(`      💡 建议方案: ${issue.fixDetail}`);
      }
    }
    console.log('\n💡  解决方案:');
    console.log('    1. 运行 `docpath doc guard --staged --fix` 自动自愈并重新暂存');
    console.log('    2. 或运行 `docpath doc fix` 进行全局修复后再提交\n');
    return { passed: false, staged, scannedCount: report.scannedCount, blockingCount: blockingIssues.length, warningCount: warningIssues.length, blockingIssues, warningIssues, repairedCount };
  }

  if (warningIssues.length > 0) {
    console.log(`\n⚠️   发现 ${warningIssues.length} 项次要建议 (已放行提交):`);
    for (const issue of warningIssues) {
      console.log(`    - [${issue.type}] ${issue.file}: ${issue.message}`);
    }
  }

  console.log('✅  暂存区活文档检查通过，允许提交！\n');
  return { passed: true, staged, scannedCount: report.scannedCount, blockingCount: 0, warningCount: warningIssues.length, blockingIssues: [], warningIssues, repairedCount };
}

/**
 * 渲染诊断与健康度终端视图
 */
export function renderDocHealthTable(report: DocHealthReport): string {
  const lines: string[] = [];

  const statusBadge = report.healthy ? '🟢 HEALTHY (健康)' : '🟡 ISSUES_FOUND (存在待治理项)';

  lines.push('');
  lines.push(`📚  DocPath 活文档全景体检报告 [状态: ${statusBadge}]`);
  lines.push(`    扫描文档: ${report.scannedCount} 个 | 索引有效: ${report.indexedCount} 个 | 待治理项: ${report.issues.length} 个`);
  lines.push(`    生命周期: 🟢 Active: ${report.stats.lifecycle?.active ?? 0} | 🟡 WIP: ${report.stats.lifecycle?.wip ?? 0} | 🔴 Deprecated: ${report.stats.lifecycle?.deprecated ?? 0}`);
  lines.push('');

  const coreIssues = report.issues.filter((i) => {
    const tier = inferDocumentTier(i.file);
    return tier.is_core || tier.tier === 'core' || tier.tier === 'architecture';
  });

  lines.push('─'.repeat(72));
  lines.push('📊 巡检指标概览:');
  lines.push('');
  lines.push(`  - 核心架构治理 (Core & Arch Health)   : ${coreIssues.length === 0 ? '✅ 核心文档治理完备' : `⚠️  ${coreIssues.length} 处核心架构待治理`}`);
  lines.push(`  - 死链检查 (Broken Links)             : ${report.stats.brokenLinks === 0 ? '✅ 0 处断链' : `❌ ${report.stats.brokenLinks} 处断链`}`);
  lines.push(`  - 废弃引用 (Deprecated Reference)     : ${report.stats.deprecatedReferences === 0 ? '✅ 无过期引用' : `⚠️  ${report.stats.deprecatedReferences} 处引用已废弃文档`}`);
  lines.push(`  - 代码引用漂移 (Code Drift)           : ${report.stats.codeDrift === 0 ? '✅ 路径完全对齐' : `⚠️  ${report.stats.codeDrift} 处源码引用失效`}`);
  lines.push(`  - 代码符号漂移 (Symbol Drift)         : ${report.stats.symbolDrift === 0 ? '✅ 符号完全对齐' : `⚠️  ${report.stats.symbolDrift} 处导出符号不一致`}`);
  lines.push(`  - 命令调用漂移 (Command Drift)        : ${report.stats.commandDrift === 0 ? '✅ 语法完全有效' : `⚠️  ${report.stats.commandDrift} 处命令用法已变更`}`);
  lines.push(`  - 长期未复核 (Stale Unreviewed)       : ${report.stats.staleUnreviewed === 0 ? '✅ 时效完备' : `⚠️  ${report.stats.staleUnreviewed} 个文档未及时校准`}`);
  lines.push(`  - 归档治理建议 (Archive Candidates)   : ${report.stats.archiveCandidates === 0 ? '✅ 目录结构清晰' : `💡 ${report.stats.archiveCandidates} 个废弃文档待归档`}`);
  lines.push(`  - 未索引文档 (Unindexed)              : ${report.stats.unindexed === 0 ? '✅ 全部同步' : `⚠️  ${report.stats.unindexed} 个文档未入索引`}`);
  lines.push(`  - 缺失一级标题 (Missing H1)           : ${report.stats.missingHeadings === 0 ? '✅ 规范完备' : `⚠️  ${report.stats.missingHeadings} 个文档缺少 H1`}`);
  lines.push(`  - 文档元数据规范 (Frontmatter Health) : ${report.stats.frontmatterIssues === 0 ? '✅ 规范完备' : `⚠️  ${report.stats.frontmatterIssues} 个文档缺少或元数据不规范`}`);
  lines.push(`  - 空白占位文档 (Empty Docs)           : ${report.stats.emptyDocs === 0 ? '✅ 无空文档' : `⚠️  ${report.stats.emptyDocs} 个空文档`}`);
  lines.push(`  - 幽灵过期索引 (Stale Index)          : ${report.stats.staleIndex === 0 ? '✅ 索引纯净' : `⚠️  ${report.stats.staleIndex} 个幽灵条目`}`);
  lines.push(`  - Backlog 规范与证据 (Backlog Health) : ${report.stats.backlogIssues === 0 ? '✅ 规范完备' : `⚠️  ${report.stats.backlogIssues} 个 Backlog 待治理项`}`);
  lines.push('');

  if (report.issues.length > 0) {
    lines.push('─'.repeat(72));
    lines.push('🔍 详细待治理项明细:');
    lines.push('');
    for (const issue of report.issues) {
      const fixTag = issue.autoFixable ? '✨ [可自愈]' : '⚠️ [需手动]';
      lines.push(`  - ${fixTag} [${issue.type}] ${issue.file}: ${issue.message}`);
      if (issue.fixDetail) {
        lines.push(`    修复方案: ${issue.fixDetail}`);
      }
      lines.push('');
    }
    lines.push('💡 运行 `docpath docs fix` 可一键自动自愈修复所有标记为 ✨[可自愈] 的问题！\n');
  } else {
    lines.push('─'.repeat(72));
    lines.push('✅  所有文档链接完整，格式正常，索引已同步！\n');
  }

  return lines.join('\n');
}
