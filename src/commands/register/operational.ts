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
import { startCommand } from '../start.js';
import { recoverCommand } from '../recovery.js';
import { commitCommand } from '../commit.js';
import { mergeDriverCommand } from '../merge-driver.js';
import { learnCommand } from '../learn.js';
import { getOptionValue } from './shared.js';

export function registerOperationalCommands(cli: CAC): void {
  cli
    .command('start <id>', '一键从 Backlog 拉起任务并启动执行（promote + plan + go S1）')
    .option('--cwd <path>', '项目目录')
    .option('--step <step>', '指定起始步骤（缺省: S1）')
    .option('--draft', '快速通道推送（跳过成熟度检查）')
    .option('--adopt', '就地认领当前工作区变更并启动任务（不触发 Worktree 隔离）')
    .option('--agent', 'Agent 输出模式')
    .action(async (id: string, options: { cwd?: string; step?: string; draft?: boolean; agent?: boolean; adopt?: boolean }) => {
      await startCommand({
        cwd: options.cwd || process.cwd(),
        id,
        step: options.step,
        draft: options.draft,
        agent: options.agent,
        adopt: options.adopt,
      });
    });

  cli
    .command('learn [action]', '经验规约固化流水线：将候选经验固化为 rules 规约')
    .option('--cwd <path>', '项目目录')
    .option('--dry-run', '仅预览待固化规则，不修改文件')
    .option('--agent', 'Agent 机器输出模式（YAML）')
    .action(async (action: string | undefined, options: { cwd?: string; dryRun?: boolean; 'dry-run'?: boolean; agent?: boolean }) => {
      await learnCommand({
        cwd: options.cwd || process.cwd(),
        dryRun: !!(options.dryRun || options['dry-run']),
        action: action === 'groom' || action === 'prune' ? action : 'learn',
        agent: !!options.agent,
      });
    });
  cli
    .command('quick [title]', '创建快车道任务（微型改动，压缩生命周期）或原地升级为 standard (quick upgrade)')
    .option('--cwd <path>', '项目目录')
    .option('--instant', '即时档：跳 build/test，仅 typecheck + 结构门禁，跳 review')
    .option('--adopt', '事后补录：认领当前未提交的微型改动（跳过 clean worktree 拦截）')
    .option('--upgrade', '原地升级：将当前 quick 任务原地升级为 standard 流程并闭环执行计划')
    .option('--done', '一键收口：创建后直接运行 done 门禁序列')
    .option('--commit', '一键完成并提交：创建后运行 done 门禁并在通过后自动提交')
    .action(async (title: string | undefined, options: { cwd?: string; instant?: boolean; adopt?: boolean; upgrade?: boolean; done?: boolean; commit?: boolean }) => {
      await quickCommand({
        cwd: options.cwd || process.cwd(),
        title: title || (options.upgrade ? 'upgrade' : ''),
        instant: options.instant,
        adopt: options.adopt,
        upgrade: options.upgrade || title === 'upgrade',
        done: options.done,
        commit: options.commit,
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
    .option('--no-dirty-reminder', '不打印未提交业务文件提醒')
    .option('--commit', '门禁通过后自动将改动提交到本地 Git')
    .option('--test-scope <scope>', '测试减载级别 full|touched（默认 touched）')
    .option('--all', '强制执行全量测试（等价于 --test-scope=full）')
    .option('--full-tests', '强制执行全量测试')
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
      commit?: boolean;
      'test-scope'?: string;
      testScope?: string;
      all?: boolean;
      'full-tests'?: boolean;
      fullTests?: boolean;
    }) => {
      const argv = process.argv.slice(2);
      const hasFlag = (flag: string) => argv.includes(flag);
      const isAll = options.all || options['full-tests'] || options.fullTests || hasFlag('--all') || hasFlag('--full-tests');
      const testScopeRaw = options['test-scope'] || options.testScope || getOptionValue(argv, '--test-scope');
      const testScope = isAll ? 'full' : testScopeRaw === 'touched' ? 'touched' : testScopeRaw === 'full' ? 'full' : undefined;

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
        commit: options.commit,
        testScope,
        allTests: isAll,
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
    .command('commit', 'Git 收口包装：预览/暂存/提交（Phase 2）')
    .option('--cwd <path>', '项目目录')
    .option('--stage', '暂存推荐文件（不提交）')
    .option('-m, --message <msg>', '提交信息（暂存并提交）')
    .option('--auto', '自动从任务信息生成提交信息并提交')
    .option('--include <pattern>', '额外暂存的文件模式（可多次使用）', { default: [] })
    .action(async (options: {
      cwd?: string;
      stage?: boolean;
      message?: string;
      auto?: boolean;
      include?: string | string[];
    }) => {
      const includePatterns = Array.isArray(options.include)
        ? options.include
        : options.include
        ? [options.include]
        : undefined;

      await commitCommand({
        cwd: options.cwd || process.cwd(),
        dryRun: !options.stage && !options.message && !options.auto,
        stage: options.stage || false,
        message: options.message,
        autoMessage: options.auto,
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
