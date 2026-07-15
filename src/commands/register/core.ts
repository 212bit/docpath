import type { CAC } from 'cac';
import { doctorCommand } from '../doctor.js';
import { initCommand } from '../init.js';
import { statusCommand } from '../status.js';
import { onboardCommand } from '../onboard.js';
import { helpMeCommand } from '../help-me.js';
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
    .option('--scan-existing', '扫描现有项目接入：提取真实技术栈/目录结构/test-build 命令并接入外部文档 (alias: -s)')
    .option('-s', 'scan-existing 的短别名')
    .action(async (options: { cwd?: string; force?: boolean; level?: string; link?: string; interactive?: boolean; scanExisting?: boolean; s?: boolean }) => {
      await initCommand({
        cwd: options.cwd || process.cwd(),
        force: !!options.force,
        level: parseInitLevel(options.level),
        link: options.link,
        interactive: !!options.interactive,
        scanExisting: !!(options.scanExisting || (options as { s?: boolean }).s),
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

  cli.command('onboard', '交互式入门向导（适合新用户）')
    .option('--cwd <path>', '项目目录')
    .option('--reset', '重置入门向导状态')
    .action(async (options: { cwd?: string; reset?: boolean }) => {
      await onboardCommand({
        cwd: options.cwd || process.cwd(),
        reset: !!options.reset,
      });
    });

  cli.command('help-me', '根据当前状态提供相关帮助')
    .option('--cwd <path>', '项目目录')
    .action(async (options: { cwd?: string }) => {
      await helpMeCommand({
        cwd: options.cwd || process.cwd(),
      });
    });
}
