/**
 * Worktree 依赖隔离诊断（R-467）
 *
 * 背景：`worktree create` 会把主仓库 `node_modules` 以软链接形式挂进 worktree
 * （见 commands/worktree/create.ts 5.1），因此 worktree 内的依赖安装（如
 * `pnpm add -D vitest`）实际**写穿到主仓库**的 `node_modules`，worktree 分支里
 * 不留任何痕迹。由此产生两个 git 无法观测的副作用：
 *
 *   1. 消失型：worktree 被 `remove`/`prune` 后（git 会清理链接指向物），主干
 *      `test:ui` 报 ERR_MODULE_NOT_FOUND —— 典型的「合并成功但主干挂了」。
 *   2. 幽灵型：worktree 里装了包但没写进 `package.json`，本地全绿，干净安装/CI 挂。
 *
 * 本模块只做**只读观测**：比对 package.json 声明与 node_modules 实际安装，
 * 产出漂移事实，供 doctor/finish 在合并前预见、在报错后定位。不自动安装依赖。
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export type DependencyDriftKind =
  /** 共享软链接：worktree 内安装会写穿主仓库（结构风险，非错误） */
  | 'shared-symlink'
  /** 声明在 package.json 但未安装：安装命令在此 cwd 会失败 */
  | 'missing'
  /** 已安装但未声明：干净安装/CI 会失败（幽灵依赖） */
  | 'phantom';

export interface DependencyDriftItem {
  kind: DependencyDriftKind;
  packageName?: string;
  detail: string;
}

export type NodeModulesForm = 'symlink' | 'directory' | 'missing';

export interface DependencyIsolationReport {
  /** node_modules 在 worktree 中的存在形态 */
  form: NodeModulesForm;
  /** 软链接解析后的真实路径（form === 'symlink' 时有值） */
  linkTarget: string | null;
  /** 该链接是否指向主仓库 node_modules（即写穿主仓库） */
  sharedWithMain: boolean;
  /** 主仓库是否存在同样的软链接（用于判定「worktree 特征」） */
  mainUsesSymlink: boolean;
  drift: DependencyDriftItem[];
  /** 是否检测到漂移（missing/phantom/symlink 均计入，symlink 为结构性提示） */
  drifted: boolean;
  summary: string;
}

function canonicalize(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** 依赖声明清单：dependencies + devDependencies + optionalDependencies + peerDependencies */
function declaredPackages(pkgJsonPath: string): Set<string> | null {
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const block = pkg[field];
      if (block && typeof block === 'object') {
        for (const name of Object.keys(block as Record<string, unknown>)) names.add(name);
      }
    }
    return names;
  } catch {
    return null;
  }
}

/**
 * 已安装的顶层包名（含 scope，如 `@types/node`）。
 * 跳过 `.bin`/`.cache`/`.pnpm` 等非包条目；EACCES/ENOENT 等读取异常按跳过处理。
 */
function installedPackages(nodeModulesPath: string): Set<string> {
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync(nodeModulesPath);
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      try {
        for (const scoped of readdirSync(join(nodeModulesPath, entry))) {
          if (scoped.startsWith('.')) continue;
          names.add(`${entry}/${scoped}`);
        }
      } catch {
        // 忽略不可读的 scope 目录
      }
      continue;
    }
    names.add(entry);
  }
  return names;
}

/**
 * 只读检测某个 checkout 的依赖隔离形态与漂移。
 *
 * @param checkoutPath 被检测的 worktree / 主仓库路径
 * @param mainRepoRoot 主仓库根路径（用于判定「共享软链接」与主仓库自身形态）
 */
export function inspectDependencyIsolation(checkoutPath: string, mainRepoRoot?: string): DependencyIsolationReport {
  const nodeModulesPath = join(checkoutPath, 'node_modules');
  const pkgJsonPath = join(checkoutPath, 'package.json');

  const empty: DependencyIsolationReport = {
    form: 'missing',
    linkTarget: null,
    sharedWithMain: false,
    mainUsesSymlink: false,
    drift: [],
    drifted: false,
    summary: 'no node_modules',
  };

  if (!existsSync(pkgJsonPath)) {
    return empty;
  }

  const mainNodeModules = mainRepoRoot ? join(mainRepoRoot, 'node_modules') : null;
  let mainUsesSymlink = false;
  if (mainNodeModules && existsSync(mainNodeModules)) {
    try {
      mainUsesSymlink = lstatSync(mainNodeModules).isSymbolicLink();
    } catch {
      mainUsesSymlink = false;
    }
  }

  if (!existsSync(nodeModulesPath)) {
    const declared = declaredPackages(pkgJsonPath) ?? new Set<string>();
    const names = [...declared].sort();
    const drift: DependencyDriftItem[] = declared.size > 0
      ? [{
          kind: 'missing',
          packageName: names[0],
          detail: `node_modules 缺失，${declared.size} 个声明依赖未安装（如 ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' …' : ''}）：此 checkout 上的 build/test 会 MODULE_NOT_FOUND`,
        }]
      : [];
    return {
      form: 'missing',
      linkTarget: null,
      sharedWithMain: false,
      mainUsesSymlink,
      drift,
      drifted: drift.length > 0,
      summary: 'node_modules missing',
    };
  }

  let form: NodeModulesForm = 'directory';
  let linkTarget: string | null = null;
  try {
    if (lstatSync(nodeModulesPath).isSymbolicLink()) {
      form = 'symlink';
      linkTarget = realpathSync(nodeModulesPath);
    }
  } catch {
    form = 'directory';
  }

  // 两侧都做 realpath 归一：macOS 上 /tmp 与 /private/tmp 是同一路径的两种写法，
  // 直接字符串比较会把「确实共享主仓库」误判成「指向别处」。
  const sharedWithMain = form === 'symlink'
    && mainNodeModules !== null
    && linkTarget !== null
    && canonicalize(linkTarget) === canonicalize(mainNodeModules);

  const declared = declaredPackages(pkgJsonPath);
  const installed = installedPackages(nodeModulesPath);
  const drift: DependencyDriftItem[] = [];

  if (form === 'symlink') {
    drift.push({
      kind: 'shared-symlink',
      detail: sharedWithMain
        ? `node_modules 是指向主仓库的软链接（${linkTarget}）：此 checkout 内任何依赖安装都会写穿主仓库；worktree 删除时该链接与其中安装的包一并消失，合并后的主干才会暴露（R-467）`
        : `node_modules 是指向 ${linkTarget} 的软链接：安装会写穿该目标路径，删除本 checkout 不会自动复原`,
    });
  }

  if (declared && declared.size > 0) {
    const missing = [...declared].filter((name) => !installed.has(name)).sort();
    if (missing.length > 0) {
      drift.push({
        kind: 'missing',
        packageName: missing[0],
        detail: `${missing.length} 个声明依赖未安装（如 ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}）：此 checkout 上的 build/test 会 MODULE_NOT_FOUND`,
      });
    }
    const phantom = [...installed].filter((name) => !declared.has(name)).sort();
    if (phantom.length > 0) {
      drift.push({
        kind: 'phantom',
        packageName: phantom[0],
        detail: `${phantom.length} 个包已安装但未在 package.json 声明（如 ${phantom.slice(0, 3).join(', ')}${phantom.length > 3 ? ' …' : ''}）：干净安装/CI 会失败（幽灵依赖）`,
      });
    }
  }

  return {
    form,
    linkTarget,
    sharedWithMain,
    mainUsesSymlink,
    drift,
    drifted: drift.length > 0,
    summary: drift.length === 0
      ? `node_modules ${form}, no drift`
      : `node_modules ${form}, ${drift.length} drift signal(s)`,
  };
}

/**
 * 渲染只读漂移提示块（供 doctor / finish / merge 共用）。
 * 返回空数组表示无漂移，调用方无需打印。
 */
export function renderDependencyDrift(report: DependencyIsolationReport): string[] {
  if (!report.drifted) return [];
  const lines = ['⚠️  dependency isolation drift (R-467):'];
  for (const item of report.drift) {
    lines.push(`    [${item.kind}] ${item.detail}`);
  }
  if (report.drift.some((item) => item.kind === 'shared-symlink')) {
    lines.push('    → 合并/删除前先确认主仓库 node_modules 完整性：node -e "require.resolve(\'<pkg>\')" 或 pnpm install --frozen-lockfile');
  }
  return lines;
}
