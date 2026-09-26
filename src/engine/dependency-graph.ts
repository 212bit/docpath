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

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

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
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.docpath') {
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
 * 解析单个源码文件的 import/export 依赖
 */
export function extractImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();

  // 1. static import ... from '...'
  const importFromRegex = /(?:import|export)\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importFromRegex.exec(content)) !== null) {
    if (match[1]) specifiers.add(match[1]);
  }

  // 2. dynamic import('...')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    if (match[1]) specifiers.add(match[1]);
  }

  // 3. require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    if (match[1]) specifiers.add(match[1]);
  }

  return Array.from(specifiers);
}

/**
 * 将 import specifier 解析为项目中具体存在的文件相对路径
 */
export function resolveImportPath(
  specifier: string,
  importerRelativePath: string,
  cwd: string,
): string | null {
  // 仅解析相对路径引用 (./ 或 ../)
  if (!specifier.startsWith('.')) {
    return null;
  }

  const importerDir = dirname(join(cwd, importerRelativePath));
  const candidateBase = resolve(importerDir, specifier);

  // 1. 尝试完全匹配
  if (existsSync(candidateBase) && statSync(candidateBase).isFile()) {
    return relative(cwd, candidateBase).replace(/\\/g, '/');
  }

  // 2. 尝试替换扩展名 (例如 .js 对应源码中的 .ts / .mjs 等)
  const baseWithoutExt = candidateBase.replace(/\.(js|mjs|cjs|ts|tsx)$/, '');
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = baseWithoutExt + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(cwd, candidate).replace(/\\/g, '/');
    }
  }

  // 3. 尝试 /index.[ext]
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = join(candidateBase, `index${ext}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(cwd, candidate).replace(/\\/g, '/');
    }
  }

  return null;
}

/**
 * 构建完整的项目依赖图谱
 */
export async function buildDependencyGraph(
  cwd: string,
  scanDirs: string[] = ['src', 'tests'],
): Promise<DependencyGraph> {
  const allFiles: string[] = [];
  for (const dir of scanDirs) {
    allFiles.push(...scanSourceFiles(join(cwd, dir), cwd));
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
      const specifiers = extractImportSpecifiers(content);

      for (const spec of specifiers) {
        const resolved = resolveImportPath(spec, file, cwd);
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
