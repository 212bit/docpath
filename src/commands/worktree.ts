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
import type { WorktreeOptions } from './worktree/shared.js';
export { assertWorktreeContract } from './worktree/query.js';
export { resolveWorktreePaths } from './worktree/shared.js';
export { getWorktreeDoctorStatus } from './worktree/query.js';

export async function worktreeCommand(options: WorktreeOptions): Promise<void> {
  const { cwd, action = 'list', name, force = false, backlog } = options;

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
      await worktreeList(cwd, options.agent);
      break;

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

