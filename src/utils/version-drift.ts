import { existsSync, readFileSync, realpathSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, sep, dirname, delimiter } from 'node:path';
import { getGitTopLevel } from './worktree.js';

export interface BinaryDriftReport {
  drifted: boolean;
  binary_path: string;
  /** 仓库本地构建入口；尚无 dist 时为 null */
  repo_local_build: string | null;
  reason: string;
}

/**
 * R-335 FR-4（落实 R-332）: 检测执行中的 docpath 是否为仓库本地构建。
 *
 * 判据是路径而非版本号——R-334 实测全局安装与仓库 dev 同为 0.1.1 但行为漂移
 * （agent_flow 等新门禁被旧二进制静默吞掉）。仅对 docpath 源码仓库本身提示：
 * 用户项目里全局安装就是正装，警告只会是噪声。
 */
export async function detectBinaryDrift(cwd: string): Promise<BinaryDriftReport | null> {
  const argv1 = process.argv[1];
  if (!argv1) return null;

  let repoRoot = '';
  try {
    repoRoot = await getGitTopLevel(cwd);
  } catch {
    return null;
  }
  if (!repoRoot || !existsSync(join(repoRoot, 'package.json'))) return null;

  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as { name?: string };
    if (pkg.name !== 'docpath') return null;
  } catch {
    return null;
  }

  let binaryReal: string;
  try {
    binaryReal = realpathSync(argv1);
  } catch {
    binaryReal = resolve(argv1);
  }
  const repoReal = realpathSync(repoRoot);
  const drifted = binaryReal !== repoReal && !binaryReal.startsWith(repoReal + sep);
  const localBuild = join(repoReal, 'dist', 'index.js');
  const hasLocalBuild = existsSync(localBuild);

  return {
    drifted,
    binary_path: binaryReal,
    repo_local_build: hasLocalBuild ? localBuild : null,
    reason: drifted
      ? hasLocalBuild
        ? `执行中的 docpath 来自仓库外安装（${binaryReal}），可能缺少仓库最新工作流行为（R-332 实测：同版本号仍会行为漂移）`
        : `执行中的 docpath 来自仓库外安装，且仓库尚无本地构建（先 pnpm build）`
      : '',
  };
}

/** agent 输出用的紧凑提示行；未漂移返回 null */
export function renderBinaryDriftWarning(report: BinaryDriftReport | null): string | null {
  if (!report?.drifted) return null;
  const target = report.repo_local_build ?? '<repo>/dist/index.js（先 pnpm build）';
  return `⚠️  版本漂移 (R-332/R-335): ${report.reason}\n    建议: node ${target} <command>，或在仓库内 pnpm build 后 pnpm link 注册开发版`;
}

// ─── R-332: PATH 影子检测（仓库开发版侧的主动视角） ───

export interface PathShadowReport {
  /** PATH 上 docpath 经 realpath 后的绝对路径（仓库外安装） */
  shadow_path: string;
  /** 影子安装的包版本；向上回溯不到 package.json 时为 null */
  shadow_version: string | null;
  repo_version: string | null;
  repo_root: string;
}

function readPackageInfo(dir: string): { name?: unknown; version?: unknown } | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { name?: unknown; version?: unknown };
  } catch {
    return null;
  }
}

/** 纯 PATH 扫描找第一个可执行的 docpath（免子进程，热路径安全）。 */
function findPathBinary(name: string): string | null {
  const pathVar = process.env.PATH ?? '';
  const win = process.platform === 'win32';
  const exts = win ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(delimiter) : [''];
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext}`);
      try {
        const st = statSync(candidate);
        if (!st.isFile()) continue;
        if (!win && (st.mode & 0o111) === 0) continue;
        return candidate;
      } catch {
        // 目录不存在/不可读：跳过
      }
    }
  }
  return null;
}

/** 从 bin 文件路径向上回溯具名包根（npm/pnpm 全局安装的 package.json 定位）。 */
function findOwningPackage(binPath: string, pkgName: string, maxDepth = 8): { root: string; version: string | null } | null {
  let dir = dirname(binPath);
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const pkg = readPackageInfo(dir);
    if (pkg?.name === pkgName) {
      return { root: dir, version: typeof pkg.version === 'string' ? pkg.version : null };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 从 startDir 向上找 docpath 源码 checkout 根（免子进程；bin/docpath.js 存在性即开发入口证据）。 */
function findCheckoutRoot(startDir: string, maxDepth = 8): { root: string; version: string | null } | null {
  let dir = resolve(startDir);
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const pkg = readPackageInfo(dir);
    if (pkg?.name === 'docpath' && existsSync(join(dir, 'bin', 'docpath.js'))) {
      return { root: dir, version: typeof pkg.version === 'string' ? pkg.version : null };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * R-332: 仓库开发版运行时检测 PATH 上的旧版 docpath 影子。
 *
 * 与 R-335 detectBinaryDrift（检查"当前执行二进制在仓库外"）互补：旧全局
 * 二进制不含检测模块，在仓库内永远静默（0.1.1 实测），只能由开发版侧先行
 * 报出影子事实。判据同为路径而非版本号——仓库外影子即行为漂移事实。
 * 仅 docpath 源码 checkout 生效（纯 fs 回溯，无子进程，热路径零负担）；
 * pnpm link --global 对齐后 PATH 解析进仓库 → 零噪音。
 */
export async function detectPathShadowing(cwd: string): Promise<PathShadowReport | null> {
  const checkout = findCheckoutRoot(cwd);
  if (!checkout) return null;

  const found = findPathBinary('docpath');
  if (!found) return null;
  let shadowReal = found;
  try {
    shadowReal = realpathSync(found);
  } catch {
    shadowReal = resolve(found);
  }
  let repoReal = checkout.root;
  try {
    repoReal = realpathSync(checkout.root);
  } catch {
    // tmpdir 等路径无 symlink 时保持原值
  }
  // link 已指向本仓库（开发版已注册全局）→ 双轨合一，无影子。
  if (shadowReal === repoReal || shadowReal.startsWith(repoReal + sep)) return null;

  const owner = findOwningPackage(shadowReal, 'docpath');
  if (!owner) return null; // 定位不到归属包（包装脚本）：不提示无法证实的事

  // 影子实为指向本 checkout 的 npm/pnpm link（bare 命令从任意目录启动）→
  // 双轨已对齐，不报影子；仓库外路径的行为差异检测归 detectBinaryDrift 管。
  if (owner.root === repoReal || owner.root.startsWith(repoReal + sep)) return null;

  return {
    shadow_path: shadowReal,
    shadow_version: owner.version,
    repo_version: checkout.version,
    repo_root: repoReal,
  };
}

/** PATH 影子的紧凑 advisory 提示行；无影子返回 null */
export function renderPathShadowWarning(shadow: PathShadowReport | null): string | null {
  if (!shadow) return null;
  const same = shadow.shadow_version !== null && shadow.shadow_version === shadow.repo_version;
  const ver = shadow.shadow_version ? `（${shadow.shadow_version}${same ? '，同号不同行为' : ''}）` : '';
  return `⚠️  PATH 影子 (R-332): docpath${ver} 解析到 ${shadow.shadow_path}，非本仓库开发版${shadow.repo_version ? `（${shadow.repo_version}）` : ''}\n    建议: 仓库内验证用 node bin/docpath.js <command>，或 pnpm link --global 对齐双轨；详见 docpath install --doctor`;
}

/**
 * nag-once：同一影子指纹（路径+双方版本对）只 advisory 一次，状态变化再提示。
 * 经 stderr 输出一行，不进 stdout 机器解析流、不占 next 紧凑字段；
 * 指纹持久化失败时宁可重复提示也不吞掉。
 */
export function takePathShadowAdvisory(shadow: PathShadowReport | null): string | null {
  if (!shadow) return null;
  const nagFile = join(shadow.repo_root, '.docpath', 'workspace', 'version-shadow-nag.json');
  const fingerprint = `${shadow.shadow_path}|${shadow.shadow_version ?? 'unknown'}|${shadow.repo_version ?? 'unknown'}`;
  try {
    const state = JSON.parse(readFileSync(nagFile, 'utf-8')) as { fingerprint?: string };
    if (state?.fingerprint === fingerprint) return null;
  } catch {
    // 首次提示或指纹文件缺失/损坏：继续
  }
  const dir = dirname(nagFile);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(nagFile, `${JSON.stringify({ fingerprint })}\n`, 'utf-8');
  } catch {
    // 指纹落盘失败不影响本次提示（最坏退化为每次提示）
  }
  return renderPathShadowWarning(shadow);
}
