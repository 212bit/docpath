import type { CAC } from 'cac';
import { backlogCommand } from '../backlog.js';
import { gcCommand } from '../gc.js';
import { taskCommand, taskFileSyncCommand } from '../task.js';

export function registerBacklogMaintenanceCommands(cli: CAC): void {
  cli.command('backlog <action> [id]', '需求条目管理: capture | add | edit | list | groom | refresh | accept | plan | promote | done | drop | archive')
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', 'add/edit: 条目标题')
    .option('--priority <priority>', 'add/edit/list: 优先级过滤或创建优先级 (P0|P1|P2|P3)')
    .option('--level <level>', 'add/edit: 条目复杂度 (0|1|2|3)')
    .option('--background <text>', 'add/edit: 条目背景正文')
    .option('--acceptance <text>', 'add/edit: 条目验收正文')
    .option('--body-file <path>', 'add/edit: 从 markdown 文件读取完整正文')
    .option('--readiness <readiness>', 'add/edit: 需求成熟度 raw|shaped|analyzed|confirmed')
    .option('--evidence-brainstorm <ref>', 'add/edit: brainstorm 证据引用')
    .option('--evidence-analysis <ref>', 'add/edit: analysis 证据引用')
    .option('--evidence-spec <ref>', 'add/edit: spec 证据引用')
    .option('--evidence-decision <ref>', 'add/edit: Decision Brief 证据引用')
    .option('--user-confirmed <text>', 'add/edit: 用户确认依据')
    .option('--status <status>', 'list: 状态过滤')
    .option('--task <id>', 'done: 旁路闭环任务证据（quick 等绕过 promote 时链接已执行任务 id）')
    .option('--agent', 'list/groom: 输出 agent YAML')
    .option('--draft', 'promote: 跳过成熟度检查，快速通道推送')
    .action(async (action: string, id: string | undefined, options: { cwd?: string; title?: string; priority?: string; level?: string; background?: string; acceptance?: string; bodyFile?: string; readiness?: string; evidenceBrainstorm?: string; evidenceAnalysis?: string; evidenceSpec?: string; evidenceDecision?: string; userConfirmed?: string; status?: string; task?: string; agent?: boolean; draft?: boolean }) => {
      await backlogCommand({
        cwd: options.cwd || process.cwd(),
        action,
        id,
        title: options.title,
        priority: options.priority,
        level: options.level,
        background: options.background,
        acceptance: options.acceptance,
        bodyFile: options.bodyFile,
        readiness: options.readiness,
        evidenceBrainstorm: options.evidenceBrainstorm,
        evidenceAnalysis: options.evidenceAnalysis,
        evidenceSpec: options.evidenceSpec,
        evidenceDecision: options.evidenceDecision,
        userConfirmed: options.userConfirmed,
        status: options.status,
        task: options.task,
        agent: !!options.agent,
        draft: !!options.draft,
      });
    });

  cli.command('task <action>', '当前任务管理: abort | reset | reopen | drift | sync')
    .option('--cwd <path>', '项目目录')
    .option('--from <source>', 'sync: 同步来源 canonical | current')
    .action(async (action: string, options: { cwd?: string; from?: 'canonical' | 'current' }) => {
      const normalized = action?.trim().toLowerCase();
      if (normalized === 'drift' || normalized === 'sync') {
        await taskFileSyncCommand({
          cwd: options.cwd || process.cwd(),
          action: normalized,
          from: options.from,
        });
        return;
      }
      await taskCommand({
        cwd: options.cwd || process.cwd(),
        action,
      });
    });

  cli.command('gc', '预览/执行 workspace 老化清理，并归档历史任务目录')
    .option('--cwd <path>', '项目目录')
    .option('--force', '执行 workspace cleanup 和历史任务归档，而不是仅预览')
    .option('--delete', '在 force 模式下直接删除而不是归档到 done')
    .option('--allow-worktree-archive', 'worktree 内也归档历史任务（默认跳过，避免合并噪声）')
    .action(async (options: { cwd?: string; force?: boolean; delete?: boolean; 'allow-worktree-archive'?: boolean; allowWorktreeArchive?: boolean }) => {
      await gcCommand({
        cwd: options.cwd || process.cwd(),
        force: !!options.force,
        delete: !!options.delete,
        allowWorktreeArchive: !!options['allow-worktree-archive'] || !!options.allowWorktreeArchive,
      });
    });
}
