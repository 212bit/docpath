/**
 * DocPath Test Impact Analysis (TIA) Engine
 *
 * 依据源码依赖拓扑图与 Git 改动影响面，自动推导需要运行的最小单测集合。
 */

import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import {
  buildDependencyGraph,
  getTransitiveDependents,
  type DependencyGraph,
} from './dependency-graph.js';

export interface TestImpactReport {
  modified_files: string[];
  impacted_tests: string[];
  dependency_chains: Array<{
    test_file: string;
    trigger_file: string;
    chain: string[];
  }>;
  stats: {
    modified_count: number;
    impacted_test_count: number;
    total_test_count: number;
    saved_test_count: number;
    reduction_ratio: number;
  };
}

/**
 * 获取 Git 改动文件集合 (未提交修改 + 暂存区)
 */
export function getGitModifiedFiles(cwd: string, sinceRef?: string): string[] {
  const files = new Set<string>();
  try {
    if (sinceRef) {
      const out = execSync(`git diff --name-only ${sinceRef}..HEAD`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      for (const f of out.split('\n')) {
        if (f.trim()) files.add(f.trim().replace(/\\/g, '/'));
      }
    } else {
      // 1. 工作区未跟踪与已修改
      const statusOut = execSync('git status --porcelain', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      for (const line of statusOut.split('\n')) {
        if (!line.trim()) continue;
        const filePath = line.slice(3).trim().replace(/\\/g, '/');
        // 处理重命名 R foo -> bar
        const resolvedPath = filePath.includes('->') ? filePath.split('->')[1].trim() : filePath;
        if (resolvedPath) files.add(resolvedPath);
      }

      // 2. 暂存区与最新提交差异
      const diffOut = execSync('git diff --name-only HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      for (const f of diffOut.split('\n')) {
        if (f.trim()) files.add(f.trim().replace(/\\/g, '/'));
      }
    }
  } catch {
    // 容错处理
  }
  return Array.from(files);
}

/**
 * 判断是否为测试文件（支持 JS/TS, Python, Go, Rust）
 */
export function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const base = basename(norm);
  const ext = norm.substring(norm.lastIndexOf('.')).toLowerCase();

  // 1. 位于测试目录
  if (norm.startsWith('tests/') || norm.startsWith('test/') || norm.includes('/tests/') || norm.includes('/test/')) {
    return true;
  }

  // 2. JS / TS 测试
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    if (/\.(test|spec)\.(mjs|ts|js|jsx|tsx|cjs)$/i.test(base)) {
      return true;
    }
  }

  // 3. Go 测试
  if (ext === '.go') {
    if (base.endsWith('_test.go')) {
      return true;
    }
  }

  // 4. Python 测试
  if (ext === '.py') {
    if (base.startsWith('test_') || base.endsWith('_test.py')) {
      return true;
    }
  }

  // 5. Rust 测试
  if (ext === '.rs') {
    if (norm.startsWith('tests/') || base.endsWith('_test.rs') || base === 'tests.rs') {
      return true;
    }
  }

  return false;
}

/**
 * 依据文件名规范做直觉匹配（支持多语言：JS/TS, Python, Go, Rust）
 */
function findDirectNameMatchedTests(
  modifiedFile: string,
  allTestFiles: string[],
): string[] {
  const rawBase = basename(modifiedFile)
    .replace(/\.(ts|js|tsx|jsx|mjs|cjs|go|py|rs)$/i, '')
    .toLowerCase();
  const matches: string[] = [];

  for (const testFile of allTestFiles) {
    const testBase = basename(testFile).toLowerCase();
    const testBaseClean = testBase
      .replace(/\.(test|spec)\.(mjs|ts|js|jsx|tsx|cjs)$/i, '')
      .replace(/^test_/, '')
      .replace(/_test\.(go|py|rs)$/i, '')
      .replace(/\.(py|go|rs|mjs|ts|js)$/i, '');

    if (
      testBaseClean === rawBase ||
      testBaseClean.startsWith(`${rawBase}-`) ||
      testBaseClean.startsWith(`${rawBase}_`) ||
      rawBase.startsWith(`${testBaseClean}-`) ||
      rawBase.startsWith(`${testBaseClean}_`) ||
      testBase.includes(rawBase)
    ) {
      matches.push(testFile);
    }
  }

  return matches;
}

/**
 * 执行 Test Impact Analysis 推导
 */
export async function analyzeTestImpact(
  cwd: string,
  options: { files?: string[]; since?: string; graph?: DependencyGraph } = {},
): Promise<TestImpactReport> {
  const graph = options.graph || (await buildDependencyGraph(cwd));
  const allTestFiles = graph.allFiles.filter(isTestFile);

  let modifiedFiles = options.files && options.files.length > 0
    ? options.files.map((f) => f.replace(/\\/g, '/'))
    : getGitModifiedFiles(cwd, options.since);

  // 过滤只保留存在于项目中的文件
  modifiedFiles = modifiedFiles.filter((f) => graph.nodes.has(f) || isTestFile(f) || f.startsWith('src/') || f.startsWith('pkg/'));

  const impactedTestsSet = new Set<string>();
  const dependencyChains: TestImpactReport['dependency_chains'] = [];

  for (const modFile of modifiedFiles) {
    // 1. 如果修改的本身就是测试文件，必须包含自身
    if (isTestFile(modFile)) {
      impactedTestsSet.add(modFile);
      dependencyChains.push({
        test_file: modFile,
        trigger_file: modFile,
        chain: [modFile],
      });
      continue;
    }

    // 2. 通过依赖图谱查找所有引用了该文件的测试
    const { affectedFiles, dependencyChains: chains } = getTransitiveDependents(graph, [modFile]);
    const affectedTests = affectedFiles.filter(isTestFile);

    for (const testFile of affectedTests) {
      impactedTestsSet.add(testFile);
      dependencyChains.push({
        test_file: testFile,
        trigger_file: modFile,
        chain: chains.get(testFile) || [modFile, testFile],
      });
    }

    // 3. 补充基于文件名约定的测试
    const directMatches = findDirectNameMatchedTests(modFile, allTestFiles);
    for (const testFile of directMatches) {
      if (!impactedTestsSet.has(testFile)) {
        impactedTestsSet.add(testFile);
        dependencyChains.push({
          test_file: testFile,
          trigger_file: modFile,
          chain: [modFile, `[name-match] ${testFile}`],
        });
      }
    }
  }

  const impactedTests = Array.from(impactedTestsSet).sort();
  const totalTestCount = allTestFiles.length;
  const savedTestCount = Math.max(0, totalTestCount - impactedTests.length);
  const reductionRatio = totalTestCount > 0 ? Number((savedTestCount / totalTestCount).toFixed(2)) : 0;

  return {
    modified_files: modifiedFiles,
    impacted_tests: impactedTests,
    dependency_chains: dependencyChains,
    stats: {
      modified_count: modifiedFiles.length,
      impacted_test_count: impactedTests.length,
      total_test_count: totalTestCount,
      saved_test_count: savedTestCount,
      reduction_ratio: reductionRatio,
    },
  };
}
