import type { CAC } from 'cac';
import { debugCommand } from '../debug.js';
import { tddCommand } from '../tdd.js';
import { disclosureCommand } from '../../utils/disclosure.js';
import { warnDeprecatedCommand } from './command-metadata.js';

export function registerTddDebugCommands(cli: CAC): void {
  cli.command('tdd', 'TDD 工作流 — start/spec/plan/act/check/done')
    .option('--cwd <path>', '项目目录')
    .option('--action <action>', 'TDD 动作: start|next|done')
    .option('--dry-run', '仅预览')
    .action(async (options: { cwd?: string; action?: string; 'dry-run'?: boolean }) => {
      warnDeprecatedCommand('tdd', 'plan, go, check, review');
      const validActions = ['start', 'next', 'done'] as const;
      const action = options.action && validActions.includes(options.action as typeof validActions[number])
        ? (options.action as typeof validActions[number])
        : 'next';
      await tddCommand({
        cwd: options.cwd || process.cwd(),
        action,
        dryRun: options['dry-run'],
      });
    });

  cli.command('disclosure', '渐进式信息展示 — summary|detail|debug')
    .option('--cwd <path>', '项目目录')
    .option('--level <level>', '展示层级: summary|detail|debug')
    .action(async (options: { cwd?: string; level?: string }) => {
      warnDeprecatedCommand('disclosure', 'reveal or context');
      await disclosureCommand({
        cwd: options.cwd || process.cwd(),
        level: options.level,
      });
    });

  cli.command('debug [phase]', '系统化调试工作流 — reproduce/isolate/hypothesize/verify/fix')
    .option('--cwd <path>', '项目目录')
    .action(async (phase: string | undefined, options: { cwd?: string }) => {
      const cwd = options.cwd || process.cwd();
      const validPhases = ['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'] as const;
      if (!phase || !validPhases.includes(phase as typeof validPhases[number])) {
        console.log('用法: docpath debug <reproduce|isolate|hypothesize|verify|fix>');
        return;
      }
      await debugCommand({ cwd, action: phase as typeof validPhases[number] });
    });
}
