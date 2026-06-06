import type { CAC } from 'cac';
import { docsCommand } from '../docs.js';
import { installCommand } from '../install.js';
import { revealCommand } from '../reveal.js';
import { unlinkCommand } from '../unlink.js';

export function registerDocsInstallCommands(cli: CAC): void {
  cli.command('docs [action]', '文档资产管理')
    .option('--cwd <path>', '项目目录')
    .option('--scan', '扫描文档生成索引')
    .option('--list', '列出所有注册文档')
    .option('--add <path>', '添加文档到索引')
    .action(async (action: string | undefined, options: { cwd?: string; scan?: boolean; list?: boolean; add?: string }) => {
      const sub = action || (options.scan ? 'scan' : options.add ? 'add' : 'list');
      await docsCommand({
        cwd: options.cwd || process.cwd(),
        action: sub,
        args: options.add ? [options.add] : [],
      });
    });

  cli.command('reveal', '渐进式上下文披露 — 按 level 0-3 输出上下文')
    .option('--cwd <path>', '项目目录')
    .option('--level <level>', '披露级别: 0(micro)|1(brief)|2(standard)|3(full)')
    .option('--topic <topic>', '按文档 path/title/summary/scope/type 过滤')
    .option('--format <format>', '输出格式: text(默认)|raw')
    .option('--output <file>', '保存到文件')
    .action(async (options: { cwd?: string; level?: string; topic?: string; format?: string; output?: string }) => {
      const argv = process.argv;
      const getArg = (flag: string): string | undefined => {
        const idx = argv.indexOf(flag);
        return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
      };

      const levelStr = options.level || getArg('--level') || '1';
      await revealCommand({
        cwd: options.cwd || process.cwd(),
        level: parseInt(levelStr, 10),
        topic: options.topic || getArg('--topic'),
        format: (options.format || getArg('--format') || 'text') as 'text' | 'raw',
        output: options.output || getArg('--output'),
      });
    });

  cli.command('unlink', '取消项目关联')
    .option('--cwd <path>', '项目目录')
    .action(async (options: { cwd?: string }) => {
      await unlinkCommand({ cwd: options.cwd || process.cwd() });
    });

  registerInstallCommand(cli);
}

function registerInstallCommand(cli: CAC): void {
  cli.command('install', '安装 Agent 协议文件到项目')
    .option('--cwd <path>', '项目目录')
    .option('--target <type>', '目标类型: codex | claude | opencode | universal (默认 universal)')
    .option('--force', '覆盖已有文件')
    .option('--check-only', '仅检查安装资产 manifest 漂移，不写入文件')
    .option('--check', '仅检查安装资产 manifest 漂移，不写入文件（--check-only 别名）')
    .option('--hooks', '安装 git hooks')
    .option('--hook-mode <mode>', 'pre-commit 模式: check | agent-done (默认 check)')
    .action(async (options: { cwd?: string; target?: string; force?: boolean; check?: boolean; checkOnly?: boolean; 'check-only'?: boolean; hooks?: boolean; hookMode?: string; 'hook-mode'?: string }) => {
      await installCommand({
        cwd: options.cwd || process.cwd(),
        target: options.target,
        force: !!options.force,
        check: !!options.check,
        checkOnly: !!(options.checkOnly || options['check-only']),
        hooks: !!options.hooks,
        hookMode: options.hookMode || options['hook-mode'],
      });
    });
}
