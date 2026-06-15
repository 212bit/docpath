/** 注册 Git Worktree 管理命令 */

import type { CAC } from 'cac';
import { worktreeCommand } from '../worktree.js';

export function registerWorktreeCommands(cli: CAC): void {
  const worktree = cli
    .command('worktree [action] [name]', 'Git Worktree 并发开发管理')
    .option('--force', '强制删除（忽略未提交变更）')
    .action(async (action: string | undefined, name: string | undefined, options: any) => {
      await worktreeCommand({
        cwd: options.cwd || process.cwd(),
        action: action as 'create' | 'list' | 'remove' | undefined,
        name,
        force: options.force,
      });
    });

  worktree.example('docpath worktree list');
  worktree.example('docpath worktree create feature-a');
  worktree.example('docpath worktree remove feature-a');
  worktree.example('docpath worktree remove feature-a --force');
}
