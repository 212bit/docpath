import type { CAC } from 'cac';
import { agentCommand } from '../agent.js';
import { continueCommand } from '../continue.js';
import { goCommand } from '../go.js';
import { runCommand } from '../runtime.js';

export function registerExecutionCommands(cli: CAC): void {
  cli.command('continue', '断线重连 — 读取 breadcrumb 恢复执行，检查升级信号')
    .option('--cwd <path>', '项目目录')
    .option('--verbose', '显示详细上下文')
    .action(async (options: { cwd?: string; verbose?: boolean }) => {
      await continueCommand({
        cwd: options.cwd || process.cwd(),
        verbose: options.verbose,
      });
    });

  cli.command('go', '按 plan.md 逐个执行子任务')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '指定子任务编号 (e.g. S1)')
    .option('--status <status>', '收尾状态: done | skipped | blocked')
    .option('--dry-run', '仅预览，不更新状态')
    .action(async (options: { cwd?: string; step?: string; status?: 'done' | 'skipped' | 'blocked'; 'dry-run'?: boolean }) => {
      await goCommand({
        cwd: options.cwd || process.cwd(),
        step: options.step,
        status: options.status,
        dryRun: options['dry-run'],
      });
    });

  cli.command('run <action>', 'Agent runtime lifecycle: start | end | recover')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '当前步骤/子任务')
    .option('--note <note>', '事件备注')
    .option('--status <status>', 'end 状态: done | blocked | skipped')
    .action(async (action: 'start' | 'end' | 'recover', options: { cwd?: string; step?: string; note?: string; status?: 'done' | 'blocked' | 'skipped' }) => {
      await runCommand({
        cwd: options.cwd || process.cwd(),
        action,
        step: options.step,
        note: options.note,
        status: options.status,
      });
    });

  cli.command('agent <action>', 'Agent lifecycle enforcement: enter | step | done | handoff')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '当前步骤/子任务')
    .option('--note <note>', '事件备注')
    .option('--status <status>', '状态: done | blocked | skipped')
    .option('--skip-check', 'done 时跳过 docpath check')
    .option('--skip-review', 'done 时跳过 docpath review')
    .option('--skip-tests', 'check 时跳过 tests')
    .option('--skip-lint', 'check 时跳过 lint')
    .option('--approve-review', 'review 时手动批准')
    .option('--max-entries <n>', 'handoff 压缩时保留 breadcrumb 条数')
    .action(async (action: 'enter' | 'step' | 'done' | 'handoff', options: { cwd?: string; step?: string; note?: string; status?: 'done' | 'blocked' | 'skipped'; skipCheck?: boolean; 'skip-check'?: boolean; skipReview?: boolean; 'skip-review'?: boolean; skipTests?: boolean; 'skip-tests'?: boolean; skipLint?: boolean; 'skip-lint'?: boolean; approveReview?: boolean; 'approve-review'?: boolean; maxEntries?: string; 'max-entries'?: string }) => {
      await agentCommand({
        cwd: options.cwd || process.cwd(),
        action,
        step: options.step,
        note: options.note,
        status: options.status,
        skipCheck: !!(options.skipCheck || options['skip-check']),
        skipReview: !!(options.skipReview || options['skip-review']),
        skipTests: !!(options.skipTests || options['skip-tests']),
        skipLint: !!(options.skipLint || options['skip-lint']),
        approveReview: !!(options.approveReview || options['approve-review']),
        maxEntries: options.maxEntries || options['max-entries'] ? parseInt((options.maxEntries || options['max-entries'])!, 10) : undefined,
      });
    });
}
