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

export async function worktreeCommand(options: WorktreeOptions): Promise<void> {
  const { cwd, action = 'list', name, force = false, backlog, agent = false, json = false, message } = options;

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
      console.log(`🚀  docpath worktree finish: 合并并清理 worktree ${wtName}...\n`);
      await worktreeMerge(targetCwd, undefined, options.allowDirtyMain);
      const rootCwd = await resolveWorktreeManagerRoot(targetCwd);
      await worktreeRemove(rootCwd, wtName, force);
      console.log(`\n🎉  Worktree ${wtName} 已成功合并回主分支并完成工作区清理！`);
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

