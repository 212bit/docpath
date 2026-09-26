import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { mutateCurrentState, readCurrentState } from '../../utils/workspace.js';
import { gitAsync } from '../../utils/git-run.js';
import { isGitRepo, createSymlink, listWorktrees } from '../../utils/worktree.js';
import {
  assertInside,
  getWorktreeDiagnostics,
  hasTrackedFiles,
  resolveWorktreeManagerRoot,
  resolveWorktreePaths,
  runGit,
  runGitCapture,
  samePath,
  validateWorktreeName,
  worktreeNameFromPath,
} from './shared.js';
import { getWorktreeDoctorStatus, resolveDoctorTarget } from './query.js';

/**
 * 在销毁 worktree 前，若检测到未提交修改，自动创建安全快照 ref，防止代码丢失。
 */
export async function createEmergencyWorktreeSnapshot(
  repoRoot: string,
  worktreePath: string,
  safeName: string,
): Promise<string | null> {
  if (!existsSync(worktreePath)) return null;
  try {
    const status = (await runGitCapture(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
    if (!status) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRef = `refs/docpath-backups/${safeName}-${timestamp}`;

    // 将未跟踪文件一同纳入并生成 stash commit
    await runGit(worktreePath, ['add', '-A']);
    const commitHash = (await runGitCapture(worktreePath, ['stash', 'create', `emergency backup before remove ${safeName}`])).trim();

    if (commitHash) {
      await runGit(repoRoot, ['update-ref', backupRef, commitHash]);
      console.warn(`🛡️  【安全兜底】检测到 worktree 存在未提交修改，已自动创建安全快照: ${backupRef}`);
      console.warn(`    Commit: ${commitHash}`);
      console.warn(`    如需找回改动代码，随时可运行: git checkout ${backupRef} 或 git cherry-pick ${commitHash}\n`);
      return backupRef;
    }
  } catch (err) {
    console.warn(`⚠️  创建安全快照失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}

export async function worktreeRemove(cwd: string, name: string, force: boolean): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { repoRoot, safeName, worktreePath } = await resolveWorktreePaths(cwd, name);
  const worktrees = await listWorktrees(repoRoot);

  if (!worktrees.some((wt) => samePath(wt.path, worktreePath))) {
    console.error(`❌  worktree 不存在: ${safeName}`);
    process.exit(1);
  }

  console.log(`\n🗑️  删除 worktree: ${safeName}\n`);

  // 若包含未提交改动，自动创建安全快照
  await createEmergencyWorktreeSnapshot(repoRoot, worktreePath, safeName);

  // 调用 git worktree remove
  try {
    await runGit(repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), relative(repoRoot, worktreePath)]);
  } catch (error) {
    console.error(`❌  删除 worktree 失败`);
    if (error instanceof Error && error.message) console.error(error.message);
    console.error(`提示: 使用 --force 强制删除`);
    process.exit(1);
  }

  // 尝试删除关联的本地分支
  try {
    const branchExists = (await runGitCapture(repoRoot, ['branch', '--list', safeName])).trim().length > 0;
    if (branchExists) {
      console.log(`🧹  正在删除本地分支: ${safeName}`);
      await runGit(repoRoot, ['branch', force ? '-D' : '-d', safeName]);
    }
  } catch (branchError) {
    console.warn(`⚠️  删除本地分支 ${safeName} 失败 (可能未完全合并): ${branchError instanceof Error ? branchError.message : String(branchError)}`);
    console.warn(`提示: 如果确认合并或丢弃该分支，可在主仓库运行: git branch -D ${safeName}`);
  }

  console.log(`\n✅  worktree 已删除: ${safeName}`);
}

/**
 * worktree prune — 自动清理已合并、已完成且没有未提交变更的 worktrees
 */
export async function worktreePrune(cwd: string, force: boolean): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);
  const worktreesDir = join(repoRoot, '.worktrees');

  const candidates = worktrees.filter((wt) => !samePath(wt.path, repoRoot));

  if (candidates.length === 0) {
    console.log('📭  没有可清理的 worktrees');
    return;
  }

  console.log(`\n🧹  开始自动清理已合并的 worktrees...\n`);

  let prunedCount = 0;
  for (const wt of candidates) {
    const safeName = worktreeNameFromPath(worktreesDir, wt.path);
    const diagnostics = await getWorktreeDiagnostics(repoRoot, wt.path, safeName, false);

    // 自动清理规则：
    // - 正常模式：已完成 (completed) 且已合并到 main (mergedToMain) 且无未提交修改 (!dirty)
    // - force 模式：只要已完成 (completed)，即使 dirty 或未合并也强制清理
    const shouldPrune = force
      ? diagnostics.completed
      : (diagnostics.completed && diagnostics.mergedToMain && !diagnostics.dirty);

    if (shouldPrune) {
      console.log(`🗑️  清理 worktree: ${safeName} (${wt.path})`);
      // 若 dirty 则创建快照
      await createEmergencyWorktreeSnapshot(repoRoot, wt.path, safeName);
      try {
        await runGit(repoRoot, ['worktree', 'remove', ...(force ? ['--force'] : []), relative(repoRoot, wt.path)]);
        prunedCount++;

        // 尝试删除分支
        try {
          const branchExists = (await runGitCapture(repoRoot, ['branch', '--list', safeName])).trim().length > 0;
          if (branchExists) {
            console.log(`    🧹 删除本地分支: ${safeName}`);
            await runGit(repoRoot, ['branch', force ? '-D' : '-d', safeName]);
          }
        } catch (branchError) {
          console.warn(`    ⚠️ 删除本地分支 ${safeName} 失败: ${branchError instanceof Error ? branchError.message : String(branchError)}`);
        }
      } catch (error) {
        console.error(`  ❌ 清理 worktree ${safeName} 失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const reasons: string[] = [];
      if (!diagnostics.completed) reasons.push('任务未完成 (phase !== completed)');
      if (!diagnostics.mergedToMain) reasons.push('分支未合并到 main');
      if (diagnostics.dirty) reasons.push('有未提交变更 (dirty)');
      console.log(`⏭️  跳过 worktree: ${safeName} (原因: ${reasons.join(', ')})`);
    }
  }

  console.log(`\n✅  自动清理完成，共清理了 ${prunedCount} 个 worktree。`);
}

/**
 * worktree repair [name] — 自动校准共享/隔离契约，修复漂移
 */
export async function worktreeRepair(cwd: string, name?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { safeName, worktreePath } = await resolveDoctorTarget(cwd, name);
  const docpathDir = join(worktreePath, '.docpath');
  const repoRoot = await resolveWorktreeManagerRoot(cwd);

  console.log(`\n🔧  开始修复 worktree 契约: ${safeName}`);
  console.log(`    path: ${worktreePath}`);

  // 1. 修复被误追踪的隔离路径 (git rm --cached)
  const isolatedPaths = ['.docpath/tasks/current', '.docpath/workspace', '.docpath/journal'];
  for (const relPath of isolatedPaths) {
    const isTracked = (await runGitCapture(worktreePath, ['ls-files', '--', relPath])).trim().length > 0;
    if (isTracked) {
      console.log(`  🧹 发现被误追踪的隔离路径: ${relPath}，正在执行 untrack...`);
      try {
        await runGit(worktreePath, ['rm', '--cached', '-r', relPath]);
        console.log(`    ✓ 成功从 git 暂存区移除: ${relPath}`);
      } catch (err) {
        console.warn(`    ⚠️ 移除失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 2. 纠正 .gitignore 规则 (移除 backlog 规则)
  const gitignores = [join(worktreePath, '.gitignore'), join(repoRoot, '.gitignore')];
  for (const gitignorePath of gitignores) {
    if (existsSync(gitignorePath)) {
      try {
        const content = await readFile(gitignorePath, 'utf-8');
        const lines = content.split('\n');
        const nextLines = lines.filter((line) => line.trim() !== '/.docpath/backlog' && line.trim() !== '.docpath/backlog');
        if (nextLines.length !== lines.length) {
          await writeFile(gitignorePath, nextLines.join('\n'), 'utf-8');
          console.log(`  ✓  已在 ${relative(repoRoot, gitignorePath)} 中移除了 backlog 排除规则`);
        }
      } catch (err) {
        console.warn(`  ⚠️ 写入 .gitignore 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. 重新校准共享资源 (symlink vs tracked copy)
  console.log(`  🔗 重新校准共享与合并资源引用...`);
  const sharedResources = ['backlog', 'rules', 'spec', 'templates'];
  for (const resource of sharedResources) {
    const targetPath = join(repoRoot, '.docpath', resource);
    const linkPath = join(docpathDir, resource);
    // backlog 同为 tracked→copy（R-238 Option B，R-273 回滚 R-271 的强制 symlink）：
    // repair 会把 symlink 形态的 backlog 转回 tracked 副本。
    const tracked = await hasTrackedFiles(repoRoot, `.docpath/${resource}`);

    try {
      if (tracked) {
        // Tracked: should be a directory copy (not a symlink)
        if (!existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
          await rm(linkPath, { recursive: true, force: true });
          if (existsSync(targetPath)) {
            await cp(targetPath, linkPath, { recursive: true });
          } else {
            await mkdir(linkPath, { recursive: true });
          }
          console.log(`    ✓ ${resource} 修正为 tracked copy`);
        } else {
          console.log(`    ✓ ${resource} 已经是 tracked copy`);
        }
      } else {
        // Untracked or force live-shared: should be a symlink pointing to the main checkout
        if (existsSync(targetPath)) {
          let shouldCreate = true;
          if (existsSync(linkPath)) {
            if (lstatSync(linkPath).isSymbolicLink()) {
              shouldCreate = false; // already symlink
            } else {
              await rm(linkPath, { recursive: true, force: true });
            }
          }
          if (shouldCreate) {
            const relativePath = relative(dirname(linkPath), targetPath);
            await createSymlink(relativePath, linkPath, 'dir');
            console.log(`    ✓ ${resource} 修正为 symlink -> ${relativePath}`);
          } else {
            console.log(`    ✓ ${resource} 已经是 symlink`);
          }
        }
      }
    } catch (err) {
      console.warn(`    ⚠️ 修正 ${resource} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n🩺  修复完成，重新进行诊断...`);
  const { errors, warnings, checks } = await getWorktreeDoctorStatus(cwd, name);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${check.label}: ${check.detail}`);
  }

  if (errors > 0) {
    console.error(`\n❌  worktree 修复后仍存在 ${errors} 个错误。请检查底层问题。`);
    process.exit(1);
  } else {
    console.log(`\n✅  worktree 契约修复成功！所有卡点均已消除。`);
  }
}

/**
 * worktree merge [branch] — 自动合并 worktree 内的改动并合回主干
 */
/**
 * R-335 FR-5: 将 main 合入所有活跃 worktree —— main 前进后其他树一键同步，
 * 替代文档场景 3 的手动逐树 `git merge main`。dirty 树跳过并报告（不动他人 in-flight 文件）。
 */
