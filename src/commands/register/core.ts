import type { CAC } from 'cac';
import { initCommand } from '../init.js';
import { statusCommand } from '../status.js';

export function registerCoreCommands(cli: CAC): void {
  cli.command('init', '初始化 .docpath/ 工作流目录')
    .option('--cwd <path>', '项目目录')
    .option('--force', '强制重新生成')
    .option('--level <level>', '初始复杂度级别 (0|1|2|3)')
    .option('--link <path>', '关联已初始化的项目路径')
    .action(async (options: { cwd?: string; force?: boolean; level?: string; link?: string }) => {
      await initCommand({
        cwd: options.cwd || process.cwd(),
        force: !!options.force,
        level: options.level ? parseInt(options.level, 10) as any : undefined,
        link: options.link,
      });
    });

  cli.command('status', '查看当前工作流状态')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 agent 友好的 YAML 状态')
    .action(async (options: { cwd?: string; agent?: boolean }) => {
      await statusCommand({ cwd: options.cwd || process.cwd(), agent: options.agent });
    });
}
