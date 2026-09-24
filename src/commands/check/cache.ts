/**
 * R-331: check scope 缓存。
 *
 * 时延构成实测（2026-09-11）：tsc 1.5s + tsup ~1s + node --test 全量套件 51.9s（95%）。
 * dogfooding 循环里大量 check 属「代码范围无变更」的重复过门（rules/backlog/docs/簿记类
 * 改动），却每次都付全量套件成本。本模块以「代码范围 digest」判定可否复用上次绿色
 * check 的重 runner（typecheck/build/test/lint）判定——结构门禁（plan/task-file/
 * major-change-gate 等）永远新鲜执行。
 *
 * fail-safe 语义：digest 无法计算（非 git 仓）、上次结果非绿色全量、digest 不一致
 * ——任一不满足即回落全量，宁可慢不放水。缓存的判定本身来自一次真实全量绿色 check，
 * 门禁强度不变。
 */

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './types.js';
import { readLastCheckEvidence } from '../../utils/workspace-evidence.js';

/** 通用多语言默认源码与构建配置路径 */
export const DEFAULT_CHECK_CODE_SCOPE_PATHS = [
  // ── 通用源码与测试目录 ──
  'src',
  'pkg',
  'cmd',
  'internal',
  'api',
  'app',
  'crates',
  'lib',
  'tests',
  'test',
  'scripts',

  // ── 通用多语言包管理、构建与依赖锁 ──
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'tsconfig*.json',
  'tsup.config.*',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'pyproject.toml',
  'requirements*.txt',
  'Pipfile*',
  'pom.xml',
  'build.gradle*',
  'Makefile',
  'makefile',
  'justfile',
  'Dockerfile*',
];

export const CHECK_CODE_SCOPE_PATHS = DEFAULT_CHECK_CODE_SCOPE_PATHS;

function runGitOptional(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * 代码范围 digest：scope 内全部文件（tracked + untracked）字节内容的联合哈希。
 *
 * 内容寻址而非 HEAD+status：同一份字节在「未提交 dirty」与「已提交」两种 git 态下
 * digest 不变——closeout 链路（check 绿 → commit → done 内部再 check）因此命中缓存，
 * 不付第二次全量。文件增删改任何一字节都会改变 digest。
 * 非 git 仓或 git 失败返回 null（调用方回落全量）。
 */
export function computeCodeScopeDigest(cwd: string, customScopePaths?: string[]): string | null {
  const scopePaths = (customScopePaths && customScopePaths.length > 0)
    ? Array.from(new Set([...customScopePaths, ...DEFAULT_CHECK_CODE_SCOPE_PATHS]))
    : DEFAULT_CHECK_CODE_SCOPE_PATHS;
  const listing = runGitOptional(cwd, [
    'ls-files', '-co', '--exclude-standard', '--', ...scopePaths,
  ]);
  if (listing === null) return null;
  const files = listing.split('\n').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    try {
      hash.update(file);
      hash.update(readFileSync(join(cwd, file)));
    } catch {
      return null;
    }
  }
  return hash.digest('hex');
}


const REUSABLE_CATEGORIES = new Set(['compile', 'test', 'lint']);

/**
 * 尝试复用上次绿色 check 的重 runner 判定。
 * 返回 null 表示不可复用（调用方执行全量 runProjectChecks）。
 */
export async function tryReuseCachedHeavyChecks(
  docpathDir: string,
  cwd: string,
  customScopePaths?: string[],
): Promise<CheckResult[] | null> {
  const digest = computeCodeScopeDigest(cwd, customScopePaths);
  if (!digest) return null;

  let evidence = null;
  try {
    evidence = await readLastCheckEvidence(docpathDir);
  } catch {
    return null;
  }
  if (!evidence || !evidence.passed) return null;
  // R-350: 环境豁免的"通过"来自工具链不可用，不是真实判定——不作为缓存源，
  // 否则下次会拿豁免结果当绿色基线复用，环境修好后仍显示豁免（--no-cache 同理）。
  if (evidence.env_exempt) return null;
  // 只有全量运行的证据才可作为缓存源：lite/降档产物没有 test 判定，复用它会放水。
  if (!evidence.checks.some((check) => check.category === 'test')) return null;
  if (!evidence.code_scope_digest || evidence.code_scope_digest !== digest) return null;

  const heavy = evidence.checks.filter((check) => REUSABLE_CATEGORIES.has(check.category || ''));
  if (heavy.length === 0) return null;

  return heavy.map((check) => ({
    name: check.name,
    passed: check.passed,
    category: (REUSABLE_CATEGORIES.has(check.category || '') ? check.category : undefined) as CheckResult['category'],
    severity: check.severity === 'error' || check.severity === 'warning' ? check.severity : undefined,
    environment_failure: check.environment_failure,
    environment_exemptible: check.environment_exemptible,
    // R-357: 标记来自缓存复用，渲染层据此显式提示「未实际执行」，不伪装成真跑的绿。
    cached: true,
    output: '♻️  缓存复用：代码范围（src/tests/构建配置）自上次绿色 check 无变更，判定沿用该次结果。--no-cache 可强制重跑。',
  }));
}
