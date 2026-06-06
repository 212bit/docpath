import type { CAC } from 'cac';
import { debugCommand } from '../debug.js';
import { tddCommand } from '../tdd.js';
import { disclosureCommand } from '../../utils/disclosure.js';

export function registerTddDebugCommands(cli: CAC): void {
  cli.command('tdd', 'TDD 工作流 — start/spec/plan/act/check/done')
    .option('--cwd <path>', '项目目录')
    .option('--action <action>', 'TDD 动作: start|next|done')
    .option('--dry-run', '仅预览')
    .action(async (options: { cwd?: string; action?: string; 'dry-run'?: boolean }) => {
      await tddCommand({
        cwd: options.cwd || process.cwd(),
        action: (options.action as any) || 'next',
        dryRun: options['dry-run'],
      });
    });

  cli.command('disclosure', '渐进式信息展示 — summary|detail|debug')
    .option('--cwd <path>', '项目目录')
    .option('--level <level>', '展示层级: summary|detail|debug')
    .action(async (options: { cwd?: string; level?: string }) => {
      await disclosureCommand({
        cwd: options.cwd || process.cwd(),
        level: options.level,
      });
    });

  cli.command('debug [phase]', '系统化调试工作流 — reproduce/isolate/hypothesize/verify/fix')
    .option('--cwd <path>', '项目目录')
    .action(async (phase: string | undefined, options: { cwd?: string }) => {
      const cwd = options.cwd || process.cwd();
      if (!phase || !['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'].includes(phase)) {
        console.log('用法: docpath debug <reproduce|isolate|hypothesize|verify|fix>');
        return;
      }
      await debugCommand({ cwd, action: phase as any });
    });
}
