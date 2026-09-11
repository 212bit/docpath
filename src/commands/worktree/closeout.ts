import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { BREADCRUMB_HEADER, writeBreadcrumb } from '../../engine/breadcrumb.js';
import { readCurrentState } from '../../utils/workspace.js';
import { gitAsync } from '../../utils/git-run.js';
import { isGitRepo, isInWorktree, listWorktrees } from '../../utils/worktree.js';
import {
  getWorktreeDiagnostics,
  resolveWorktreeManagerRoot,
  runGit,
  runGitCapture,
  samePath,
  worktreeNameFromPath,
} from './shared.js';

export async function worktreeSync(cwd: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);
  const worktreesDir = join(repoRoot, '.worktrees');

  console.log('=== worktree-sync：将 main 合入所有活跃 worktree ===');
  let synced = 0;
  let upToDate = 0;
  let skipped = 0;
  for (const wt of worktrees) {
    if (samePath(wt.path, repoRoot)) continue;
    const safeName = worktreeNameFromPath(worktreesDir, wt.path);
    const branch = wt.detached ? null : wt.branch;
    if (!branch) {
      console.log(`  ⏭️  ${safeName}: detached HEAD，跳过`);
      skipped++;
      continue;
    }
    const dirty = (await runGitCapture(wt.path, ['status', '--porcelain=v1', '--untracked-files=all'])).trim().length > 0;
    if (dirty) {
      console.log(`  ⚠️  ${safeName}: 存在未提交变更，跳过（请先收口后重跑 sync）`);
      skipped++;
      continue;
    }
    try {
      const stdout = await gitAsync(wt.path, ['merge', 'main', '--no-edit']);
      if (/Already up to date/i.test(stdout)) {
        console.log(`  ✓ ${safeName}: 已是最新`);
        upToDate++;
      } else {
        console.log(`  ✓ ${safeName}: 已合入 main`);
        synced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${safeName}: 合并失败（可能有冲突）—— ${message.split('\n').slice(-3).join(' ')}`);
      console.error(`     请进入 ${wt.path} 解决冲突后 git merge --continue`);
      skipped++;
    }
  }
  console.log(`\n=== worktree-sync 完成: 合入 ${synced}，已最新 ${upToDate}，跳过/失败 ${skipped} ===`);
}

export async function worktreeMerge(cwd: string, branchNameOrTarget?: string, allowDirtyMain?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  // FR-1: worktree 模式识别 + 前置检查
  if (!isInWorktree(cwd)) {
    console.error('❌  worktree merge 必须在 git worktree 中运行');
    console.error('    请先执行: docpath worktree create <name> 并切换到工作区');
    process.exit(1);
  }

  // 获取主仓根路径和当前分支名
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const currentBranch = (await runGitCapture(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();

  // 解析目标分支 (支持从环境变量或参数传入，支持本地和远端分支解析)
  const targetBranchEnv = process.env.CODE_MERGE_TARGET || 'main'; // 默认主干为 main
  
  let targetMergeBranch = '';
  if (branchNameOrTarget) {
    const trimmed = branchNameOrTarget.trim();
    let exists = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', trimmed], { cwd });
      exists = true;
    } catch {}
    
    if (exists) {
      targetMergeBranch = trimmed;
    } else if (!trimmed.startsWith('origin/')) {
      targetMergeBranch = `origin/${trimmed}`;
    } else {
      targetMergeBranch = trimmed;
    }
  } else {
    const remoteBranch = `origin/${targetBranchEnv}`;
    let remoteExists = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', remoteBranch], { cwd });
      remoteExists = true;
    } catch {}
    targetMergeBranch = remoteExists ? remoteBranch : targetBranchEnv;
  }

  console.log(`=== worktree-merge 启动 ===`);
  console.log(`  worktree 路径: ${cwd}`);
  console.log(`  当前源分支: ${currentBranch}`);
  console.log(`  目标分支: ${targetMergeBranch}`);

  // 1. 自动提交未提交的残余文件 (FR-2)
  const statusPorcelain = (await runGitCapture(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
  if (statusPorcelain.length > 0) {
    console.log(`[FR-2] 检测到未提交的残余文件，正在自动 commit...`);
    try {
      await runGit(cwd, ['add', '-A']);
      const scope = process.env.CODE_MERGE_SCOPE || 'worktree-merge';
      await runGit(cwd, ['commit', '-m', `chore(${scope}): merge worktree into ${targetMergeBranch}`]);
      const lastHash = (await runGitCapture(cwd, ['log', '-1', '--format=%H'])).trim();
      console.log(`  ✓ commit 完成, hash: ${lastHash}`);
    } catch (err) {
      console.error(`❌ commit 失败: ${err instanceof Error ? err.message : String(err)}`);
      console.error('   请手动解决后（如处理 pre-commit 钩子）再次运行合并命令。');
      process.exit(1);
    }
  } else {
    console.log(`[FR-2] 无变更，跳过 commit`);
  }

  // 2. 拉取远端分支
  console.log(`[FR-3] 拉取远端主干分支最新代码...`);
  try {
    await execFileAsync('git', ['fetch', 'origin'], { cwd });
    console.log(`  ✓ fetch origin 成功`);
  } catch (err) {
    console.log(`⚠️  git fetch 失败，将使用本地已有分支缓存合并: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. 执行合并主干分支 (git merge --no-ff)
  console.log(`[FR-3] 正在合并目标分支 ${targetMergeBranch}...`);
  let hasConflicts = false;
  try {
    await execFileAsync('git', ['merge', targetMergeBranch, '--no-ff'], { cwd });
    console.log(`  ✓ 合并 ${targetMergeBranch} 成功`);
  } catch (err) {
    // 检查是否产生了合并冲突
    const unmergedFiles = (await runGitCapture(cwd, ['diff', '--name-only', '--diff-filter=U'])).trim();
    if (unmergedFiles.length > 0) {
      hasConflicts = true;
      console.error(`❌  合并目标分支 ${targetMergeBranch} 时发生冲突!`);
      console.error('未合并的文件:');
      const lines = unmergedFiles.split('\n');
      for (const line of lines) {
        console.error(`  - ${line}`);
      }
      console.error('\n⚠️ 请在当前工作区解决上述冲突（推荐由 Agent 现场读取冲突标记智能解决），执行 git add 标记已解决，然后重新运行 docpath worktree merge 完成合并流程。');
      process.exit(1);
    } else {
      console.error(`❌ git merge 失败: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // 再次确认提交状态，如果合并无冲突并自动产生了 merge commit
  const postStatus = (await runGitCapture(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
  const unmergedPost = (await runGitCapture(cwd, ['diff', '--name-only', '--diff-filter=U'])).trim();
  if (unmergedPost.length > 0) {
    console.error(`❌ 仍有未解决冲突的文件，合并终止`);
    process.exit(1);
  }

  // 如果有未提交文件且非冲突（有些 merge 自动完成但没有 commit 比如 --no-commit），进行提交
  if (postStatus.length > 0) {
    console.log(`[FR-5] 提交合并后的成果...`);
    try {
      await runGit(cwd, ['add', '-A']);
      const scope = process.env.CODE_MERGE_SCOPE || 'worktree-merge';
      await runGit(cwd, ['commit', '-m', `chore(${scope}): post-merge cleanup`]);
      console.log(`  ✓ post-merge cleanup commit 成功`);
    } catch (err) {
      console.warn(`⚠️ post-merge cleanup commit 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. 看板自检 (FR-6)
  // 适配 DocPath: 检查 .docpath/backlog/backlog.md 索引与各文件的统计一致性
  console.log(`[FR-6] 进行 backlog 索引统计自检...`);
  try {
    const backlogIndex = join(cwd, '.docpath', 'backlog', 'backlog.md');
    if (existsSync(backlogIndex)) {
      const { listBacklogItems } = await import('../../engine/backlog.js');
      const items = await listBacklogItems(cwd);
      // 读取 backlog.md 内容
      const content = await readFile(backlogIndex, 'utf-8');
      
      // 简单自检：看项目清单中条目数和实际条目数是否匹配
      const lines = content.split('\n');
      const tableRows = lines.filter(l => /^\|\s*(R-\d+)\s*\|/.test(l.trim())).length;
      
      console.log(`  ✓ 实际 backlog 条目: ${items.length} 个`);
      console.log(`  ✓ backlog.md 索引表格项: ${tableRows} 行`);
      if (items.length !== tableRows) {
        console.warn(`⚠️  警告: 看板索引文件与实际条目数不一致（索引 ${tableRows} 行 vs 实际 ${items.length} 个）`);
      } else {
        console.log(`  ✓ 看板自检通过 (一致)`);
      }
    } else {
      console.log(`  ✓ 跳过自检 (未找到 backlog.md)`);
    }
  } catch (err) {
    console.warn(`⚠️ 看板自检失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. 任务生命周期状态门禁
  // 读取当前任务的 state.json，校验 phase
  const state = await readCurrentState(cwd);
  if (!state || state.phase !== 'completed') {
    console.log(`\nℹ️  当前任务 phase=${state?.phase || 'unknown'} (非 completed)。`);
    console.log(`    已将 ${targetMergeBranch} 成功合并至当前开发分支，保持开发分支同步更新。`);
    console.log(`    合回主干 (checkout ${targetBranchEnv} && git merge) 仅在 phase=completed (质量门禁和 review 均通过后) 运行。`);
    console.log(`=== worktree-merge 结束 (同步完成) ===`);
    return;
  }

  // 6. 合并当前 worktree 分支回目标主分支 (FR-7)
  console.log(`\n[FR-7] 任务已标记为 completed，开始将分支合回 ${targetBranchEnv}...`);
  try {
    // R-335 FR-1: dirty 预检收窄——仅当「合并将触碰的文件 ∩ 主仓 dirty」非空时阻塞。
    // 并发常态是 main 常有其他会话的 in-flight 文件；git merge/checkout 自身会拒绝
    // 覆盖本地未提交改动，零交集的 dirty 与本次合并无关，降级为 warning 继续。
    const rootStatus = (await runGitCapture(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).trim();
    if (rootStatus.length > 0) {
      const dirtyFiles = Array.from(new Set(rootStatus
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter(Boolean)));
      let overlapping: string[] | null = null;
      try {
        const mergeBase = (await runGitCapture(repoRoot, ['merge-base', targetBranchEnv, currentBranch])).trim();
        const mergeTouch = (await runGitCapture(repoRoot, ['diff', '--name-only', `${mergeBase}..${currentBranch}`])).split('\n').filter(Boolean);
        const repoRootBranch = (await runGitCapture(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
        const checkoutTouch = repoRootBranch !== targetBranchEnv
          ? (await runGitCapture(repoRoot, ['diff', '--name-only', `${repoRootBranch}..${targetBranchEnv}`])).split('\n').filter(Boolean)
          : [];
        const touchSet = new Set([...mergeTouch, ...checkoutTouch]);
        overlapping = dirtyFiles.filter((file) => touchSet.has(file));
      } catch {
        overlapping = null; // merge-base/diff 失败 → 无法证明零交集，走保守拒绝
      }

      if (overlapping === null || overlapping.length > 0) {
        const preview = (overlapping ?? dirtyFiles).slice(0, 12);
        console.error(`❌  主仓 dirty 文件与本次合并将触碰的文件重叠${overlapping === null ? '（交集计算失败，保守拒绝）' : ''}，拒绝自动合回:`);
        preview.forEach((file) => console.error(`     - ${file}`));
        console.error('    请先在主仓收口这些文件（commit/stash），或确认归属后使用:');
        console.error(`     docpath worktree merge --allow-dirty-main "合并与其他会话 in-flight 文件无实质冲突"`);
        if (allowDirtyMain && allowDirtyMain.trim()) {
          const state = await readCurrentState(cwd);
          await writeBreadcrumb(cwd, {
            taskId: state?.task_id || 'worktree-merge',
            step: 'worktree-merge',
            status: 'in_progress',
            context: `worktree merge --allow-dirty-main: ${allowDirtyMain}（重叠文件: ${(overlapping ?? dirtyFiles).slice(0, 5).join(', ')}）`,
          });
          console.log(`⚠️  --allow-dirty-main 已记录 breadcrumb 证据: ${allowDirtyMain}，继续合并`);
        } else {
          process.exit(1);
        }
      } else {
        console.log(`⚠️  主仓存在 ${dirtyFiles.length} 个 dirty 文件，但与本次合并将触碰的文件零重叠（并发会话 in-flight），继续合并:`);
        dirtyFiles.slice(0, 12).forEach((file) => console.log(`     - ${file}`));
        if (dirtyFiles.length > 12) console.log(`     ... 其余 ${dirtyFiles.length - 12} 个`);
      }
    }

    // 切换到 main
    console.log(`  切换主仓分支到 ${targetBranchEnv}...`);
    await runGit(repoRoot, ['checkout', targetBranchEnv]);

    // 合并 worktree 分支回 main
    console.log(`  在主仓合并分支 ${currentBranch} 到 ${targetBranchEnv}...`);
    const mergeMsg = `Merge branch '${currentBranch}' into ${targetBranchEnv}`;
    await runGit(repoRoot, ['merge', currentBranch, '--no-ff', '-m', mergeMsg]);

    const mergeHash = (await runGitCapture(repoRoot, ['log', '-1', '--format=%H'])).trim();
    
    console.log(`\n=== worktree-merge 完成 ===`);
    console.log(` · worktree: ${cwd}`);
    console.log(` · 源分支: ${currentBranch}`);
    console.log(` · 目标分支: ${targetBranchEnv}`);
    console.log(` · merge commit: ${mergeHash}`);
    console.log(` · 退出码: 0`);
  } catch (err) {
    console.error(`❌  合回 ${targetBranchEnv} 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * docpath worktree 命令入口
 */
