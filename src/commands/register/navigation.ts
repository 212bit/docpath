import type { CAC } from 'cac';
import { configCommand } from '../config.js';
import { diffCommand } from '../diff.js';
import { learnCommand } from '../learn.js';
import { resumeCommand } from '../resume.js';

function registerConfigCommand(cli: CAC): void {
  cli.command('config [...args]', '查看/更新配置')
    .option('--cwd <path>', '项目目录')
    .action(async (args: string[], options: { cwd?: string }) => {
      const cwd = options.cwd || process.cwd();
      const subcommand = args[0];

      if (subcommand === 'get' && args[1]) {
        await configCommand({ cwd, get: args[1] });
        return;
      }

      if (subcommand === 'set' && args[1] && args[2]) {
        await configCommand({ cwd, set: `${args[1]}=${args[2]}` });
        return;
      }

      if (subcommand === 'list') {
        await configCommand({ cwd, list: true });
        return;
      }

      await configCommand({ cwd, list: true });
    });
}

function registerResumeCommand(cli: CAC): void {
  cli.command('resume', '断线恢复 — 跳到上次中断点')
    .option('--cwd <path>', '项目目录')
    .option('--verbose', '显示更详细的 checkpoint 上下文')
    .action(async (options: { cwd?: string; verbose?: boolean }) => {
      await resumeCommand({
        cwd: options.cwd || process.cwd(),
        verbose: options.verbose,
      });
    });
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

function registerLearnCommand(cli: CAC): void {
  cli.command('learn [action]', '从 journal 提取规则 → 更新 style.md；支持 groom/prune 清理候选经验')
    .option('--journal <path>', '指定 journal 文件')
    .option('--from-journal', '忽略 lesson-candidates，直接从 journal 提取')
    .option('--dry-run', '只预览提取结果，不写入 style.md / architecture.md')
    .option('--cwd <path>', '项目目录')
    .action(async (action: string | undefined, options: { cwd?: string; journal?: string; 'from-journal'?: boolean; fromJournal?: boolean; 'dry-run'?: boolean; dryRun?: boolean }) => {
      await learnCommand({
        cwd: options.cwd || process.cwd(),
        action,
        journalPath: options.journal,
        fromJournal: options['from-journal'] ?? options.fromJournal,
        dryRun: options['dry-run'] ?? options.dryRun,
      });
    });
}

export function registerNavigationCommands(cli: CAC): void {
  registerConfigCommand(cli);
  registerResumeCommand(cli);
  registerDiffCommand(cli);
  registerLearnCommand(cli);
}
