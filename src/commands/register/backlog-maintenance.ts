import type { CAC } from 'cac';
import { backlogCommand, BACKLOG_ACTIONS } from '../backlog.js';
import { gcCommand } from '../gc.js';
import { taskCommand, taskFileSyncCommand } from '../task.js';

export function registerBacklogMaintenanceCommands(cli: CAC): void {
  cli.command('backlog [action] [id]', `需求条目管理 (默认直显全景看板): ${BACKLOG_ACTIONS.join(' | ')}`)
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', 'add/edit: 条目标题')
    .option('--query <query>', 'search/find: 搜索关键词')
    .option('--kind <kind>', 'add/edit/shape/list/search/export: 需求分类 (feature|fix|refactor|perf|debt|spike|chore)')
    .option('--priority <priority>', 'add/edit/list/search/export: 优先级过滤或创建优先级 (P0|P1|P2|P3)')
    .option('--level <level>', 'add/edit: 条目复杂度 (0|1|2|3)')
    .option('--background <text>', 'add/edit/shape: 条目背景正文')
    .option('--acceptance <text>', 'add/edit/shape: 条目验收正文')
    .option('--fr <text>', 'shape/add: 功能要点')
    .option('--non-goals <text>', 'shape/add: 非目标/约束')
    .option('--body-file <path>', 'add/edit: 从 markdown 文件读取完整正文')
    .option('--file <path>', 'import: 导入文件路径')
    .option('--format <format>', 'export: 导出格式 json|yaml|markdown (默认 yaml)')
    .option('--output <path>', 'export: 导出目标文件路径')
    .option('--dry-run', 'import: 预览模式，不实际写入磁盘')
    .option('--overwrite', 'import: 覆盖已存在 ID 的条目')
    .option('--readiness <readiness>', 'add/edit: 需求成熟度 raw|shaped|analyzed|confirmed')
    .option('--evidence-brainstorm <ref>', 'add/edit: brainstorm 证据引用')
    .option('--evidence-analysis <ref>', 'add/edit: analysis 证据引用')
    .option('--evidence-spec <ref>', 'add/edit: spec 证据引用')
    .option('--evidence-decision <ref>', 'add/edit: Decision Brief 证据引用')
    .option('--user-confirmed <text>', 'add/edit: 用户确认依据')
    .option('--status <status>', 'list/search/export: 状态过滤')
    .option('--parent <id>', 'add/edit/shape/search: 父需求 ID')
    .option('--depends-on <ids>', 'add/edit/shape/search: 依赖的前置需求 ID（逗号分隔）')
    .option('--blocks <ids>', 'add/edit: 阻塞的后置需求 ID（逗号分隔）')
    .option('--ready-only, --unblocked', 'search/export: 仅检索当前无未解依赖已就绪条目')
    .option('--mermaid', 'graph/tree/deps: 输出 Mermaid 格式拓扑图')
    .option('--limit <number>', 'search: 限制输出条数')
    .option('--task <id>', 'done: 旁路闭环任务证据（quick 等绕过 promote 时链接已执行任务 id）')
    .option('--fix', 'groom: 自动修复悬空/已废弃依赖链接')
    .option('--archived, --all', 'search/export: 检索或导出时包含已归档条目')
    .option('--agent', 'list/groom/search/graph/shape/import/show/stats/dashboard/pick: 输出 agent YAML')
    .option('--json', 'search/graph/import/dashboard/pick: 输出 JSON 结构')
    .option('--draft', 'promote/pick: 跳过成熟度检查，快速通道推送')
    .option('--adopt', 'promote/pick: 就地认领当前工作区变更并启动任务（不触发 Worktree 隔离）')
    .option('--start', 'pick/next: 自动选中并立即启动最高收益需求')
    .action(async (action: string | undefined, id: string | undefined, options: {
      cwd?: string;
      title?: string;
      query?: string;
      kind?: string;
      priority?: string;
      level?: string;
      background?: string;
      acceptance?: string;
      fr?: string;
      'non-goals'?: string;
      nonGoals?: string;
      bodyFile?: string;
      file?: string;
      format?: 'json' | 'yaml' | 'markdown';
      output?: string;
      dryRun?: boolean;
      'dry-run'?: boolean;
      overwrite?: boolean;
      readiness?: string;
      evidenceBrainstorm?: string;
      evidenceAnalysis?: string;
      evidenceSpec?: string;
      evidenceDecision?: string;
      userConfirmed?: string;
      status?: string;
      parent?: string;
      dependsOn?: string;
      'depends-on'?: string;
      blocks?: string;
      readyOnly?: boolean;
      'ready-only'?: boolean;
      unblocked?: boolean;
      mermaid?: boolean;
      json?: boolean;
      limit?: number | string;
      task?: string;
      agent?: boolean;
      draft?: boolean;
      adopt?: boolean;
      start?: boolean;
      promote?: boolean;
    }) => {
      await backlogCommand({
        cwd: options.cwd || process.cwd(),
        action,
        id,
        title: options.title,
        query: options.query,
        kind: options.kind,
        priority: options.priority,
        level: options.level,
        background: options.background,
        acceptance: options.acceptance,
        fr: options.fr,
        nonGoals: options['non-goals'] || options.nonGoals,
        bodyFile: options.bodyFile,
        file: options.file,
        format: options.format,
        output: options.output,
        dryRun: !!(options['dry-run'] || options.dryRun),
        overwrite: !!options.overwrite,
        readiness: options.readiness,
        evidenceBrainstorm: options.evidenceBrainstorm,
        evidenceAnalysis: options.evidenceAnalysis,
        evidenceSpec: options.evidenceSpec,
        evidenceDecision: options.evidenceDecision,
        userConfirmed: options.userConfirmed,
        status: options.status,
        parent: options.parent,
        dependsOn: options['depends-on'] || options.dependsOn,
        blocks: options.blocks,
        readyOnly: !!(options['ready-only'] || options.readyOnly || options.unblocked),
        unblocked: !!(options.unblocked || options['ready-only'] || options.readyOnly),
        mermaid: !!options.mermaid,
        json: !!options.json,
        limit: options.limit ? Number.parseInt(String(options.limit), 10) : undefined,
        task: options.task,
        fix: !!(options as { fix?: boolean }).fix,
        all: !!(options as { all?: boolean; archived?: boolean }).all || !!(options as { all?: boolean; archived?: boolean }).archived,
        includeArchived: !!(options as { all?: boolean; archived?: boolean }).all || !!(options as { all?: boolean; archived?: boolean }).archived,
        agent: !!options.agent,
        draft: !!options.draft,
        adopt: !!options.adopt,
        start: !!options.start,
        promote: !!options.promote,
      });
    });

  cli.command('task [action] [target] [extra]', '当前任务管理与热切换: abort | reset | reopen | drift | sync | repair | stash | pop | switch | drop | list')
    .option('--cwd <path>', '项目目录')
    .option('--from <source>', 'sync: 同步来源 canonical | current | auto')
    .option('--auto', 'sync: 自动全维度自愈修复')
    .option('--dry-run', 'repair/sync: 仅预览修复动作，不修改文件')
    .option('-m, --message <text>', 'stash/switch 备注说明')
    .option('--no-git', '跳过 Git 变更暂存/恢复')
    .option('--all', 'drop: 丢弃所有暂存')
    .option('--agent', '输出 Agent 机器视图')
    .option('--json', '输出 JSON 格式')
    .action(async (action: string | undefined, target: string | undefined, extra: string | undefined, options: { cwd?: string; from?: 'canonical' | 'current' | 'auto'; auto?: boolean; 'dry-run'?: boolean; dryRun?: boolean; message?: string; 'no-git'?: boolean; noGit?: boolean; all?: boolean; agent?: boolean; json?: boolean }) => {
      const normalized = action?.trim().toLowerCase();
      if (normalized === 'drift' || normalized === 'sync' || normalized === 'repair') {
        await taskFileSyncCommand({
          cwd: options.cwd || process.cwd(),
          action: normalized,
          from: options.from,
          agent: options.agent,
          json: options.json,
          auto: options.auto,
          dryRun: options.dryRun || options['dry-run'],
        } as any);
        return;
      }
      await taskCommand({
        cwd: options.cwd || process.cwd(),
        action: normalized,
        target,
        extra,
        message: options.message,
        noGit: options['no-git'] ?? options.noGit,
        all: options.all,
        agent: options.agent,
        json: options.json,
        dryRun: options.dryRun || options['dry-run'],
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
