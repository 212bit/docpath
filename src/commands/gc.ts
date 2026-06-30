/**
 * docpath:gc — workspace aging dry-run/force plus historical task directory GC.
 */

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { listBacklogItems } from '../engine/backlog.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { cleanupWorkspace, planWorkspaceCleanup, renderWorkspaceCleanupSummary } from '../utils/workspace-cleanup.js';
import { getGitTopLevel, isInWorktree, isGitRepo, listWorktrees } from '../utils/worktree.js';

interface GcOptions {
  cwd: string;
  force?: boolean;
  delete?: boolean;
  allowWorktreeArchive?: boolean;
}

interface GcCandidate {
  taskId: string;
  path: string;
  targetPath: string;
  reason: string;
}

interface WorktreeGcCandidate {
  name: string;
  path: string;
  dirty: boolean;
  completed: boolean;
  mergedToMain: boolean;
  recommendation: string;
}

function isTaskDirName(name: string): boolean {
  return /^T-\d{8}(?:-|$)/.test(name);
}

async function collectProtectedTaskIds(cwd: string): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  const state = await readCurrentState(cwd);
  if (state?.task_id) protectedIds.add(state.task_id);

  const backlog = await listBacklogItems(cwd);
  for (const item of backlog) {
    if (item.status === 'active' && item.links.task) {
      protectedIds.add(item.links.task);
    }
  }

  return protectedIds;
}

function runGitText(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function inferMainWorktree(worktrees: Awaited<ReturnType<typeof listWorktrees>>): string | null {
  for (const wt of worktrees) {
    try {
      if (!wt.bare && lstatSync(join(wt.path, '.git')).isDirectory()) return wt.path;
    } catch {
      // Continue scanning.
    }
  }
  return worktrees.find((wt) => !wt.bare)?.path || null;
}

function worktreeName(mainRoot: string, path: string): string {
  const worktreesDir = join(mainRoot, '.worktrees');
  const rel = relative(worktreesDir, path);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(/[\\/]/)[0] || path;
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

async function collectWorktreeGcCandidates(cwd: string): Promise<WorktreeGcCandidate[]> {
  try {
    if (!(await isGitRepo(cwd))) return [];
    const top = await getGitTopLevel(cwd);
    const worktrees = await listWorktrees(top);
    const mainRoot = inferMainWorktree(worktrees);
    if (!mainRoot) return [];

    const candidates: WorktreeGcCandidate[] = [];
    for (const wt of worktrees) {
      if (wt.bare || wt.path === mainRoot) continue;
      const state = await readCurrentState(wt.path);
      const completed = state?.phase === 'completed';
      if (!completed) continue;

      const dirty = runGitText(wt.path, ['status', '--porcelain=v1', '--untracked-files=all']).length > 0;
      let mergedToMain = false;
      try {
        const head = runGitText(wt.path, ['rev-parse', 'HEAD']);
        execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], { cwd: mainRoot, stdio: 'ignore' });
        mergedToMain = true;
      } catch {
        mergedToMain = false;
      }
      const name = worktreeName(mainRoot, wt.path);
      candidates.push({
        name,
        path: wt.path,
        dirty,
        completed,
        mergedToMain,
        recommendation: !dirty && mergedToMain
          ? `docpath worktree remove ${name}`
          : dirty
            ? `commit/stash changes in ${name}, then run docpath worktree remove ${name}`
            : `merge or intentionally discard ${name} before removal`,
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

export async function gcCommand(options: GcOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const tasksDir = join(docpathDir, 'tasks');
  const doneDir = join(tasksDir, 'done');

  if (!existsSync(tasksDir)) {
    throw new Error('未找到 .docpath/tasks 目录，请先运行 docpath init');
  }

  const protectedTaskIds = await collectProtectedTaskIds(cwd);
  const entries = await readdir(tasksDir, { withFileTypes: true });
  const candidates: GcCandidate[] = [];

  // Worktree guard: historical task dirs under tasks/ are tracked snapshots shared
  // via branch merges. Moving them en masse to tasks/done/ inside a worktree
  // produces large merge noise (every moved file shows as D at the old location
  // and ?? under done/) without archiving the current task (which is protected).
  // Scope this sweep to the main checkout; allow explicit opt-in via flag.
  const inWorktree = isInWorktree(cwd);
  const skipHistoricalArchive = inWorktree && !options.allowWorktreeArchive;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'current' || entry.name === 'done') continue;
    if (!isTaskDirName(entry.name)) continue;
    if (protectedTaskIds.has(entry.name)) continue;
    if (skipHistoricalArchive) continue;

    candidates.push({
      taskId: entry.name,
      path: join(tasksDir, entry.name),
      targetPath: join(doneDir, entry.name),
      reason: '非活跃历史任务目录',
    });
  }

  const workspaceCleanup = options.force
    ? await cleanupWorkspace(cwd)
    : await planWorkspaceCleanup(cwd);
  const worktreeCandidates = await collectWorktreeGcCandidates(cwd);

  console.log('\n🧹  DocPath GC\n');
  console.log(`模式: ${options.force ? (options.delete ? 'delete' : 'archive') : 'dry-run'}`);
  console.log('');
  for (const line of renderWorkspaceCleanupSummary(cwd, workspaceCleanup)) {
    console.log(line);
  }
  console.log('');
  console.log('Worktree cleanup candidates');
  console.log(`候选 worktrees: ${worktreeCandidates.length}`);
  for (const candidate of worktreeCandidates) {
    console.log(`- ${candidate.name}`);
    console.log(`  path: ${candidate.path}`);
    console.log(`  completed: ${candidate.completed}`);
    console.log(`  dirty: ${candidate.dirty}`);
    console.log(`  merged_to_main: ${candidate.mergedToMain}`);
    console.log(`  recommendation: ${candidate.recommendation}`);
  }
  console.log('  note: docpath gc only reports worktree cleanup; remove explicitly with docpath worktree remove.');
  console.log('');
  console.log('Historical task directories');
  if (skipHistoricalArchive) {
    console.log('⚠️  worktree 模式：跳过历史任务归档（批量移动会在合并时产生噪声）。');
    console.log('    如需归档，请在 main 运行 docpath gc --force，或加 --allow-worktree-archive 显式开锁。');
    console.log(`候选目录: 0 (skipped in worktree)`);
    if (!options.force) {
      console.log('\n[dry-run] 未修改文件。实际清理运行: docpath gc --force');
    }
    return;
  }
  console.log(`候选目录: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('✅  没有可清理的历史任务目录');
    if (!options.force) {
      console.log('\n[dry-run] 未修改文件。实际清理运行: docpath gc --force');
    }
    return;
  }

  for (const candidate of candidates) {
    console.log(`- ${candidate.taskId}`);
    console.log(`  from: ${candidate.path}`);
    console.log(`  ${options.delete ? 'delete' : 'to'}: ${candidate.targetPath}`);
    console.log(`  reason: ${candidate.reason}`);
  }

  if (!options.force) {
    console.log('\n[dry-run] 未修改文件。实际清理运行: docpath gc --force');
    return;
  }

  await mkdir(doneDir, { recursive: true });
  for (const candidate of candidates) {
    if (options.delete) {
      await rm(candidate.path, { recursive: true, force: true });
      continue;
    }
    if (existsSync(candidate.targetPath)) {
      await rm(candidate.targetPath, { recursive: true, force: true });
    }
    await rename(candidate.path, candidate.targetPath);
  }

  console.log(`\n✅  已${options.delete ? '删除' : '归档'} ${candidates.length} 个历史任务目录`);
}
