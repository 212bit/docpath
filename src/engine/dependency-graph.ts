/**
 * DocPath Dependency Graph Engine
 *
 * 快速解析项目源码与单测之间的静态 Import / Export 依赖拓扑图，
 * 支持循环依赖检测、传递影响推导与分层边界分析。
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname, relative, resolve, extname } from 'node:path';

export interface DependencyNode {
  file: string; // 相对项目根目录的归一化路径，如 src/engine/foo.ts
  absolutePath: string;
  imports: string[]; // 该文件直接引入的相对文件路径列表
  importedBy: string[]; // 哪些文件直接引入了该文件
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  allFiles: string[];
}

export interface DependencyCycle {
  path: string[];
  display: string;
}

export const SUPPORTED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
];

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.docpath',
  'target',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.tox',
  '.mypy_cache',
]);

/**
 * 递归扫描目录下所有支持的源码和测试文件
 */
export function scanSourceFiles(dir: string, baseDir: string = dir): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      result.push(...scanSourceFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (SUPPORTED_EXTENSIONS.includes(ext) && !entry.name.endsWith('.d.ts')) {
        result.push(relative(baseDir, fullPath).replace(/\\/g, '/'));
      }
    }
  }
  return result;
}

/**
 * 解析单个源码文件的 import/export 依赖（支持 JS/TS、Python、Go、Rust）
 */
export function extractImportSpecifiers(content: string, filePath?: string): string[] {
  const specifiers = new Set<string>();
  const ext = filePath ? extname(filePath).toLowerCase() : '';

  // 1. JavaScript / TypeScript
  if (!filePath || ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    // static import/export ... from '...'
    const importFromRegex = /(?:import|export)\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importFromRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // dynamic import('...')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // require('...')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  // 2. Python (.py)
  if (!filePath || ext === '.py') {
    // from foo.bar import baz / from .foo import bar / from ..utils import helper
    const pyFromRegex = /^\s*from\s+([.\w]+)\s+import/gm;
    let match: RegExpExecArray | null;
    while ((match = pyFromRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // import foo.bar as baz / import foo, bar
    const pyImportRegex = /^\s*import\s+([.\w\s,]+)/gm;
    while ((match = pyImportRegex.exec(content)) !== null) {
      if (match[1]) {
        const parts = match[1].split(',').map((p) => p.trim().split(/\s+as\s+/)[0].trim());
        for (const p of parts) {
          if (p) specifiers.add(p);
        }
      }
    }
  }

  // 3. Go (.go)
  if (!filePath || ext === '.go') {
    // single import "pkg/path" or import alias "pkg/path"
    const goSingleImportRegex = /^\s*import\s+(?:[\w_.]+\s+)?["']([^"']+)["']/gm;
    let match: RegExpExecArray | null;
    while ((match = goSingleImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // multiline import ( "pkg/a" \n "pkg/b" )
    const goBlockImportRegex = /import\s*\(([\s\S]*?)\)/g;
    while ((match = goBlockImportRegex.exec(content)) !== null) {
      const block = match[1];
      const itemRegex = /["']([^"']+)["']/g;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = itemRegex.exec(block)) !== null) {
        if (itemMatch[1]) specifiers.add(itemMatch[1]);
      }
    }
  }

  // 4. Rust (.rs)
  if (!filePath || ext === '.rs') {
    // mod foo;
    const rustModRegex = /^\s*(?:pub(?:\([^)]+\))?\s+)?mod\s+([a-zA-Z0-9_]+)\s*;/gm;
    let match: RegExpExecArray | null;
    while ((match = rustModRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(`mod:${match[1]}`);
    }

    // use crate::foo::bar; / use super::foo; / use foo::bar;
    const rustUseRegex = /^\s*(?:pub(?:\([^)]+\))?\s+)?use\s+([a-zA-Z0-9_:]+)/gm;
    while ((match = rustUseRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return Array.from(specifiers);
}

/**
 * 将 import specifier 解析为项目中具体存在的文件相对路径列表（支持多语言）
 */
export function resolveImportPath(
  specifier: string,
  importerRelativePath: string,
  cwd: string,
  allFiles: string[] = [],
): string[] {
  const importerExt = extname(importerRelativePath).toLowerCase();
  const importerDir = dirname(join(cwd, importerRelativePath));
  const importerRelDir = dirname(importerRelativePath).replace(/\\/g, '/');
  const results: string[] = [];

  // ── 1. JavaScript / TypeScript ──
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(importerExt)) {
    if (specifier.startsWith('.')) {
      const candidateBase = resolve(importerDir, specifier);
      if (existsSync(candidateBase) && statSync(candidateBase).isFile()) {
        results.push(relative(cwd, candidateBase).replace(/\\/g, '/'));
        return results;
      }
      const jsExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
      const baseWithoutExt = candidateBase.replace(/\.(js|mjs|cjs|ts|tsx)$/, '');
      for (const ext of jsExts) {
        const candidate = baseWithoutExt + ext;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          results.push(relative(cwd, candidate).replace(/\\/g, '/'));
          return results;
        }
      }
      for (const ext of jsExts) {
        const candidate = join(candidateBase, `index${ext}`);
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          results.push(relative(cwd, candidate).replace(/\\/g, '/'));
          return results;
        }
      }
    }
    return results;
  }

  // ── 2. Python (.py) ──
  if (importerExt === '.py') {
    // 相对引用: .foo, ..foo, .
    if (specifier.startsWith('.')) {
      let dotCount = 0;
      while (specifier[dotCount] === '.') dotCount++;
      const subModule = specifier.slice(dotCount).replace(/\./g, '/');
      let targetDir = importerDir;
      for (let i = 1; i < dotCount; i++) {
        targetDir = dirname(targetDir);
      }
      const candidateBase = subModule ? join(targetDir, subModule) : targetDir;
      const fileCandidate = `${candidateBase}.py`;
      const initCandidate = join(candidateBase, '__init__.py');

      if (existsSync(fileCandidate) && statSync(fileCandidate).isFile()) {
        results.push(relative(cwd, fileCandidate).replace(/\\/g, '/'));
      }
      if (existsSync(initCandidate) && statSync(initCandidate).isFile()) {
        results.push(relative(cwd, initCandidate).replace(/\\/g, '/'));
      }
      return results;
    }

    // 绝对引用: 模块路径可能相对于项目根目录或 src/
    const modulePath = specifier.replace(/\./g, '/');
    const possibleCandidates = [
      join(cwd, `${modulePath}.py`),
      join(cwd, modulePath, '__init__.py'),
      join(cwd, 'src', `${modulePath}.py`),
      join(cwd, 'src', modulePath, '__init__.py'),
      join(cwd, 'app', `${modulePath}.py`),
      join(cwd, 'app', modulePath, '__init__.py'),
    ];

    for (const cand of possibleCandidates) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        results.push(relative(cwd, cand).replace(/\\/g, '/'));
      }
    }

    // 模糊匹配 allFiles 中后缀一致的 python 文件
    if (results.length === 0 && allFiles.length > 0) {
      const targetSuffix = `${modulePath}.py`;
      for (const f of allFiles) {
        if (f.endsWith(targetSuffix) || f.endsWith(`${modulePath}/__init__.py`)) {
          results.push(f);
        }
      }
    }
    return results;
  }

  // ── 3. Go (.go) ──
  if (importerExt === '.go') {
    // 同目录下的所有其他 .go 文件（Go 同包内函数隐式可见）
    // 以及外部包引用匹配
    const cleanSpec = specifier.replace(/^[./]+/, '');
    for (const f of allFiles) {
      if (!f.endsWith('.go') || f === importerRelativePath) continue;
      const fDir = dirname(f).replace(/\\/g, '/');
      // 匹配同包
      if (fDir === importerRelDir) {
        results.push(f);
      } else if (fDir.endsWith(cleanSpec) || cleanSpec.endsWith(fDir)) {
        results.push(f);
      }
    }
    return results;
  }

  // ── 4. Rust (.rs) ──
  if (importerExt === '.rs') {
    if (specifier.startsWith('mod:')) {
      const modName = specifier.slice(4);
      const modFile1 = join(importerDir, `${modName}.rs`);
      const modFile2 = join(importerDir, modName, 'mod.rs');
      if (existsSync(modFile1) && statSync(modFile1).isFile()) {
        results.push(relative(cwd, modFile1).replace(/\\/g, '/'));
      }
      if (existsSync(modFile2) && statSync(modFile2).isFile()) {
        results.push(relative(cwd, modFile2).replace(/\\/g, '/'));
      }
      return results;
    }

    const segments = specifier.split('::');
    if (segments[0] === 'crate') {
      const subPath = segments.slice(1).join('/');
      const cand1 = join(cwd, 'src', `${subPath}.rs`);
      const cand2 = join(cwd, 'src', subPath, 'mod.rs');
      if (existsSync(cand1) && statSync(cand1).isFile()) {
        results.push(relative(cwd, cand1).replace(/\\/g, '/'));
      }
      if (existsSync(cand2) && statSync(cand2).isFile()) {
        results.push(relative(cwd, cand2).replace(/\\/g, '/'));
      }
    } else if (segments[0] === 'super') {
      const subPath = segments.slice(1).join('/');
      const parentDir = dirname(importerDir);
      const cand1 = join(parentDir, `${subPath}.rs`);
      const cand2 = join(parentDir, subPath, 'mod.rs');
      if (existsSync(cand1) && statSync(cand1).isFile()) {
        results.push(relative(cwd, cand1).replace(/\\/g, '/'));
      }
      if (existsSync(cand2) && statSync(cand2).isFile()) {
        results.push(relative(cwd, cand2).replace(/\\/g, '/'));
      }
    } else {
      // 针对模块名做 allFiles 匹配
      const firstSeg = segments[0];
      for (const f of allFiles) {
        if (f.endsWith(`${firstSeg}.rs`) || f.includes(`/${firstSeg}/mod.rs`)) {
          results.push(f);
        }
      }
    }
    return results;
  }

  return results;
}

/**
 * 构建完整的项目依赖图谱
 */
export async function buildDependencyGraph(
  cwd: string,
  scanDirs?: string[],
): Promise<DependencyGraph> {
  const allFiles: string[] = [];
  const targetDirs = scanDirs && scanDirs.length > 0
    ? scanDirs
    : ['src', 'tests', 'test', 'pkg', 'internal', 'cmd', 'app', 'lib'].filter((d) => existsSync(join(cwd, d)));

  if (targetDirs.length > 0) {
    for (const dir of targetDirs) {
      allFiles.push(...scanSourceFiles(join(cwd, dir), cwd));
    }
  } else {
    allFiles.push(...scanSourceFiles(cwd, cwd));
  }

  const nodes = new Map<string, DependencyNode>();

  for (const file of allFiles) {
    nodes.set(file, {
      file,
      absolutePath: join(cwd, file),
      imports: [],
      importedBy: [],
    });
  }

  for (const file of allFiles) {
    const node = nodes.get(file)!;
    const absolutePath = node.absolutePath;
    try {
      const content = await readFile(absolutePath, 'utf-8');
      const specifiers = extractImportSpecifiers(content, file);

      for (const spec of specifiers) {
        const resolvedList = resolveImportPath(spec, file, cwd, allFiles);
        for (const resolved of resolvedList) {
          if (resolved && nodes.has(resolved) && resolved !== file) {
            if (!node.imports.includes(resolved)) {
              node.imports.push(resolved);
            }
            const targetNode = nodes.get(resolved);
            if (targetNode && !targetNode.importedBy.includes(file)) {
              targetNode.importedBy.push(file);
            }
          }
        }
      }
    } catch {
      // 容错处理
    }
  }

  return { nodes, allFiles };
}

/**
 * 计算某个文件改变时的所有传递下游受影响文件 (Transitive Dependents)
 */
export function getTransitiveDependents(
  graph: DependencyGraph,
  changedFiles: string[],
): { affectedFiles: string[]; dependencyChains: Map<string, string[]> } {
  const affected = new Set<string>();
  const dependencyChains = new Map<string, string[]>();
  const queue: Array<{ file: string; chain: string[] }> = [];

  for (const f of changedFiles) {
    const normalized = f.replace(/\\/g, '/');
    if (graph.nodes.has(normalized)) {
      queue.push({ file: normalized, chain: [normalized] });
    }
  }

  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    const node = graph.nodes.get(file);
    if (!node) continue;

    for (const dep of node.importedBy) {
      if (!affected.has(dep)) {
        affected.add(dep);
        const nextChain = [...chain, dep];
        dependencyChains.set(dep, nextChain);
        queue.push({ file: dep, chain: nextChain });
      }
    }
  }

  return {
    affectedFiles: Array.from(affected),
    dependencyChains,
  };
}

/**
 * 检测项目中的所有循环依赖 (Circular Dependencies)
 */
export function findCircularDependencies(graph: DependencyGraph): DependencyCycle[] {
  const cycles: DependencyCycle[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];

  const seenCycleKeys = new Set<string>();

  function dfs(nodeId: string) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    currentPath.push(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const neighbor of node.imports) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // 发现循环
          const cycleStartIdx = currentPath.indexOf(neighbor);
          if (cycleStartIdx !== -1) {
            const cyclePath = [...currentPath.slice(cycleStartIdx), neighbor];
            // 归一化 key 避免重复报告相同环
            const sortedNodes = [...new Set(cyclePath)].sort().join(' -> ');
            if (!seenCycleKeys.has(sortedNodes)) {
              seenCycleKeys.add(sortedNodes);
              cycles.push({
                path: cyclePath,
                display: cyclePath.join(' ➔ '),
              });
            }
          }
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(nodeId);
  }

  for (const file of graph.allFiles) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  return cycles;
}
