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
  type DocLifecycleStatus,
  type ProjectDocumentIndexEntry,
} from './document-index.js';

import { COMMAND_METADATA } from './command-metadata.js';

export type DocIssueType =
  | 'broken-link'
  | 'deprecated-reference'
  | 'code-drift'
  | 'command-drift'
  | 'stale-unreviewed'
  | 'empty-doc'
  | 'missing-heading'
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
    commandDrift: number;
    staleUnreviewed: number;
    unindexed: number;
    missingHeadings: number;
    emptyDocs: number;
    staleIndex: number;
    backlogIssues: number;
    lifecycle: {
      active: number;
      wip: number;
      deprecated: number;
    };
  };
}

export interface DocFixResult {
  fixedCount: number;
  healedHeadings: string[];
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

/**
 * 诊断活文档全景健康度
 */
export async function diagnoseDocumentHealth(cwd: string): Promise<DocHealthReport> {
  const docpathDir = await resolveDocpathDir(cwd);
  const projectRoot = dirname(resolve(docpathDir));

  const issues: DocIssue[] = [];
  const scannedFiles: Array<{ abs: string; rel: string }> = [];

  // 1. 扫描 docs/, .docpath/rules/, 根目录 README.md 以及 config 声明路径
  const scanDirs = [
    join(projectRoot, 'docs'),
    join(docpathDir, 'rules'),
  ];

  const allMarkdownAbsPaths = new Set<string>();
  for (const dir of scanDirs) {
    const files = await collectMarkdownFiles(dir);
    for (const f of files) allMarkdownAbsPaths.add(f);
  }

  const rootReadme = join(projectRoot, 'README.md');
  if (existsSync(rootReadme)) {
    allMarkdownAbsPaths.add(rootReadme);
  }

  // 收集源码文件全集用于代码引用漂移检测
  const sourceDirs = ['src', 'tests', 'lib', 'pkg', 'cmd'].map((d) => join(projectRoot, d));
  const allSourceAbsPaths: string[] = [];
  for (const d of sourceDirs) {
    const sFiles = await collectSourceFiles(d);
    allSourceAbsPaths.push(...sFiles);
  }

  const allSourceFilesBaseMap = new Map<string, string>(); // basename -> absPath
  for (const sAbs of allSourceAbsPaths) {
    allSourceFilesBaseMap.set(basename(sAbs).toLowerCase(), sAbs);
  }

  // 收集可用于死链重定向匹配的目标全集
  const taskDoneFiles = await collectMarkdownFiles(join(docpathDir, 'tasks', 'done'));
  const allKnownMarkdown = new Set([...allMarkdownAbsPaths, ...taskDoneFiles]);

  const allFilesBaseMap = new Map<string, string>(); // basename -> absPath
  const allFilesMetaMap = new Map<string, { status: DocLifecycleStatus; deprecatedBy?: string }>();

  for (const abs of allKnownMarkdown) {
    const bName = basename(abs).toLowerCase();
    allFilesBaseMap.set(bName, abs);
    try {
      const content = await readFileSafe(abs);
      if (content) {
        const meta = parseFrontmatterMetadata(content);
        const isArchive = abs.includes('/tasks/done/') || abs.includes('/archive/');
        const status: DocLifecycleStatus = meta.status || (isArchive ? 'deprecated' : 'active');
        allFilesMetaMap.set(abs, { status, deprecatedBy: meta.deprecated_by });
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

      // Markdown 链接与死链检查
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
        } else if (targetFilePath && !existsSync(targetFilePath)) {
          // 尝试根据文件名模糊寻找重命名或移动后的目标
          const targetBase = basename(targetFilePath).toLowerCase();
          const candidateAbs = allFilesBaseMap.get(targetBase);
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

      // 活文档长期未复核检查 (Stale Unreviewed Check - 超过 180 天未更新)
      if (rel.startsWith('docs/') && !rel.startsWith('docs/archive/') && selfMeta.status !== 'deprecated') {
        const fileStat = await stat(abs);
        const daysSinceModified = Math.floor((Date.now() - fileStat.mtimeMs) / (1000 * 60 * 60 * 24));
        if (daysSinceModified > 180) {
          issues.push({
            file: rel,
            absPath: abs,
            type: 'stale-unreviewed',
            message: `文档长期未复核 (距今已 ${daysSinceModified} 天未校准)`,
            autoFixable: false,
            fixDetail: `建议人工复核其有效性，或使用 docpath docs touch ${rel} 确认有效`,
          });
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
    commandDrift: issues.filter((i) => i.type === 'command-drift').length,
    staleUnreviewed: issues.filter((i) => i.type === 'stale-unreviewed').length,
    unindexed: issues.filter((i) => i.type === 'unindexed').length,
    missingHeadings: issues.filter((i) => i.type === 'missing-heading').length,
    emptyDocs: issues.filter((i) => i.type === 'empty-doc').length,
    staleIndex: issues.filter((i) => i.type === 'stale-index').length,
    backlogIssues: issues.filter((i) => i.type === 'backlog-misplaced' || i.type === 'broken-evidence').length,
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
export async function fixDocumentHealth(cwd: string, options: { dryRun?: boolean } = {}): Promise<DocFixResult> {
  const { dryRun = false } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const projectRoot = dirname(resolve(docpathDir));
  const report = await diagnoseDocumentHealth(cwd);

  const healedHeadings: string[] = [];
  const repairedLinks: Array<{ file: string; from: string; to: string }> = [];
  const cleanedEmptyDocs: string[] = [];
  let refreshedIndex = false;

  let fixedCount = 0;

  // 1. 修复空文档与缺失的一级标题
  for (const issue of report.issues) {
    if (issue.type === 'empty-doc' && issue.autoFixable) {
      const inferredTitle = basename(issue.absPath, extname(issue.absPath))
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const scaffold = `# ${inferredTitle}\n\n> 本文档自动初始化。\n\n## 概述\n\n`;
      if (!dryRun) {
        await writeFile(issue.absPath, scaffold, 'utf-8');
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
        }
        healedHeadings.push(issue.file);
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

  // 4. 修复 DocPath 命令漂移 (Command Drift)
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

  // 5. 修复 Backlog 游离文件移动与证据死链自愈
  for (const issue of report.issues) {
    if (issue.type === 'backlog-misplaced' && issue.autoFixable && issue.linkData?.suggestedTarget) {
      try {
        const dest = resolve(projectRoot, issue.linkData.suggestedTarget);
        if (!dryRun) {
          await mkdir(dirname(dest), { recursive: true });
          await rename(issue.absPath, dest);
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

  // 6. 刷新活文档索引 (如果有未索引或幽灵索引条目)
  const needsIndexRefresh = report.stats.unindexed > 0 || report.stats.staleIndex > 0;
  if (needsIndexRefresh) {
    if (!dryRun) {
      await refreshProjectDocumentIndex(docpathDir, cwd);
    }
    refreshedIndex = true;
    fixedCount += report.stats.unindexed + report.stats.staleIndex;
  }

  // 7. 重新诊断剩余未自愈问题
  const afterReport = dryRun ? report : await diagnoseDocumentHealth(cwd);

  return {
    fixedCount,
    healedHeadings,
    repairedLinks,
    refreshedIndex,
    cleanedEmptyDocs,
    remainingIssues: afterReport.issues,
  };
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

  lines.push('─'.repeat(72));
  lines.push('📊 巡检指标概览:');
  lines.push('');
  lines.push(`  - 死链检查 (Broken Links)             : ${report.stats.brokenLinks === 0 ? '✅ 0 处断链' : `❌ ${report.stats.brokenLinks} 处断链`}`);
  lines.push(`  - 废弃引用 (Deprecated Reference)     : ${report.stats.deprecatedReferences === 0 ? '✅ 无过期引用' : `⚠️  ${report.stats.deprecatedReferences} 处引用已废弃文档`}`);
  lines.push(`  - 代码引用漂移 (Code Drift)           : ${report.stats.codeDrift === 0 ? '✅ 路径完全对齐' : `⚠️  ${report.stats.codeDrift} 处源码引用失效`}`);
  lines.push(`  - 命令调用漂移 (Command Drift)        : ${report.stats.commandDrift === 0 ? '✅ 语法完全有效' : `⚠️  ${report.stats.commandDrift} 处命令用法已变更`}`);
  lines.push(`  - 长期未复核 (Stale Unreviewed)       : ${report.stats.staleUnreviewed === 0 ? '✅ 时效完备' : `⚠️  ${report.stats.staleUnreviewed} 个文档超过 180 天未更新`}`);
  lines.push(`  - 未索引文档 (Unindexed)              : ${report.stats.unindexed === 0 ? '✅ 全部同步' : `⚠️  ${report.stats.unindexed} 个文档未入索引`}`);
  lines.push(`  - 缺失一级标题 (Missing H1)           : ${report.stats.missingHeadings === 0 ? '✅ 规范完备' : `⚠️  ${report.stats.missingHeadings} 个文档缺少 H1`}`);
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
