import type { CAC } from 'cac';
import { dashboardCommand } from '../dashboard.js';
import { compactCommand, discoverCommand, nextCommand } from '../runtime.js';
import { getOptionValue, normalizeTaskFileSyncSource } from './shared.js';

function registerDashboardCommand(cli: CAC): void {
  cli.command('dashboard', '启动本地只读 Agent Dashboard')
    .option('--cwd <path>', '项目目录')
    .option('--host <host>', '监听地址 (默认 127.0.0.1)')
    .option('--port <port>', '监听端口 (默认 7181)')
    .option('--project <name>', '只读选择已注册项目名称、任务 ID 或根目录')
    .option('--root <path>', '只读选择已注册项目根目录')
    .option('--status <status>', '只读筛选 Backlog 状态')
    .option('--priority <priority>', '只读筛选 Backlog 优先级')
    .option('--q <query>', '只读搜索 Backlog ID、标题或任务链接')
    .option('--print', '只输出 HTML，不启动服务')
    .option('--json', '只输出 Dashboard 数据 JSON，不启动服务')
    .action(async (options: { cwd?: string; host?: string; port?: string; project?: string; root?: string; status?: string; priority?: string; q?: string; print?: boolean; json?: boolean }) => {
      await dashboardCommand({
        cwd: options.cwd || process.cwd(),
        host: options.host,
        port: options.port ? parseInt(options.port, 10) : undefined,
        project: options.project,
        root: options.root,
        status: options.status,
        priority: options.priority,
        q: options.q,
        print: !!options.print,
        json: !!options.json,
      });
    });
}

export function registerRuntimeToolCommands(cli: CAC): void {
  registerDashboardCommand(cli);
  cli.command('compact', '持久化压缩运行上下文到 workspace/compact-context.md')
    .option('--cwd <path>', '项目目录')
    .option('--max-entries <n>', '保留最近 breadcrumb 条数 (默认 20)')
    .option('--dry-run', '只输出，不写文件')
    .action(async (options: { cwd?: string; 'max-entries'?: string; maxEntries?: string; dryRun?: boolean; 'dry-run'?: boolean }) => {
      await compactCommand({
        cwd: options.cwd || process.cwd(),
        maxEntries: options.maxEntries || options['max-entries'] ? parseInt((options.maxEntries || options['max-entries'])!, 10) : undefined,
        dryRun: !!(options.dryRun || options['dry-run']),
      });
    });

  cli.command('discover', '发现 DocPath 关键上下文文件')
    .option('--cwd <path>', '项目目录')
    .option('--format <format>', 'text(默认) | json')
    .action(async (options: { cwd?: string; format?: string }) => {
      await discoverCommand({
        cwd: options.cwd || process.cwd(),
        format: options.format as 'text' | 'json' | undefined,
      });
    });

  cli.command('next', '输出下一步建议')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent YAML')
    .option('--auto-fix <source>', '检测到任务文件漂移时自动同步: canonical | current')
    .action(async (options: { cwd?: string; agent?: boolean; 'auto-fix'?: string; autoFix?: string }) => {
      const argv = process.argv.slice(2);
      await nextCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
        autoFix: normalizeTaskFileSyncSource(options['auto-fix'] || options.autoFix || getOptionValue(argv, '--auto-fix'), 'next --auto-fix'),
      });
    });
}
