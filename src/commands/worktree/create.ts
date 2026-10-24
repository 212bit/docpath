import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BREADCRUMB_HEADER } from '../../engine/breadcrumb.js';
import { mutateCurrentState, readCurrentState } from '../../utils/workspace.js';
import { gitAsync } from '../../utils/git-run.js';
import { isGitRepo, getGitTopLevel, createSymlink, listWorktrees } from '../../utils/worktree.js';
import {
  assertInside,
  hasTrackedFiles,
  isTrackedDocPath,
  recommendedSessionName,
  resolveWorktreePaths,
  runGit,
  samePath,
  toolSessionPattern,
  validateBacklogId,
  validateWorktreeName,
} from './shared.js';

export async function worktreeCreate(cwd: string, name: string, backlogId?: string): Promise<void> {
  // 1. 检查是否为 git 仓库
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { repoRoot, safeName, worktreesDir, worktreePath } = await resolveWorktreePaths(cwd, name);
  const targetBacklogId = backlogId ? validateBacklogId(backlogId) : null;

  // 2. 检查 worktree 是否已存在
  const worktrees = await listWorktrees(repoRoot);
  if (worktrees.some((wt) => samePath(wt.path, worktreePath))) {
    console.error(`❌  worktree 已存在: ${safeName}`);
    process.exit(1);
  }

  // 3. 创建 .worktrees 目录
  if (!existsSync(worktreesDir)) {
    await mkdir(worktreesDir, { recursive: true });
  }

  console.log(`\n🌳  创建 worktree: ${safeName}\n`);
  if (targetBacklogId) {
    console.log(`🎯  目标 backlog: ${targetBacklogId}\n`);
  }

  // 4. 调用 git worktree add
  try {
    await runGit(repoRoot, ['worktree', 'add', '-b', safeName, relative(repoRoot, worktreePath)]);
  } catch (error) {
    console.error(`❌  创建 worktree 失败`);
    if (error instanceof Error && error.message) console.error(error.message);
    process.exit(1);
  }

  // 5. 初始化 .docpath/ 并创建 symlinks
  console.log(`\n📁  配置 .docpath/ 目录...\n`);
  await initWorktreeDocpath(repoRoot, worktreePath, safeName);
  if (targetBacklogId) {
    await copyTargetBacklogContext(repoRoot, worktreePath, targetBacklogId);
  }

  // 5.1 自动软链接 node_modules 以复用依赖与构建缓存
  const mainNodeModules = join(repoRoot, 'node_modules');
  if (existsSync(mainNodeModules)) {
    console.log('  🔗 配置 node_modules 共享软链接...');
    await createSymlink(mainNodeModules, join(worktreePath, 'node_modules'), 'dir');
    console.log('    ✓ node_modules -> shared parent copy');
  }

  console.log(`\n✅  worktree 已创建: ${worktreePath}`);
  console.log(`\n从主仓库检查:`);
  console.log(`  docpath worktree doctor ${safeName}`);
  console.log(`\n进入 worktree 后:`);
  console.log(`  cd ${relative(repoRoot, worktreePath)}`);
  console.log(`  export DOCPATH_SESSION=${recommendedSessionName(safeName)}`);
  console.log(`  # tool-specific: export DOCPATH_SESSION=${toolSessionPattern(safeName, targetBacklogId || undefined)}`);
  console.log(`  docpath worktree doctor`);
  console.log(`  ${targetBacklogId ? `docpath backlog accept ${targetBacklogId}` : 'docpath next --agent'}`);
}

async function copyTargetBacklogContext(repoRoot: string, worktreePath: string, backlogId: string): Promise<void> {
  const mainBacklogDir = join(repoRoot, '.docpath', 'backlog');
  const worktreeBacklogDir = join(worktreePath, '.docpath', 'backlog');
  const sourceItem = join(mainBacklogDir, `${backlogId}.md`);
  const targetItem = join(worktreeBacklogDir, `${backlogId}.md`);
  const sourceIndex = join(mainBacklogDir, 'backlog.md');
  const targetIndex = join(worktreeBacklogDir, 'backlog.md');

  if (!existsSync(sourceItem)) {
    console.warn(`  ⚠️  未找到目标 backlog 文件: ${sourceItem}`);
    console.warn(`     worktree 已创建，但需要先在主仓库确认 ${backlogId} 存在。`);
    return;
  }

  await mkdir(worktreeBacklogDir, { recursive: true });
  if (existsSync(worktreeBacklogDir) && lstatSync(worktreeBacklogDir).isSymbolicLink()) {
    console.log(`  🎯 目标 backlog 上下文已通过 live-shared backlog 可见: ${backlogId}`);
    return;
  }
  if (!samePath(sourceItem, targetItem)) {
    await cp(sourceItem, targetItem);
  }
  if (existsSync(sourceIndex) && !samePath(sourceIndex, targetIndex)) {
    await cp(sourceIndex, targetIndex);
  }
  console.log(`  🎯 已同步目标 backlog 上下文: ${backlogId}`);
}

/**
 * 初始化 worktree 的 .docpath/ 目录
 *
 * 问题：git worktree add 会把 .docpath/ 整个复制过来（因为在 git 中）
 * 解决：清理复制的内容，重建正确的隔离/共享结构
 */
async function initWorktreeDocpath(mainRepoPath: string, worktreePath: string, name: string): Promise<void> {
  const docpathDir = join(worktreePath, '.docpath');

  console.log(`  🧹 清理 git 复制的 .docpath/ 内容...`);
  await mkdir(docpathDir, { recursive: true });

  // 清理需要隔离的目录（git 复制过来的）。如果路径已被 Git 追踪，不能删除或
  // 重写，否则新 worktree 会立即出现大量 deleted/modified 噪声。
  const toClean = ['workspace', 'tasks', 'journal', 'docs.md', 'docs-index.json'];
  const trackedItems = new Set<string>();
  for (const item of toClean) {
    if (await isTrackedDocPath(mainRepoPath, item)) {
      trackedItems.add(item);
      console.log(`    ↷ 保留 tracked ${item}`);
      continue;
    }
    const itemPath = join(docpathDir, item);
    if (existsSync(itemPath)) {
      await rm(itemPath, { recursive: true, force: true });
      console.log(`    ✓ 删除复制的 ${item}`);
    }
  }

  // 创建独立目录
  console.log(`  📁 创建独立目录...`);
  const isolatedDirs = ['workspace', 'tasks', 'journal'];
  for (const dir of isolatedDirs) {
    if (trackedItems.has(dir)) {
      console.log(`    ↷ ${dir}/ tracked copy`);
      continue;
    }
    const dirPath = join(docpathDir, dir);
    await mkdir(dirPath, { recursive: true });
    console.log(`    ✓ ${dir}/`);
  }

  // 创建 workspace 子目录
  if (!trackedItems.has('workspace')) {
    const workspaceDirs = ['sessions', 'leases', 'commands', 'bin'];
    for (const dir of workspaceDirs) {
      const dirPath = join(docpathDir, 'workspace', dir);
      await mkdir(dirPath, { recursive: true });
    }
  }

  // 共享资源策略：Git 已跟踪的目录不能替换为 symlink，否则 worktree 把目录内
  // tracked 文件全部显示为删除，add -A + merge 会把 main 的该目录删成悬空 symlink。
  // backlog 契约 = R-238 Option B（merge-mediated tracked 副本，R-273 裁定）：
  // 曾两度翻向 live-shared symlink（option C S1、R-271），均已回滚，勿再引入。
  console.log(`  🔗 配置共享资源...`);
  const sharedResources = ['backlog', 'rules', 'spec', 'templates'];
  for (const resource of sharedResources) {
    const targetPath = join(mainRepoPath, '.docpath', resource);
    const linkPath = join(docpathDir, resource);
    const tracked = await hasTrackedFiles(mainRepoPath, `.docpath/${resource}`);

    if (tracked) {
      if (!existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
        await rm(linkPath, { recursive: true, force: true });
        if (existsSync(targetPath)) {
          await cp(targetPath, linkPath, { recursive: true });
        } else {
          await mkdir(linkPath, { recursive: true });
        }
      }
      console.log(`    ✓ ${resource} -> tracked copy`);
      continue;
    }

    if (existsSync(targetPath)) {
      if (existsSync(linkPath)) {
        await rm(linkPath, { recursive: true, force: true });
      }
      const relativePath = relative(dirname(linkPath), targetPath);
      await createSymlink(relativePath, linkPath, 'dir');
      console.log(`    ✓ ${resource} -> 主仓库`);
    }
  }

  if (trackedItems.has('workspace')) {
    console.log(`  ↷ 保留 tracked workspace runtime，避免创建即产生 Git 噪声`);
  } else {
    console.log(`  🧭 写入独立 runtime 初始状态...`);
    const mainState = await readCurrentState(mainRepoPath);
    const now = new Date().toISOString();
    await mutateCurrentState(worktreePath, () => ({
      level: mainState?.level || 2,
      workflow_profile: 'standard',
      state: 'idle',
      task_id: '',
      task_title: `Worktree ${name}`,
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: now,
      updated_at: now,
    }));
    await writeFile(join(docpathDir, 'workspace', 'breadcrumb.md'), BREADCRUMB_HEADER, 'utf-8');
  }

  console.log(`  ✅ .docpath/ 配置完成`);
}

/**
 * worktree list — 列出所有 worktrees
 */
