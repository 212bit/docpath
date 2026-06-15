import type { CAC } from 'cac';
import { compactCommand, discoverCommand, nextCommand } from '../runtime.js';
import { getOptionValue, normalizeTaskFileSyncSource } from './shared.js';

export function registerRuntimeToolCommands(cli: CAC): void {
  cli.command('compact', '持久化压缩运行上下文到 workspace/compact-context.md')
    .option('--cwd <path>', '项目目录')
    .option('--max-entries <n>', '保留最近 breadcrumb 条数 (默认 20)')
    .option('--dry-run', '只输出，不写文件')
    .option('--cleanup', '同时执行 workspace 老化清理（check-history/breadcrumb.jsonl/sessions/leases）')
    .action(async (options: { cwd?: string; 'max-entries'?: string; maxEntries?: string; dryRun?: boolean; 'dry-run'?: boolean; cleanup?: boolean }) => {
      await compactCommand({
        cwd: options.cwd || process.cwd(),
        maxEntries: options.maxEntries || options['max-entries'] ? parseInt((options.maxEntries || options['max-entries'])!, 10) : undefined,
        dryRun: !!(options.dryRun || options['dry-run']),
        cleanup: !!options.cleanup,
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
