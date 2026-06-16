/**
 * 注册操作层命令（Phase 1 Operational Command Layer）
 *
 * 这些命令是语义化包装，调用现有的门禁命令，提供更短、更易用的入口。
 * 设计原则：
 * - 不改变门禁语义
 * - 不削弱状态一致性检查
 * - fail-loud when ambiguous
 * - 输出审计信息
 */

import type { CAC } from 'cac';
import { startCommand } from '../start.js';
import { stepCommand } from '../step.js';
import { doneCommand } from '../done.js';
import { quickCommand } from '../quick.js';
import { recoverCommand, retryCommand, unblockCommand } from '../recovery.js';
import { commitCommand } from '../commit.js';

export function registerOperationalCommands(cli: CAC): void {
  cli
    .command('quick <title>', '创建快车道任务（微型改动，压缩生命周期）')
    .option('--cwd <path>', '项目目录')
    .action(async (title: string, options: { cwd?: string }) => {
      await quickCommand({
        cwd: options.cwd || process.cwd(),
        title,
      });
    });

  cli
    .command('start <step>', '启动计划步骤（语义化包装，调用 go）')
    .option('--cwd <path>', '项目目录')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (step: string, options: { cwd?: string; session?: string }) => {
      await startCommand({
        cwd: options.cwd || process.cwd(),
        step,
        session: options.session,
      });
    });

  cli
    .command('step <status>', '标记当前步骤状态（done/blocked/skipped）')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '显式指定步骤（可选，自动推断）')
    .option('--note <note>', '状态备注')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (status: 'done' | 'blocked' | 'skipped', options: { cwd?: string; step?: string; note?: string; session?: string }) => {
      await stepCommand({
        cwd: options.cwd || process.cwd(),
        status,
        step: options.step,
        note: options.note,
        session: options.session,
      });
    });

  cli
    .command('done', '完成任务（保留所有门禁：check → review → journal）')
    .option('--cwd <path>', '项目目录')
    .option('--skip-check', '跳过 check 门禁')
    .option('--skip-review', '跳过 review 门禁')
    .option('--skip-tests', 'check 时跳过 tests')
    .option('--skip-lint', 'check 时跳过 lint')
    .option('--approve-review', 'review 时手动批准')
    .option('--note <note>', '跳过原因（--skip-* 时必需）')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (options: {
      cwd?: string;
      skipCheck?: boolean;
      'skip-check'?: boolean;
      skipReview?: boolean;
      'skip-review'?: boolean;
      skipTests?: boolean;
      'skip-tests'?: boolean;
      skipLint?: boolean;
      'skip-lint'?: boolean;
      approveReview?: boolean;
      'approve-review'?: boolean;
      note?: string;
      session?: string;
    }) => {
      await doneCommand({
        cwd: options.cwd || process.cwd(),
        skipCheck: options.skipCheck || options['skip-check'],
        skipReview: options.skipReview || options['skip-review'],
        skipTests: options.skipTests || options['skip-tests'],
        skipLint: options.skipLint || options['skip-lint'],
        approveReview: options.approveReview || options['approve-review'],
        note: options.note,
        session: options.session,
      });
    });

  cli
    .command('recover <step>', '从 blocked 状态恢复执行')
    .option('--cwd <path>', '项目目录')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (step: string, options: { cwd?: string; session?: string }) => {
      await recoverCommand({
        cwd: options.cwd || process.cwd(),
        step,
        session: options.session,
      });
    });

  cli
    .command('retry <step>', '重试 skipped 步骤')
    .option('--cwd <path>', '项目目录')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (step: string, options: { cwd?: string; session?: string }) => {
      await retryCommand({
        cwd: options.cwd || process.cwd(),
        step,
        session: options.session,
      });
    });

  cli
    .command('unblock <step>', '显式解除阻塞并重新开始')
    .option('--cwd <path>', '项目目录')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (step: string, options: { cwd?: string; session?: string }) => {
      await unblockCommand({
        cwd: options.cwd || process.cwd(),
        step,
        session: options.session,
      });
    });

  cli
    .command('commit', 'Git 收口包装：预览/暂存/提交（Phase 2）')
    .option('--cwd <path>', '项目目录')
    .option('--stage', '暂存推荐文件（不提交）')
    .option('-m, --message <msg>', '提交信息（暂存并提交）')
    .option('--include <pattern>', '额外暂存的文件模式（可多次使用）', { default: [] })
    .action(async (options: {
      cwd?: string;
      stage?: boolean;
      message?: string;
      include?: string | string[];
    }) => {
      const includePatterns = Array.isArray(options.include)
        ? options.include
        : options.include
        ? [options.include]
        : undefined;

      await commitCommand({
        cwd: options.cwd || process.cwd(),
        dryRun: !options.stage && !options.message,
        stage: options.stage || false,
        message: options.message,
        includePatterns,
      });
    });
}
