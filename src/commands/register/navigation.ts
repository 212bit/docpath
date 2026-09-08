import type { CAC } from 'cac';
import { diffCommand } from '../diff.js';

function registerResumeCommand(cli: CAC): void {
}

function registerDiffCommand(cli: CAC): void {
  cli.command('diff', '查看步骤间差异')
    .option('--scope <scope>', '差异范围: staged|last|step|all')
    .option('--step <step>', '指定步骤编号 (e.g. S1)')
    .option('--no-color', '禁用颜色')
    .option('--cwd <path>', '项目目录')
    .action(async (options: { cwd?: string; scope?: string; step?: string; 'no-color'?: boolean }) => {
      await diffCommand({
        cwd: options.cwd || process.cwd(),
        scope: options.scope,
        step: options.step,
        noColor: options['no-color'],
      });
    });
}

export function registerNavigationCommands(cli: CAC): void {
  registerResumeCommand(cli);
  registerDiffCommand(cli);
}

