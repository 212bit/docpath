/** 注册 Git Worktree 管理命令 */

import type { CAC } from 'cac';
import { worktreeCommand } from '../worktree.js';

export function registerWorktreeCommands(cli: CAC): void {
  const worktree = cli
    .command('worktree [action] [name]', 'Git Worktree 并发开发与多 Agent 协同管理')
    .option('--cwd <path>', '项目目录')
    .option('--force', '强制删除（忽略未提交变更）')
    .option('--backlog <id>', 'create: 绑定目标 backlog 条目（例如 R-268）')
    .option('--allow-dirty-main <reason>', 'merge: 记录证据跳过 dirty 交集拒绝（R-335 并发恢复用）')
    .option('--agent', '输出 Agent 编排/矩阵视图 YAML')
    .option('--json', '输出 JSON 格式')
    .option('--message <text>', 'broadcast: 跨 Worktree 广播的消息内容')
    .option('--strict', 'conflicts/preflight: 发现阻塞级冲突时以非 0 退出码退出')
    .action(async (action: string | undefined, name: string | undefined, options: { cwd?: string; force?: boolean; backlog?: string; agent?: boolean; json?: boolean; message?: string; allowDirtyMain?: string; 'allow-dirty-main'?: string; strict?: boolean }) => {
      await worktreeCommand({
        cwd: options.cwd || process.cwd(),
        action: action as any,
        name,
        force: options.force,
        backlog: options.backlog,
        agent: options.agent,
        json: options.json,
        message: options.message,
        allowDirtyMain: options.allowDirtyMain ?? options['allow-dirty-main'],
        strict: options.strict,
      });
    });

  // 详细使用说明
  worktree.usage(`
  docpath worktree [action] [name] [options]

  Actions:
    list                List all worktrees (--agent for aggregated orchestration view)
    matrix / status     Show live Multi-Agent worktree progress and collaboration matrix
    conflicts / preflight Detect cross-worktree file overlaps, in-flight dependencies, and collisions
    broadcast <msg>     Broadcast message to all active worktrees
    create <name>       Create a new worktree with isolated .docpath/
    doctor [name]       Check worktree readiness before development
    repair [name]       Automatically repair worktree contract drifts
    merge [branch]      Automatically merge changes and closeout to main (--allow-dirty-main <reason> for concurrent recovery)
    finish <name>       Merge worktree back to target branch and remove worktree
    sync                Merge main into all active worktrees (R-335)
    remove <name>       Remove a worktree
    prune               Prune all completed, merged, and clean worktrees

  Examples:
    $ docpath worktree matrix
    $ docpath worktree broadcast "v1.0.0 released"
    $ docpath worktree list
    $ docpath worktree create feature-auth
    $ docpath worktree create feature-auth --backlog R-123
    $ docpath worktree doctor feature-auth
    $ docpath worktree repair feature-auth
    $ docpath worktree merge
    $ docpath worktree merge develop
    $ docpath worktree remove feature-auth
    $ docpath worktree remove feature-auth --force

  Isolation Strategy:
    - Merge-mediated (tracked): backlog/, rules/, spec/, templates/
    - Isolated (ignored): workspace/, tasks/, journal/

  Use Cases:
    - Develop Feature A with one agent in one worktree
    - Develop Feature B with Claude Code in another worktree
    - Both agents work concurrently with zero conflicts

  See: docs/features/worktree-workflow.md for full guide
  `);

  worktree.example('docpath worktree list');
  worktree.example('docpath worktree create feature-a');
  worktree.example('docpath worktree create feature-a --backlog R-123');
  worktree.example('docpath worktree doctor feature-a');
  worktree.example('docpath worktree repair feature-a');
  worktree.example('docpath worktree merge');
  worktree.example('docpath worktree merge develop');
  worktree.example('docpath worktree remove feature-a');
  worktree.example('docpath worktree remove feature-a --force');
}
