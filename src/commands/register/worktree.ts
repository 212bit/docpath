/** 注册 Git Worktree 管理命令 */

import type { CAC } from 'cac';
import { worktreeCommand } from '../worktree.js';

export function registerWorktreeCommands(cli: CAC): void {
  const worktree = cli
    .command('worktree [action] [name]', 'Git Worktree 并发开发管理')
    .option('--cwd <path>', '项目目录')
    .option('--force', '强制删除（忽略未提交变更）')
    .action(async (action: string | undefined, name: string | undefined, options: { cwd?: string; force?: boolean }) => {
      await worktreeCommand({
        cwd: options.cwd || process.cwd(),
        action: action as 'create' | 'list' | 'remove' | 'doctor' | 'prune' | undefined,
        name,
        force: options.force,
      });
    });

  // 详细使用说明
  worktree.usage(`
  docpath worktree [action] [name] [options]

  Actions:
    list                List all worktrees (default)
    create <name>       Create a new worktree with isolated .docpath/
    doctor [name]       Check worktree readiness before development
    remove <name>       Remove a worktree
    prune               Prune all completed, merged, and clean worktrees

  Examples:
    $ docpath worktree list
    $ docpath worktree create feature-auth
    $ docpath worktree doctor feature-auth
    $ docpath worktree remove feature-auth
    $ docpath worktree remove feature-auth --force

  Isolation Strategy:
    - Shared (symlink): backlog/, rules/, spec/, templates/
    - Isolated: workspace/, tasks/, journal/

  Use Cases:
    - Develop Feature A with Codex in one worktree
    - Develop Feature B with Claude Code in another worktree
    - Both agents work concurrently with zero conflicts

  See: docs/features/worktree-workflow.md for full guide
  `);

  worktree.example('docpath worktree list');
  worktree.example('docpath worktree create feature-a');
  worktree.example('docpath worktree doctor feature-a');
  worktree.example('docpath worktree remove feature-a');
  worktree.example('docpath worktree remove feature-a --force');
}
