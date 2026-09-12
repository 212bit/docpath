import type { CAC } from 'cac';
import { nextCommand } from '../runtime.js';
import { hooksStatusCommand } from '../../hooks/bridge.js';
import { getOptionValue, normalizeEnumOption, normalizeTaskFileSyncSource, parseIntegerOption } from './shared.js';

export function registerRuntimeToolCommands(cli: CAC): void {
  cli.command('next', '输出下一步建议')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent YAML')
    .option('--compact', 'agent 输出精简为核心路由字段 (state/next_action/recommended_command/step_id)')
    .option('--verbose', 'agent 输出包含完整诊断字段')
    .option('--auto-fix <source>', '检测到任务文件漂移时自动同步: canonical | current')
    .action(async (options: { cwd?: string; agent?: boolean; verbose?: boolean; compact?: boolean; 'auto-fix'?: string; autoFix?: string }) => {
      const argv = process.argv.slice(2);
      await nextCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
        verbose: !!options.verbose,
        compact: !!options.compact,
        autoFix: normalizeTaskFileSyncSource(options['auto-fix'] || options.autoFix || getOptionValue(argv, '--auto-fix'), 'next --auto-fix'),
      });
    });

  cli.command('hooks <action>', '内部 hook 工具: status')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent YAML')
    .action(async (action: 'status', options: { cwd?: string; agent?: boolean }) => {
      if (action !== 'status') {
        throw new Error(`docpath hooks: unsupported action ${action} (expected status)`);
      }
      await hooksStatusCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
      });
    });

}
