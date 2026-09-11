import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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
