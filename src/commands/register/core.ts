import type { CAC } from 'cac';
import { doctorCommand } from '../doctor.js';
import { initCommand } from '../init.js';
import { statusCommand } from '../status.js';
import type { ComplexityLevel } from '../../engine/state-machine.js';

function parseInitLevel(value?: string): ComplexityLevel | undefined {
  if (value === undefined) return undefined;
  if (!/^[0-3]$/.test(value)) {
    throw new Error([
      `docpath init: --level 参数非法: ${value}（允许: 0|1|2|3）`,
      '修复建议:',
      '  docpath init --level 2',
      '  docpath init --interactive',
    ].join('\n'));
  }
  return Number(value) as ComplexityLevel;
}

export function registerCoreCommands(cli: CAC): void {
  cli.command('init', '初始化 .docpath/ 工作流目录')
    .option('--cwd <path>', '项目目录')
    .option('--force', '强制重新生成')
    .option('--level <level>', '初始复杂度级别 (0|1|2|3)')
    .option('--link <path>', '关联已初始化的项目路径')
    .option('--interactive', '交互式初始化')
    .action(async (options: { cwd?: string; force?: boolean; level?: string; link?: string; interactive?: boolean }) => {
      await initCommand({
        cwd: options.cwd || process.cwd(),
        force: !!options.force,
        level: parseInitLevel(options.level),
        link: options.link,
        interactive: !!options.interactive,
      });
    });

  cli.command('status', '查看当前工作流状态')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 agent 友好的 YAML 状态')
    .option('--verbose', 'agent 输出包含完整诊断字段')
    .action(async (options: { cwd?: string; agent?: boolean; verbose?: boolean }) => {
      await statusCommand({ cwd: options.cwd || process.cwd(), agent: options.agent, verbose: options.verbose });
    });

  cli.command('doctor', '只读诊断 DocPath/Git 工作区健康')
    .option('--cwd <path>', '项目目录')
    .option('--json', '输出 JSON')
    .option('--untrack-noise', '从 Git index 移除 tracked ignored DocPath runtime 文件')
    .action(async (options: { cwd?: string; json?: boolean; untrackNoise?: boolean; 'untrack-noise'?: boolean }) => {
      await doctorCommand({
        cwd: options.cwd || process.cwd(),
        json: !!options.json,
        untrackNoise: !!(options.untrackNoise || options['untrack-noise']),
      });
    });
}
