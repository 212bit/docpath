import type { CAC } from 'cac';
import { backlogCommand } from '../backlog.js';
import { gcCommand } from '../gc.js';
import { taskCommand } from '../task.js';
import { tasksCommand } from '../tasks.js';

export function registerBacklogMaintenanceCommands(cli: CAC): void {
  cli.command('backlog <action> [id]', '需求条目管理: add | list | refresh | accept | plan | promote | done | drop')
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', 'add: 条目标题')
    .option('--priority <priority>', 'add/list: 优先级过滤或创建优先级 (P0|P1|P2|P3)')
    .option('--level <level>', 'add: 条目复杂度 (0|1|2|3)')
    .option('--status <status>', 'list: 状态过滤')
    .option('--agent', 'list: 输出 agent YAML')
    .action(async (action: string, id: string | undefined, options: { cwd?: string; title?: string; priority?: string; level?: string; status?: string; agent?: boolean }) => {
      await backlogCommand({
        cwd: options.cwd || process.cwd(),
        action,
        id,
        title: options.title,
        priority: options.priority,
        level: options.level,
        status: options.status,
        agent: !!options.agent,
      });
    });

  cli.command('tasks <action>', '任务文件别名管理: drift | sync')
    .option('--cwd <path>', '项目目录')
    .option('--from <source>', 'sync: 同步来源 canonical | current')
    .action(async (action: string, options: { cwd?: string; from?: 'canonical' | 'current' }) => {
      await tasksCommand({
        cwd: options.cwd || process.cwd(),
        action,
        from: options.from,
      });
    });

  cli.command('task <action>', '当前任务生命周期管理: abort | reset')
    .option('--cwd <path>', '项目目录')
    .action(async (action: string, options: { cwd?: string }) => {
      await taskCommand({
        cwd: options.cwd || process.cwd(),
        action,
      });
    });

  cli.command('gc', '清理历史任务目录')
    .option('--cwd <path>', '项目目录')
    .option('--force', '执行归档而不是仅预览')
    .option('--delete', '在 force 模式下直接删除而不是归档到 done')
    .action(async (options: { cwd?: string; force?: boolean; delete?: boolean }) => {
      await gcCommand({
        cwd: options.cwd || process.cwd(),
        force: !!options.force,
        delete: !!options.delete,
      });
    });
}
