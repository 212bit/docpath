/**
 * 命令别名注册
 *
 * 为常用命令提供简短别名，降低认知负担。
 */

import type { CAC } from 'cac';

/**
 * 注册命令别名
 *
 * 通过直接引用现有命令实现，避免重复代码。
 * 必须在所有命令注册完成后调用。
 */
export function registerAliases(cli: CAC): void {
  // 为了实现别名，我们直接创建新命令并复用现有逻辑

  // status 别名: s, st
  cli.command('s', '查看状态（status 的别名）')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 agent 友好的 YAML 状态')
    .option('--verbose', 'agent 输出包含完整诊断字段')
    .action(async (options: { cwd?: string; agent?: boolean; verbose?: boolean }) => {
      const { statusCommand } = await import('../status.js');
      await statusCommand({
        cwd: options.cwd || process.cwd(),
        agent: options.agent,
        verbose: options.verbose
      });
    });

  cli.command('st', '查看状态（status 的别名）')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 agent 友好的 YAML 状态')
    .option('--verbose', 'agent 输出包含完整诊断字段')
    .action(async (options: { cwd?: string; agent?: boolean; verbose?: boolean }) => {
      const { statusCommand } = await import('../status.js');
      await statusCommand({
        cwd: options.cwd || process.cwd(),
        agent: options.agent,
        verbose: options.verbose
      });
    });

  // check 别名: c
  cli.command('c', '运行检查（check 的别名）')
    .option('--cwd <path>', '项目目录')
    .option('--skip-tests', '跳过测试')
    .option('--skip-lint', '跳过代码风格检查')
    .option('--fix-drift <mode>', '自动修复漂移: current|canonical')
    .action(async (options: {
      cwd?: string;
      skipTests?: boolean;
      skipLint?: boolean;
      fixDrift?: string;
      'skip-tests'?: boolean;
      'skip-lint'?: boolean;
      'fix-drift'?: string
    }) => {
      const { checkCommand } = await import('../check.js');
      await checkCommand({
        cwd: options.cwd || process.cwd(),
        skipTests: !!(options.skipTests || options['skip-tests']),
        skipLint: !!(options.skipLint || options['skip-lint']),
        fixDrift: (options.fixDrift || options['fix-drift']) as 'current' | 'canonical' | undefined
      });
    });
}
