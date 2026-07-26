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
import { doneCommand } from '../done.js';
import { quickCommand } from '../quick.js';
import { recoverCommand } from '../recovery.js';
import { commitCommand } from '../commit.js';
import { mergeDriverCommand } from '../merge-driver.js';

export function registerOperationalCommands(cli: CAC): void {
  cli
    .command('quick <title>', '创建快车道任务（微型改动，压缩生命周期）')
    .option('--cwd <path>', '项目目录')
    .option('--instant', '即时档：跳 build/test，仅 typecheck + 结构门禁，跳 review')
    .action(async (title: string, options: { cwd?: string; instant?: boolean }) => {
      await quickCommand({
        cwd: options.cwd || process.cwd(),
        title,
        instant: options.instant,
      });
    });

  // R-299: start/step 步进糖已删除——go（原子认领）+ agent step --status 完全覆盖。
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
    .option('--no-dirty-reminder', '不打印未提交业务文件提醒')
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
      dirtyReminder?: boolean;
      'dirty-reminder'?: boolean;
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
        noDirtyReminder: options.dirtyReminder === false || options['dirty-reminder'] === false,
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

  // R-299: retry/unblock 步进糖已删除——recover 覆盖阻塞恢复语义。
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

  cli
    .command('merge-driver', 'Smart Git three-way merge driver (invoked by git)')
    .option('--ancestor <file>', 'Ancestor (%O)')
    .option('--current <file>', 'Current (%A)')
    .option('--other <file>', 'Other (%B)')
    .option('--path <path>', 'Path (%P)')
    .option('--cwd <path>', 'Working directory')
    .action(async (options: {
      ancestor: string;
      current: string;
      other: string;
      path: string;
      cwd?: string;
    }) => {
      await mergeDriverCommand({
        ancestor: options.ancestor,
        current: options.current,
        other: options.other,
        path: options.path,
        cwd: options.cwd || process.cwd(),
      });
    });
}
