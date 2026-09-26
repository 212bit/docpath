/**
 * docpath worktree — Git Worktree 管理
 *
 * 支持真并发开发：多个 Agent 在独立 worktrees 中开发不同 feature。
 */

import { existsSync, lstatSync } from 'node:fs';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BREADCRUMB_HEADER, writeBreadcrumb } from '../engine/breadcrumb.js';
import { mutateCurrentState, readCurrentState } from '../utils/workspace.js';
import { detectBinaryDrift, renderBinaryDriftWarning } from '../utils/version-drift.js';
import { gitAsync } from '../utils/git-run.js';
import {
  isGitRepo,
  listWorktrees,
  getGitTopLevel,
  createSymlink,
  isInWorktree,
} from '../utils/worktree.js';


import { worktreeCreate } from './worktree/create.js';
import { worktreeList, worktreeDoctor, assertWorktreeContract } from './worktree/query.js';
import { worktreeRemove, worktreePrune, worktreeRepair } from './worktree/lifecycle.js';
import { worktreeSync, worktreeMerge } from './worktree/closeout.js';
import { resolveWorktreeManagerRoot, type WorktreeOptions } from './worktree/shared.js';
export { assertWorktreeContract } from './worktree/query.js';
export { resolveWorktreePaths } from './worktree/shared.js';
export { getWorktreeDoctorStatus } from './worktree/query.js';

import {
  collectWorktreeMatrix,
  renderWorktreeMatrixTable,
  broadcastWorktreeMessage,
} from '../utils/worktree-collaboration.js';
import {
  detectWorktreeConflicts,
  renderWorktreeConflictReport,
} from '../engine/worktree-preflight.js';

export async function worktreeCommand(options: WorktreeOptions): Promise<void> {
  const { cwd, action = 'list', name, force = false, backlog, agent = false, json = false, message, strict = false } = options;

  switch (action) {
    case 'create':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree create <name>');
        process.exit(1);
      }
      await worktreeCreate(cwd, name, backlog);
      break;

    case 'list':
      await worktreeList(cwd, agent);
      break;

    case 'matrix':
    case 'status': {
      const matrix = await collectWorktreeMatrix(cwd);
      if (json) {
        console.log(JSON.stringify(matrix, null, 2));
        return;
      }
      if (agent) {
        const { stringify } = await import('yaml');
        console.log(
          stringify({
            agent_view: 'worktree_matrix',
            total_worktrees: matrix.totalWorktrees,
            active_agents_count: matrix.activeAgentsCount,
            repo_root: matrix.repoRoot,
            worktrees: matrix.entries.map((e) => ({
              name: e.name,
              branch: e.branch,
              session: e.sessionId,
              task_id: e.taskId,
              task_title: e.taskTitle,
              phase: e.phase,
              step: e.currentStep,
              dirty_files: e.dirtyFilesCount,
              readiness: e.readiness,
              action: e.suggestedAction,
            })),
          }),
        );
        return;
      }
      console.log(renderWorktreeMatrixTable(matrix));
      break;
    }

    case 'broadcast': {
      const broadcastContent = name || message || '';
      if (!broadcastContent.trim()) {
        console.error('❌  请输入要广播的消息内容，例如: `docpath worktree broadcast "主干已发布 v1.0.0"`');
        process.exit(1);
      }
      const results = await broadcastWorktreeMessage(cwd, broadcastContent);
      if (agent) {
        const { stringify } = await import('yaml');
        console.log(
          stringify({
            agent_view: 'worktree_broadcast',
            message: broadcastContent,
            delivered: results.filter((r) => r.written).map((r) => r.worktree),
          }),
        );
        return;
      }
      console.log(`\n📢  跨 Worktree 消息广播完成！`);
      console.log(`    内容: "${broadcastContent}"`);
      console.log(`    同步分发目标: ${results.map((r) => r.worktree).join(', ')}\n`);
      break;
    }

    case 'conflicts':
    case 'preflight': {
      const report = await detectWorktreeConflicts(cwd, { targetWorktree: name });
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (agent) {
        const { stringify } = await import('yaml');
        console.log(
          stringify({
            agent_view: 'worktree_conflicts',
            passed: report.passed,
            has_blocking_conflicts: report.hasBlockingConflicts,
            total_worktrees: report.totalWorktrees,
            file_overlaps_count: report.fileOverlaps.length,
            file_overlaps: report.fileOverlaps,
            dependency_conflicts_count: report.dependencyConflicts.length,
            dependency_conflicts: report.dependencyConflicts,
            task_collisions_count: report.taskCollisions.length,
            task_collisions: report.taskCollisions,
            base_drifts_count: report.baseDrifts.length,
            base_drifts: report.baseDrifts,
          }),
        );
      } else {
        console.log(renderWorktreeConflictReport(report));
      }
      if (strict && report.hasBlockingConflicts) {
        process.exit(1);
      }
      break;
    }

    case 'sync':
      await worktreeSync(cwd);
      break;

    case 'doctor':
      await worktreeDoctor(cwd, name);
      break;

    case 'repair':
      await worktreeRepair(cwd, name);
      break;

    case 'merge':
      await worktreeMerge(cwd, name, options.allowDirtyMain);
      break;

    case 'finish': {
      if (!name && !isInWorktree(cwd)) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree finish <name> [--force]');
        process.exit(1);
      }
      const wtName = name || (cwd.split(/[\\/]/).filter(Boolean).at(-1) as string);
      const targetCwd = isInWorktree(cwd) ? cwd : join(cwd, '.worktrees', wtName);
      if (!existsSync(targetCwd)) {
        console.error(`❌  找不到 worktree: ${wtName} (${targetCwd})`);
        process.exit(1);
      }
      if (!agent && !json) {
        console.log(`🚀  docpath worktree finish: 合并并清理 worktree ${wtName}...\n`);
      }
      const mergeResult = await worktreeMerge(targetCwd, undefined, options.allowDirtyMain);
      if (!mergeResult.mergedToMain && !force) {
        if (json) {
          console.log(JSON.stringify({
            status: 'error',
            message: `Worktree ${wtName} 内任务尚未完成 (phase !== completed)，合回主干被跳过。若要强制删除未合入的工作区，请使用 --force。`,
            merged: false,
            removed: false,
          }, null, 2));
        } else if (agent) {
          const { stringify } = await import('yaml');
          console.log(stringify({
            agent_view: 'worktree_finish',
            status: 'blocked',
            worktree: wtName,
            merged: false,
            removed: false,
            reason: 'task_not_completed',
            next_action: `在 worktree ${wtName} 中运行 docpath done --commit 完成任务收口，或使用 --force 强制清理`,
          }));
        } else {
          console.error(`\n❌  Worktree ${wtName} 内任务尚未完成 (phase !== completed)，拒绝清理。`);
          console.error(`    请进入该 worktree 运行 docpath done --commit 完成门禁与收口后再 finish，或使用 --force 强制删除。`);
        }
        process.exit(1);
      }

      const rootCwd = await resolveWorktreeManagerRoot(targetCwd);
      await worktreeRemove(rootCwd, wtName, force);

      if (json) {
        console.log(JSON.stringify({
          status: 'success',
          worktree: wtName,
          merged: mergeResult.mergedToMain,
          removed: true,
        }, null, 2));
      } else if (agent) {
        const { stringify } = await import('yaml');
        console.log(stringify({
          agent_view: 'worktree_finish',
          status: 'success',
          worktree: wtName,
          merged: mergeResult.mergedToMain,
          removed: true,
        }));
      } else {
        console.log(`\n🎉  Worktree ${wtName} 已成功合并回主分支并完成工作区清理！`);
      }
      break;
    }

    case 'remove':
      if (!name) {
        console.error('❌  缺少 worktree 名称');
        console.error('用法: docpath worktree remove <name> [--force]');
        process.exit(1);
      }
      await worktreeRemove(cwd, name, force);
      break;

    case 'prune':
      await worktreePrune(cwd, force);
      break;

    default:
      console.error(`❌  未知操作: ${action}`);
      process.exit(1);
  }
}

