import type { CAC } from 'cac';
import { agentCommand } from '../agent.js';
import { goCommand } from '../go.js';
import { runCommand } from '../runtime.js';
import { stepPassCommand } from '../step-pass.js';
import { quickDoneCommand } from '../quick-done.js';
import { normalizeEnumOption, parseIntegerOption, getOptionValue } from './shared.js';

export function registerExecutionCommands(cli: CAC): void {

  cli.command('go', '按 plan.md 逐个执行子任务')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '指定子任务编号 (e.g. S1)')
    .option('--status <status>', '收尾状态: done | skipped | blocked')
    .option('--dry-run', '仅预览，不更新状态')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .option('--accept-dirty <reason>', 'R-334: 记录 breadcrumb 证据后跳过 dirty worktree 拦截（当前任务恢复用）')
    .action(async (options: { cwd?: string; step?: string; status?: 'done' | 'skipped' | 'blocked'; dryRun?: boolean; 'dry-run'?: boolean; session?: string; acceptDirty?: string; 'accept-dirty'?: string }) => {
      await goCommand({
        cwd: options.cwd || process.cwd(),
        step: options.step,
        status: normalizeEnumOption(options.status, 'go --status', ['done', 'skipped', 'blocked'] as const),
        dryRun: options.dryRun ?? options['dry-run'],
        session: options.session,
        acceptDirty: options.acceptDirty ?? options['accept-dirty'],
      });
    });

  cli.command('step-pass', '复合生命周期：完成当前步骤并自动启动下一步（agent step done + go）')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '要收尾的步骤；缺省取 state.current_step')
    .option('-a, --all', '一键收尾所有未完成的步骤并给出收口路线')
    .option('--note <note>', '收尾事件备注')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .option('--accept-dirty <reason>', '透传给内部 go：记录证据后跳过 dirty worktree 拦截')
    .action(async (options: { cwd?: string; step?: string; all?: boolean; note?: string; session?: string; acceptDirty?: string; 'accept-dirty'?: string }) => {
      await stepPassCommand({
        cwd: options.cwd || process.cwd(),
        step: options.step,
        all: options.all,
        note: options.note,
        session: options.session,
        acceptDirty: options.acceptDirty ?? options['accept-dirty'],
      });
    });

  cli.command('quick-done', '一键收口：done 门禁序列（check/review/journal）+ 提交准备报告')
    .option('--cwd <path>', '项目目录')
    .option('--note <note>', '事件备注（跳过门禁时必填原因）')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .option('--skip-check', '跳过 docpath check（须给 --note 原因）')
    .option('--skip-review', '跳过 docpath review（须给 --note 原因）')
    .option('--skip-tests', 'check 时跳过 tests')
    .option('--skip-lint', 'check 时跳过 lint')
    .option('--approve-review', 'review 时手动批准')
    .option('--no-dirty-reminder', '不打印未提交业务文件提醒')
    .option('--gotcha <text>', '记录本次快速修复的踩坑点/经验')
    .option('--lesson <text>', '记录本次任务的经验总结')
    .option('--commit', '门禁通过后自动将改动提交到本地 Git')
    .option('--test-scope <scope>', '测试减载级别 full|touched（默认 touched）')
    .option('--all', '强制执行全量测试（等价于 --test-scope=full）')
    .option('--full-tests', '强制执行全量测试')
    .action(async (options: { cwd?: string; note?: string; session?: string; skipCheck?: boolean; 'skip-check'?: boolean; skipReview?: boolean; 'skip-review'?: boolean; skipTests?: boolean; 'skip-tests'?: boolean; skipLint?: boolean; 'skip-lint'?: boolean; approveReview?: boolean; 'approve-review'?: boolean; dirtyReminder?: boolean; 'dirty-reminder'?: boolean; gotcha?: string; lesson?: string; commit?: boolean; 'test-scope'?: string; testScope?: string; all?: boolean; 'full-tests'?: boolean; fullTests?: boolean }) => {
      const argv = process.argv.slice(2);
      const hasFlag = (flag: string) => argv.includes(flag);
      const isAll = options.all || options['full-tests'] || options.fullTests || hasFlag('--all') || hasFlag('--full-tests');
      const testScopeRaw = options['test-scope'] || options.testScope || getOptionValue(argv, '--test-scope');
      const testScope = isAll ? 'full' : testScopeRaw === 'touched' ? 'touched' : testScopeRaw === 'full' ? 'full' : undefined;

      await quickDoneCommand({
        cwd: options.cwd || process.cwd(),
        note: options.note,
        session: options.session,
        skipCheck: !!(options.skipCheck || options['skip-check']),
        skipReview: !!(options.skipReview || options['skip-review']),
        skipTests: !!(options.skipTests || options['skip-tests']),
        skipLint: !!(options.skipLint || options['skip-lint']),
        approveReview: !!(options.approveReview || options['approve-review']),
        noDirtyReminder: options.dirtyReminder === false || options['dirty-reminder'] === false,
        gotcha: options.gotcha,
        lesson: options.lesson,
        commit: options.commit,
        testScope,
        allTests: isAll,
      });
    });

  cli.command('run <action>', 'Agent runtime lifecycle: start | end | recover')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '当前步骤/子任务')
    .option('--note <note>', '事件备注')
    .option('--status <status>', 'end 状态: done | blocked | skipped')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .action(async (action: 'start' | 'end' | 'recover', options: { cwd?: string; step?: string; note?: string; status?: 'done' | 'blocked' | 'skipped'; session?: string }) => {
      await runCommand({
        cwd: options.cwd || process.cwd(),
        action,
        step: options.step,
        note: options.note,
        status: normalizeEnumOption(options.status, 'run --status', ['done', 'blocked', 'skipped'] as const),
        session: options.session,
      });
    });

  cli.command('agent <action>', 'Agent lifecycle enforcement: enter | step | done')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '当前步骤/子任务')
    .option('--batch <step-ids>', '批量补账：逗号分隔的步骤 ID（如 S1,S2,S3），一次性完成多步骤')
    .option('--note <note>', '事件备注（单行；含反引号/$/! 等 shell 特殊字符会被 shell 处理，建议改用 --stdin/--body-file）')
    .option('--stdin', 'R-359: 从标准输入读取 note，绕开 shell 对特殊字符的命令替换/展开')
    .option('--body-file <path>', 'R-359: 从文件读取 note，绕开 shell 特殊字符处理')
    .option('--status <status>', '状态: done | blocked | skipped')
    .option('--skip-check', 'done 时跳过 docpath check')
    .option('--skip-review', 'done 时跳过 docpath review')
    .option('--skip-tests', 'check 时跳过 tests')
    .option('--skip-lint', 'check 时跳过 lint')
    .option('--approve-review', 'review 时手动批准')
    .option('--session <id>', 'agent/session 标识；也可用 DOCPATH_SESSION')
    .option('--no-dirty-reminder', '不打印未提交业务文件提醒')
    .option('--test-scope <scope>', '测试减载级别 full|touched（默认 touched）')
    .option('--all', '强制执行全量测试（等价于 --test-scope=full）')
    .option('--full-tests', '强制执行全量测试')
    .action(async (action: 'enter' | 'step' | 'done', options: { cwd?: string; step?: string; batch?: string; note?: string; stdin?: boolean; 'body-file'?: string; status?: 'done' | 'blocked' | 'skipped'; skipCheck?: boolean; 'skip-check'?: boolean; skipReview?: boolean; 'skip-review'?: boolean; skipTests?: boolean; 'skip-tests'?: boolean; skipLint?: boolean; 'skip-lint'?: boolean; approveReview?: boolean; 'approve-review'?: boolean; session?: string; dirtyReminder?: boolean; 'dirty-reminder'?: boolean; 'test-scope'?: string; testScope?: string; all?: boolean; 'full-tests'?: boolean; fullTests?: boolean }) => {
      const argv = process.argv.slice(2);
      const hasFlag = (flag: string) => argv.includes(flag);
      const isAll = options.all || options['full-tests'] || options.fullTests || hasFlag('--all') || hasFlag('--full-tests');
      const testScopeRaw = options['test-scope'] || options.testScope || getOptionValue(argv, '--test-scope');
      const testScope = isAll ? 'full' : testScopeRaw === 'touched' ? 'touched' : testScopeRaw === 'full' ? 'full' : undefined;

      await agentCommand({
        cwd: options.cwd || process.cwd(),
        action,
        step: options.step,
        batch: options.batch,
        note: options.note,
        stdin: options.stdin,
        bodyFile: options['body-file'],
        status: normalizeEnumOption(options.status, 'agent --status', ['done', 'blocked', 'skipped'] as const),
        skipCheck: !!(options.skipCheck || options['skip-check']),
        skipReview: !!(options.skipReview || options['skip-review']),
        skipTests: !!(options.skipTests || options['skip-tests']),
        skipLint: !!(options.skipLint || options['skip-lint']),
        approveReview: !!(options.approveReview || options['approve-review']),
        session: options.session,
        noDirtyReminder: options.dirtyReminder === false || options['dirty-reminder'] === false,
        testScope,
        allTests: isAll,
      });
    });
}
