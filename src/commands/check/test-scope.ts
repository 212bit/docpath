/**
 * check 测试执行优化（R-3xx，性能任务）：
 *
 * 背景（实测 2026-09）：`docpath check` 的整体耗时约 97% 落在 `node --test` 全量
 * 测试套件上（87 文件 / 857 用例墙钟 ~80s）。t source 范围：
 *   1. 87 个测试文件被 node --test **全并发**运行，墙钟≈单文件串行的 8 倍（9.9s→80s），
 *      大量时间耗在 CPU 摊薄与共享 ~/.docpath/projects.sqlite 的竞态等待/重试上。
 *   2. 无论改动多小，只要不命中 scope 缓存（开发期命中率低）就付全量测试成本。
 *
 * 本模块提供两级减载，均为**受控、fail-safe 到慢**（宁慢不放水）：
 *   A. 受控并发 + 进程隔离（默认 full 模式也生效，普适提速）：
 *      给 node --test 注入 `--test-concurrency=<n>`（cpu/2，上限 8）与
 *      `--test-isolation=process`，避免全并发摊薄与 sqlite 竞态重试。
 *   B. 影响面减载（--test-scope=touched 显式开启）：
 *      按当时 git 改动的源文件，粗匹配出**可能受影响**的测试文件子集，只跑它们。
 *      命中"核心路径/超规模"时强制回落全量（沿用 quick-guard 的 RISKY_PATH_PATTERNS）。
 */

import { readFileSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, basename, dirname, relative, sep } from 'path';
import { execFileSync } from 'child_process';
import { availableParallelism } from 'os';
import { minimatch } from 'minimatch';

/**
 * 通用多语言核心高危回落模式：
 * 1. 通用多语言包管理、构建与依赖锁文件（任何语言项目改动均须全量回归）
 * 2. CI/CD 与基础设施配置
 * 3. DocPath 调度内核路径
 */
export const TEST_SCOPE_RISKY_PATTERNS: Array<{ pattern: string; reason: string }> = [
  // ── 通用多语言构建、包管理与依赖锁 ──
  { pattern: 'package.json', reason: 'Node 包配置被改' },
  { pattern: 'pnpm-lock.yaml', reason: 'Node 依赖锁被改' },
  { pattern: 'package-lock.json', reason: 'Node 依赖锁被改' },
  { pattern: 'yarn.lock', reason: 'Node 依赖锁被改' },
  { pattern: 'tsconfig*.json', reason: 'TypeScript 编译配置被改' },
  { pattern: 'go.mod', reason: 'Go 依赖配置被改' },
  { pattern: 'go.sum', reason: 'Go 依赖锁被改' },
  { pattern: 'Cargo.toml', reason: 'Rust 包配置被改' },
  { pattern: 'Cargo.lock', reason: 'Rust 依赖锁被改' },
  { pattern: 'pyproject.toml', reason: 'Python 项目配置被改' },
  { pattern: 'requirements*.txt', reason: 'Python 依赖被改' },
  { pattern: 'Pipfile*', reason: 'Python 依赖被改' },
  { pattern: 'pom.xml', reason: 'Java Maven 配置被改' },
  { pattern: 'build.gradle*', reason: 'Java Gradle 配置被改' },
  { pattern: 'Makefile', reason: 'Makefile 构建配置被改' },
  { pattern: 'justfile', reason: 'Justfile 构建配置被改' },
  { pattern: 'Dockerfile*', reason: 'Docker 镜像配置被改' },
  { pattern: '.github/**', reason: 'CI 工作流配置被改' },

  // ── 核心生命周期调度器与收口门禁（DocPath 核心调度） ──
  { pattern: 'src/commands/agent.ts', reason: 'agent 核心调度被改，测试必须全量' },
  { pattern: 'src/commands/check.ts', reason: 'check 核心调度被改，测试必须全量' },
  { pattern: 'src/commands/done.ts', reason: 'done 核心收口被改，测试必须全量' },
  { pattern: 'src/commands/quick-done.ts', reason: 'quick-done 核心收口被改，测试必须全量' },
  { pattern: 'src/commands/runtime.ts', reason: 'runtime 核心调度被改，测试必须全量' },
  { pattern: 'src/commands/check/**', reason: 'check 子命令被改，测试必须全量' },
  { pattern: 'src/commands/worktree/**', reason: 'worktree 子命令被改，测试必须全量' },
  { pattern: 'src/commands/worktree.ts', reason: 'worktree 主命令被改，测试必须全量' },
  { pattern: 'src/engine/**', reason: '核心工作流引擎被改' },
  { pattern: 'src/utils/git-run.ts', reason: 'git 调用工具被多命令共享' },
  { pattern: 'src/utils/workspace*.ts', reason: 'workspace 状态被改' },
  { pattern: 'src/utils/task-files*.ts', reason: '任务文件契约被改' },
  { pattern: 'src/utils/doc-parser*.ts', reason: '文档解析被改' },
  { pattern: 'src/utils/evidence*.ts', reason: '证据持久化被多命令共享' },
];

/** 变更文件数上限：超过则回落全量（减载场景多为 <5 文件） */
export const TEST_SCOPE_MAX_FILES = 8;

/** 低冲突文件计数上限：只跑相关测试 + 未匹配文件 ≤ 该值时才有收益，否则回落全量。 */
export const TEST_SCOPE_MAX_SELECTED = 24;

/** 影响面减载 vs 全量的收益阈值：只有当相关测试占全量比率 < 该值才值得减载。 */
export const TEST_SCOPE_RATIO_THRESHOLD = 0.75;

/** 获取当时 git 改动的源文件（staged + unstaged + untracked）。非 git 仓返回 null。 */
export function getChangedSourceFiles(cwd: string): string[] | null {
  try {
    const out = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 3)
      // porcelain=v1 行格式为固定 `XY <path>`（XY 两位状态码 + 1 空格），slice(3) 取路径。
      // 注意：不能先 trim 行首（会吃掉 ' M' 的 1 格，把 `src/...` 错切错成 `rc/...`）。
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ''));
  } catch {
    return null;
  }
}

/** 计算受控测试并发数：实际可用并行度/2，下限 2，上限 8。 */
export function computeTestConcurrency(): number {
  try {
    const n = availableParallelism();
    return Math.max(2, Math.min(8, Math.floor(n / 2)));
  } catch {
    return 4;
  }
}

/** 判断改动文件是否触及安全回落的核心路径（支持项目自定义 patterns）。 */
export function touchesRiskyPath(changedFile: string, customPatterns?: string[]): boolean {
  const normalized = changedFile.replace(/^\.\//, '');
  if (customPatterns && customPatterns.length > 0) {
    if (customPatterns.some((pattern) => minimatch(normalized, pattern, { dot: true }))) {
      return true;
    }
  }
  return TEST_SCOPE_RISKY_PATTERNS.some(({ pattern }) => minimatch(normalized, pattern, { dot: true }));
}

/** 清理测试文件名中的通用测试后缀与语言扩展，提取纯模块基名。 */
function normalizeTestBaseName(name: string): string {
  return basename(name)
    .replace(/\.(test|spec)\.(mjs|ts|js|jsx|tsx|mts|cts)$/i, '')
    .replace(/(_test|Test|Tests)\.(go|py|rs|java|cpp|c|php)$/i, '')
    .replace(/^test_([a-zA-Z0-9_\-]+)\.py$/i, '$1');
}

/** 清理源码文件名中的语言扩展，提取纯模块基名。 */
function normalizeSourceBaseName(name: string): string {
  return basename(name)
    .replace(/\.(ts|mts|cts|js|mjs|cjs|jsx|tsx|go|py|rs|java|cpp|c|h|hpp|php)$/i, '');
}

/**
 * 判断一个测试文件是否与某改动文件相关（多语言通用推导：基名一致 / 动态前缀 / 镜像子目录）。
 */
export function testRelatesToFile(testFile: string, changedFile: string): boolean {
  const t = normalizeTestBaseName(testFile).toLowerCase();
  const c = normalizeSourceBaseName(changedFile).toLowerCase();

  // 1. 基名完全一致（例如 auth.ts ↔ auth.test.ts / auth_test.go / test_auth.py）
  if (t === c) return true;

  // 2. 前缀包含（例如 user ↔ user-auth.test.ts 或 auth-service.ts ↔ auth.test.ts）
  if (t.startsWith(`${c}-`) || t.startsWith(`${c}_`)) return true;
  if (c.startsWith(`${t}-`) || c.startsWith(`${t}_`)) return true;

  // 3. 动态首词词元匹配（例如 check-cache.ts ↔ check-runner.test.ts 共享 check 词元）
  const tToken = t.split(/[-_.]/)[0];
  const cToken = c.split(/[-_.]/)[0];
  if (tToken && cToken && tToken.length >= 3 && tToken === cToken) return true;

  // 4. 目录命名（tests/<module>/ 或 src/<module>/）与改动文件所在目录镜像匹配
  const tDir = dirname(testFile).split(sep).filter(Boolean).join('/').toLowerCase().replace(/^(tests?|src|pkg|internal)\//, '');
  const cDir = dirname(changedFile).split(sep).filter(Boolean).join('/').toLowerCase().replace(/^(tests?|src|pkg|internal)\//, '');
  return tDir !== '.' && cDir !== '.' && (tDir === cDir || tDir.endsWith(cDir) || cDir.endsWith(tDir));
}

/**
 * 影响面减载：给定改动文件，选出"可能受影响"的测试文件相对路径子集。
 * 返回 null 表示应回落全量（改动触及核心 / 超规模 / 无可用粒度）。
 */
export function selectTouchedTestFiles(
  cwd: string,
  changedFiles: string[],
  testFiles: string[],
  customRiskyPatterns?: string[],
): string[] | null {
  if (changedFiles.length === 0) return testFiles; // 无改动 → 无减载信息，回全量
  if (changedFiles.length > TEST_SCOPE_MAX_FILES) return null; // 改动过多，减载无益
  if (changedFiles.some((f) => touchesRiskyPath(f, customRiskyPatterns))) return null; // 触及核心 → 强制全量

  const relevant = testFiles.filter((tf) => changedFiles.some((cf) => testRelatesToFile(tf, cf)));
  if (relevant.length === 0) return null; // 匹配不到 → 回全量，宁可慢不漏
  if (relevant.length > TEST_SCOPE_MAX_SELECTED) return null;
  const ratio = relevant.length / testFiles.length;
  if (ratio > TEST_SCOPE_RATIO_THRESHOLD) return null; // 收益太小，回全量
  return relevant;
}

/**
 * 构建受控的 node --test 命令。
 *  - files：相对路径测试文件集；空数组表示全量（用 glob 通配）。
 *  - concurrency：注入 --test-concurrency；isolate 时注入 --test-isolation=process。
 * 返回可直接执行的 shell 命令字符串。
 */
export function buildNodeTestCommand(
  cwd: string,
  files: string[],
  opts: { concurrency?: number; isolation?: boolean } = {},
): string {
  const concurrency = opts.concurrency ?? computeTestConcurrency();
  const isolation = opts.isolation ?? true;
  const argv = ['node', '--test'];
  argv.push(`--test-concurrency=${concurrency}`);
  if (isolation) argv.push('--test-isolation=process');
  if (files.length === 0) {
    argv.push('tests/*.test.mjs');
  } else {
    for (const f of files) {
      argv.push(JSON.stringify(f));
    }
  }
  return `${argv.join(' ')} 2>&1`;
}

/** 列出约定目录下的测试文件（相对路径）。 */
export function listTestFiles(cwd: string): string[] {
  const testsDir = join(cwd, 'tests');
  try {
    const entries = readdirSync(testsDir, { encoding: 'utf-8' });
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(testsDir, entry);
      let isDir = false;
      try { isDir = statSync(full).isDirectory(); } catch { continue; }
      if (isDir) {
        // 子目录递归
        const sub = readdirSync(full, { encoding: 'utf-8' });
        for (const s of sub) {
          if (/\.test\.(mjs|ts)$/.test(s)) files.push(relative(cwd, join(full, s)));
        }
      } else if (/\.test\.(mjs|ts)$/.test(entry)) {
        files.push(relative(cwd, full));
      }
    }
    return files.sort();
  } catch {
    return [];
  }
}

/** 解析受控测试命令。返回 { command, scope: 'full'|'touched', matchedFiles, reusedReason? }。 */
export function resolveTestCommand(
  cwd: string,
  opts: { testScope?: 'full' | 'touched'; concurrency?: number; isolation?: boolean; customRiskyPatterns?: string[] } = {},
): { command: string; scope: 'full' | 'touched'; matchedFiles: string[] } {
  const concurrency = opts.concurrency ?? computeTestConcurrency();
  const isolation = opts.isolation ?? true;

  // full 模式：受控并发 + 隔离，但保留全量覆盖（不筛选文件）
  if (opts.testScope !== 'touched') {
    const cmd = buildNodeTestCommand(cwd, [], { concurrency, isolation });
    return { command: cmd, scope: 'full', matchedFiles: [] };
  }

  // touched 模式：影响面减载
  const changedFiles = getChangedSourceFiles(cwd);
  const testFiles = listTestFiles(cwd);
  if (changedFiles === null || testFiles.length === 0) {
    const cmd = buildNodeTestCommand(cwd, [], { concurrency, isolation });
    return { command: cmd, scope: 'full', matchedFiles: [] };
  }
  const selected = selectTouchedTestFiles(cwd, changedFiles, testFiles, opts.customRiskyPatterns);
  if (selected === null) {
    const cmd = buildNodeTestCommand(cwd, [], { concurrency, isolation });
    return { command: cmd, scope: 'full', matchedFiles: [] };
  }
  const cmd = buildNodeTestCommand(cwd, selected, { concurrency, isolation });
  return { command: cmd, scope: 'touched', matchedFiles: selected };
}

/** 解析 Go 语言测试命令（支持根据改动文件定向推导 Go 包路径）。 */
export function resolveGoTestCommand(
  cwd: string,
  opts: { testScope?: 'full' | 'touched'; customRiskyPatterns?: string[] } = {},
): { command: string; name: string } {
  if (opts.testScope === 'full') {
    return { command: 'go test ./... 2>&1', name: 'Go 单元测试' };
  }
  const changedFiles = getChangedSourceFiles(cwd);
  if (!changedFiles || changedFiles.length === 0 || changedFiles.length > TEST_SCOPE_MAX_FILES || changedFiles.some((f) => touchesRiskyPath(f, opts.customRiskyPatterns))) {
    return { command: 'go test ./... 2>&1', name: 'Go 单元测试' };
  }
  const goFiles = changedFiles.filter((f) => f.endsWith('.go'));
  if (goFiles.length === 0) {
    return { command: 'go test ./... 2>&1', name: 'Go 单元测试' };
  }
  const pkgs = Array.from(new Set(goFiles.map((f) => {
    const dir = dirname(f).split(sep).join('/');
    return dir === '.' ? '.' : `./${dir}/...`;
  }))).sort();

  if (pkgs.length === 0) {
    return { command: 'go test ./... 2>&1', name: 'Go 单元测试' };
  }
  return {
    command: `go test ${pkgs.join(' ')} 2>&1`,
    name: `Go 单元测试（影响面 ${pkgs.length} 包）`,
  };
}