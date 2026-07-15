/**
 * scan-existing 目录树扫描 (FR-2 前置 / S2)
 *
 * 扫描项目根目录树，生成缩进树形结构文本，用于 init --scan-existing 生成
 * 非模板化 architecture.md 的"真实目录结构"段落。
 *
 * noise 排除按 spec §4.d：
 *   1. 复用项目根 .gitignore（经 `git check-ignore` 判定）
 *   2. 硬黑名单兜底（即使未被 .gitignore 覆盖，也排除下列目录/文件）
 *
 * 不带 scan-existing 时 init 不调用本模块，行为与现状逐字节一致 (NFR-1)。
 */

import { readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';

/**
 * 项目级硬黑名单（scan-existing 视角）。
 * 任何以此名称出现的顶层/任意层目录都被排除，兜底 .gitignore 未覆盖项。
 */
export const SCAN_EXISTING_HARD_BLOCKLIST = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.worktrees',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'out',
]);

/** 单个树节点 */
export interface TreeNode {
  name: string;
  path: string; // 相对 cwd
  type: 'dir' | 'file';
  children?: TreeNode[];
}

/** 判定某路径是否被项目 .gitignore 忽略（git 无仓库时返回 false，退回纯黑名单）。 */
function isGitIgnored(cwd: string, absPath: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', absPath], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 判定某名称是否命中硬黑名单。 */
export function isHardBlocklisted(name: string): boolean {
  return SCAN_EXISTING_HARD_BLOCKLIST.has(name);
}

/**
 * 判定某节点是否应被 scan-existing 排除。
 * 目录命中硬黑名单 → 排除（不递进）；
 * 文件/目录被 .gitignore 忽略 → 排除。
 */
export function isExcludedForScan(cwd: string, absPath: string, name: string, isDir: boolean): boolean {
  if (isDir && isHardBlocklisted(name)) return true;
  if (isHardBlocklisted(name)) return true;
  if (isGitIgnored(cwd, absPath)) return true;
  return false;
}

interface ScanOptions {
  /** 树最大深度（根为 0）。避免对超深项目（如 monorepo 的 node_modules 残留分支）爆栈。 */
  maxDepth?: number;
  /** 每个目录最多保留的子项数（超出按字典序截断，其余折叠为 "… (N more)"）。 */
  maxEntriesPerDir?: number;
}

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ENTRIES = 40;

/**
 * 递归扫描项目根，返回去噪后的 TreeNode。
 * 排序：目录在前，文件在后；各自字典序。
 */
export async function scanProjectTree(cwd: string, options: ScanOptions = {}): Promise<TreeNode> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = options.maxEntriesPerDir ?? DEFAULT_MAX_ENTRIES;

  async function walk(absDir: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return [];
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      const isDir = entry.isDirectory();
      if (isExcludedForScan(cwd, abs, entry.name, isDir)) continue;
      const rel = relative(cwd, abs).split(sep).join('/');
      const node: TreeNode = { name: entry.name, path: rel, type: isDir ? 'dir' : 'file' };
      if (isDir) {
        node.children = await walk(abs, depth + 1);
      }
      nodes.push(node);
    }

    // 排序：目录在前、文件在后；各自字典序
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // 截断：每目录最多 maxEntries 项，其余折叠
    if (nodes.length > maxEntries) {
      const kept = nodes.slice(0, maxEntries);
      const omitted = nodes.length - maxEntries;
      kept.push({ name: `… (${omitted} more)`, path: '', type: 'file' });
      return kept;
    }
    return nodes;
  }

  const rootName = cwd.split(sep).pop() || 'project';
  const children = await walk(cwd, 0);
  return { name: rootName, path: '.', type: 'dir', children };
}

/** 将 TreeNode 渲染成缩进树形文本（├──/└── + 缩进）。 */
export function renderTree(node: TreeNode): string {
  const lines: string[] = [`${node.name}/`];
  renderChildren(node.children ?? [], '', lines);
  return lines.join('\n');
}

function renderChildren(children: TreeNode[], prefix: string, lines: string[]): void {
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    const suffix = child.type === 'dir' ? '/' : '';
    lines.push(`${prefix}${branch}${child.name}${suffix}`);
    if (child.type === 'dir' && child.children && child.children.length > 0) {
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      renderChildren(child.children, nextPrefix, lines);
    }
  });
}
