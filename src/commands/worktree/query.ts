import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { readCurrentState } from '../../utils/workspace.js';
import { gitAsync } from '../../utils/git-run.js';
import { isGitRepo, getGitTopLevel, isInWorktree, listWorktrees } from '../../utils/worktree.js';
import { detectBinaryDrift, renderBinaryDriftWarning } from '../../utils/version-drift.js';
import {
  assertInside,
  getWorktreeDiagnostics,
  getWorktreeState,
  hasTrackedFiles,
  recommendedSessionName,
  resolveWorktreeManagerRoot,
  resolveWorktreePaths,
  runGitCapture,
  samePath,
  worktreeNameFromPath,
  type WorktreeDiagnostics,
} from './shared.js';

export async function worktreeList(cwd: string, agentMode = false): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const worktrees = await listWorktrees(repoRoot);

  if (worktrees.length === 0) {
    console.log('📭  没有 worktrees');
    return;
  }

  // R-335 FR-5: --agent 聚合视图 —— 编排方一次读取所有树的 task/phase/合并态/建议动作
  if (agentMode) {
    const worktreesDir = join(repoRoot, '.worktrees');
    const lines: string[] = ['worktrees:'];
    for (const wt of worktrees) {
      const isMain = samePath(wt.path, repoRoot);
      const safeName = isMain ? 'main' : worktreeNameFromPath(worktreesDir, wt.path);
      const branch = wt.detached ? `detached@${wt.head.substring(0, 7)}` : (wt.branch || 'unknown');
      lines.push(`  - name: ${safeName}`);
      lines.push(`    path: ${wt.path}`);
      lines.push(`    branch: ${branch}`);
      if (isMain) {
        lines.push('    role: main');
        continue;
      }
      const state = await readCurrentState(wt.path).catch(() => null);
      const diagnostics = await getWorktreeDiagnostics(repoRoot, wt.path, safeName, isMain);
      lines.push(`    task: ${state?.task_id || 'idle'}`);
      lines.push(`    phase: ${state?.phase || 'idle'}`);
      lines.push(`    dirty: ${diagnostics.dirty}`);
      lines.push(`    merged_to_main: ${diagnostics.mergedToMain}`);
      lines.push(`    managed: ${diagnostics.managed}`);
      let action: string;
      if (!diagnostics.managed) {
        action = `docpath worktree repair ${safeName}`;
      } else if (diagnostics.completed && diagnostics.mergedToMain && diagnostics.safeToRemove) {
        action = `docpath worktree remove ${safeName}`;
      } else if (diagnostics.completed && !diagnostics.mergedToMain && !diagnostics.dirty) {
        action = 'docpath worktree merge';
      } else if (diagnostics.completed && diagnostics.dirty) {
        action = `commit/stash 后: docpath worktree merge`;
      } else if (state?.task_id) {
        action = `继续任务 (phase=${state.phase})，完成后 docpath done 收口`;
      } else {
        action = 'docpath next --agent';
      }
      lines.push(`    suggested_action: ${action}`);
    }
    console.log(lines.join('\n'));
    return;
  }

  console.log('\n🌳  Worktrees:\n');
  const worktreesDir = join(repoRoot, '.worktrees');
  for (const wt of worktrees) {
    const isBare = wt.bare ? ' (bare)' : '';
    const branch = wt.detached ? `detached at ${wt.head.substring(0, 7)}` : wt.branch;
    const isMain = samePath(wt.path, repoRoot);
    const label = isMain ? '(main)' : '';
    const safeName = worktreeNameFromPath(worktreesDir, wt.path);

    console.log(`  • ${wt.path} ${label}`);
    console.log(`    branch: ${branch}${isBare}`);

    // 显示 DocPath 状态
    const stateInfo = await getWorktreeState(wt.path);
    if (stateInfo) {
      console.log(`    docpath: ${stateInfo}`);
    }
    const diagnostics = await getWorktreeDiagnostics(repoRoot, wt.path, safeName, isMain);
    console.log(`    managed_by_docpath: ${diagnostics.managed}`);
    console.log(`    dirty: ${diagnostics.dirty}`);
    console.log(`    completed: ${diagnostics.completed}`);
    console.log(`    merged_to_main: ${diagnostics.mergedToMain}`);
    console.log(`    branch_has_unique_commits: ${diagnostics.branchHasUniqueCommits}`);
    console.log(`    branch_unique_commits: ${diagnostics.branchUniqueCommits}`);
    console.log(`    safe_to_remove: ${diagnostics.safeToRemove}`);
    if (diagnostics.cleanupCommand) {
      console.log(`    cleanup: ${diagnostics.cleanupCommand}`);
    } else if (!isMain && diagnostics.completed && diagnostics.dirty) {
      console.log(`    cleanup: commit/stash changes, then run docpath worktree remove ${safeName}`);
    } else if (!isMain && diagnostics.completed && !diagnostics.mergedToMain) {
      console.log(`    cleanup: merge or intentionally discard ${safeName} before removal`);
    } else if (!isMain && !diagnostics.managed) {
      console.log(`    repair: recreate with docpath worktree create ${safeName}, or remove the ordinary git worktree manually`);
    }
  }
  console.log('');
}

/**
 * 获取 worktree 的 DocPath 状态
 */
type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  status: DoctorStatus;
  label: string;
  detail: string;
}

function checkExists(path: string, label: string): DoctorCheck {
  return existsSync(path)
    ? { status: 'pass', label, detail: path }
    : { status: 'fail', label, detail: `missing: ${path}` };
}

function checkDirectory(path: string, label: string): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) return { status: 'pass', label, detail: path };
    return { status: 'fail', label, detail: `not a directory: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

function checkBacklogContract(path: string, label: string, tracked: boolean): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      // Tracked backlog must be a merge-mediated copy (R-238 Option B / R-273)：
      // symlink over tracked files is the R-271 residue that deletes main's
      // backlog on merge — fail loud and route to repair.
      if (tracked) {
        return { status: 'fail', label, detail: `symlink over tracked backlog (R-271 残留, 合并会删 main backlog): run docpath worktree repair — ${path}` };
      }
      return { status: 'pass', label, detail: `symlink (untracked backlog, live-shared): ${path}` };
    }
    if (stat.isDirectory()) return { status: 'pass', label, detail: `tracked copy (merge-mediated): ${path}` };
    return { status: 'fail', label, detail: `not a directory or symlink: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

function checkMergeMediated(path: string, label: string): DoctorCheck {
  if (!existsSync(path)) return { status: 'fail', label, detail: `missing: ${path}` };
  try {
    const stat = lstatSync(path);
    // Merge-mediated resources are tracked copies shared via branch merges;
    // a symlink (live-shared) is also acceptable.
    if (stat.isSymbolicLink()) return { status: 'pass', label, detail: `symlink: ${path}` };
    if (stat.isDirectory()) return { status: 'pass', label, detail: `tracked copy (merge-mediated): ${path}` };
    return { status: 'fail', label, detail: `not a directory or symlink: ${path}` };
  } catch (error) {
    return { status: 'fail', label, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkIsolatedTasks(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const tasksCurrent = join(docpathDir, 'tasks', 'current');
  // The isolation contract for tasks/current is "not tracked by git": each
  // worktree then owns its own current-task runtime without merge conflicts.
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/tasks/current'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `tasks/current untracked (isolated): ${tasksCurrent}` };
  return { status: 'fail', label, detail: `tasks/current tracked (not isolated): ${tasksCurrent}` };
}

async function checkIsolatedWorkspace(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const workspaceDir = join(docpathDir, 'workspace');
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/workspace'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `workspace untracked (isolated): ${workspaceDir}` };
  return { status: 'fail', label, detail: `workspace tracked (not isolated): ${workspaceDir}` };
}

async function checkIsolatedJournal(
  docpathDir: string,
  worktreePath: string,
  label: string,
): Promise<DoctorCheck> {
  const journalDir = join(docpathDir, 'journal');
  const tracked = (await runGitCapture(worktreePath, ['ls-files', '--', '.docpath/journal'])).trim().length > 0;
  if (!tracked) return { status: 'pass', label, detail: `journal untracked (isolated): ${journalDir}` };
  return { status: 'fail', label, detail: `journal tracked (not isolated): ${journalDir}` };
}

export async function resolveDoctorTarget(cwd: string, name?: string): Promise<{ safeName: string; worktreePath: string }> {
  const repoRoot = await getGitTopLevel(cwd);
  if (!name) {
    return {
      safeName: repoRoot.split(/[\\/]/).filter(Boolean).at(-1) || 'current',
      worktreePath: repoRoot,
    };
  }

  const paths = await resolveWorktreePaths(cwd, name);
  const worktrees = await listWorktrees(paths.repoRoot);
  if (!worktrees.some((wt) => samePath(wt.path, paths.worktreePath))) {
    throw new Error(`worktree 不存在: ${paths.safeName}`);
  }
  return {
    safeName: paths.safeName,
    worktreePath: paths.worktreePath,
  };
}


export async function getWorktreeDoctorStatus(cwd: string, name?: string): Promise<{
  errors: number;
  warnings: number;
  checks: DoctorCheck[];
  safeName: string;
  worktreePath: string;
}> {
  const { safeName, worktreePath } = await resolveDoctorTarget(cwd, name);
  const docpathDir = join(worktreePath, '.docpath');
  const tasksCurrentCheck = await checkIsolatedTasks(docpathDir, worktreePath, 'isolated tasks/current');
  const workspaceCheck = await checkIsolatedWorkspace(docpathDir, worktreePath, 'isolated workspace directory');
  const journalCheck = await checkIsolatedJournal(docpathDir, worktreePath, 'isolated journal directory');

  const mainRepoRoot = await resolveWorktreeManagerRoot(worktreePath);
  const backlogTracked = await hasTrackedFiles(mainRepoRoot, '.docpath/backlog');

  const checks: DoctorCheck[] = [
    checkExists(join(worktreePath, '.git'), 'git worktree metadata'),
    checkDirectory(docpathDir, '.docpath directory'),
    checkBacklogContract(join(docpathDir, 'backlog'), 'merge-mediated backlog', backlogTracked),
    checkMergeMediated(join(docpathDir, 'rules'), 'merge-mediated rules'),
    workspaceCheck,
    tasksCurrentCheck,
    journalCheck,
    checkExists(join(docpathDir, 'workspace', 'state.json'), 'workspace state'),
    checkExists(join(docpathDir, 'workspace', 'current.md'), 'workspace current view'),
    checkExists(join(docpathDir, 'workspace', 'breadcrumb.md'), 'workspace breadcrumb view'),
  ];

  if (existsSync(join(worktreePath, 'package.json'))) {
    checks.push(
      existsSync(join(worktreePath, 'node_modules'))
        ? { status: 'pass', label: 'dependencies', detail: 'node_modules present' }
        : { status: 'warn', label: 'dependencies', detail: 'node_modules missing; run pnpm install before build/test' },
    );
  }

  checks.push(
    process.env.DOCPATH_SESSION
      ? { status: 'pass', label: 'session', detail: `DOCPATH_SESSION=${process.env.DOCPATH_SESSION}` }
      : { status: 'warn', label: 'session', detail: `set DOCPATH_SESSION=${recommendedSessionName(safeName)} before lifecycle commands` },
  );

  const errors = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;

  return { errors, warnings, checks, safeName, worktreePath };
}

export async function assertWorktreeContract(cwd: string): Promise<void> {
  if (!isInWorktree(cwd)) return;
  if (!(await isGitRepo(cwd))) return;
  const { errors } = await getWorktreeDoctorStatus(cwd);
  if (errors > 0) {
    throw new Error(
      `❌  Git Worktree contract validation failed. Operational commands blocked.\n` +
      `    修复建议: 运行 'docpath worktree repair' 自动校准共享/隔离契约。`
    );
  }
}

/**
 * worktree doctor [name] — 只读检查 worktree 开发前置条件
 */
export async function worktreeDoctor(cwd: string, name?: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    console.error('❌  当前目录不是 git 仓库');
    process.exit(1);
  }

  const { errors, warnings, checks, safeName, worktreePath } = await getWorktreeDoctorStatus(cwd, name);
  const repoRoot = await resolveWorktreeManagerRoot(cwd);
  const diagnostics = await getWorktreeDiagnostics(repoRoot, worktreePath, safeName, samePath(repoRoot, worktreePath));

  console.log(`\n🩺  Worktree doctor: ${safeName}`);
  console.log(`  path: ${worktreePath}`);
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${check.label}: ${check.detail}`);
  }
  console.log(`  ℹ️ managed_by_docpath: ${diagnostics.managed}`);
  console.log(`  ℹ️ dirty: ${diagnostics.dirty}`);
  console.log(`  ℹ️ completed: ${diagnostics.completed}`);
  console.log(`  ℹ️ merged_to_main: ${diagnostics.mergedToMain}`);
  console.log(`  ℹ️ branch_has_unique_commits: ${diagnostics.branchHasUniqueCommits}`);
  console.log(`  ℹ️ branch_unique_commits: ${diagnostics.branchUniqueCommits}`);
  console.log(`  ℹ️ safe_to_remove: ${diagnostics.safeToRemove}`);
  if (diagnostics.cleanupCommand) {
    console.log(`  ℹ️ cleanup: ${diagnostics.cleanupCommand}`);
  }

  // R-335 FR-4（落实 R-332）: agent 进入 worktree 的第一站检查执行二进制是否本地构建
  const driftWarning = renderBinaryDriftWarning(await detectBinaryDrift(cwd));
  if (driftWarning) {
    console.log(driftWarning.split('\n').map((line) => `  ${line}`).join('\n'));
  }

  if (errors > 0) {
    console.log(`\n❌  worktree doctor failed (${errors} errors, ${warnings} warnings)`);
    console.log('修复建议: 备份未提交变更后，用 `docpath worktree repair` 自动校准，或者用 `docpath worktree create <name>` 重新创建受管 worktree。');
    process.exit(1);
  }

  console.log(`\n✅  worktree doctor passed (${warnings} warnings)`);
}


/**
 * worktree remove <name> — 删除 worktree
 */
