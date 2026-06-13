import type { CAC } from 'cac';
import { checkCommand } from '../check.js';
import { journalCommand } from '../journal.js';
import { reviewCommand } from '../review.js';
import { writeJournalCommand } from '../write-journal.js';
import { getOptionValue, normalizeTaskFileSyncSource } from './shared.js';

export function registerQualityCommands(cli: CAC): void {
  cli.command('check', '质量门禁 — 编译/测试/lint/检查 + 工作流护栏')
    .option('--cwd <path>', '项目目录')
    .option('--skip-tests', '跳过测试')
    .option('--skip-lint', '跳过 lint')
    .option('--harness', '启用工作流护栏检查 (pre-flight/boundary/pattern)')
    .option('--preflight', '仅执行 pre-flight 检查')
    .option('--boundary', '仅执行 boundary 检查')
    .option('--only-harness', '仅执行 harness 检查，跳过编译/测试/lint')
    .option('--fix-drift <source>', '检测到任务文件漂移时自动同步: canonical | current')
    .option('--verbose', '显示所有检查项（包括成功项）')
    .action(async (options: { cwd?: string; 'skip-tests'?: boolean; 'skip-lint'?: boolean; harness?: boolean; preflight?: boolean; boundary?: boolean; 'only-harness'?: boolean; 'fix-drift'?: string; fixDrift?: string; verbose?: boolean }) => {
      const argv = process.argv.slice(2);
      const hasFlag = (flag: string) => argv.includes(flag);
      const skipTests = options['skip-tests'] || hasFlag('--skip-tests');
      const skipLint = options['skip-lint'] || hasFlag('--skip-lint');
      const harness = options.harness || hasFlag('--harness');
      const preflight = options.preflight || hasFlag('--preflight');
      const boundary = options.boundary || hasFlag('--boundary');
      const onlyHarness = options['only-harness'] || hasFlag('--only-harness');
      const fixDrift = normalizeTaskFileSyncSource(options['fix-drift'] || options.fixDrift || getOptionValue(argv, '--fix-drift'), 'check --fix-drift');
      const verbose = options.verbose || hasFlag('--verbose');

      await checkCommand({
        cwd: options.cwd || process.cwd(),
        skipTests,
        skipLint,
        harness: harness || onlyHarness,
        preflight,
        boundary,
        onlyHarness,
        fixDrift,
        verbose,
      });
    });

  cli.command('review', '结构化代码审查 (可选 LLM 深度审查)')
    .option('--cwd <path>', '项目目录')
    .option('--scope <scope>', '审查范围: all|staged|last_commit (默认 all)')
    .option('--dry-run', '只预览审查结果，不写入状态')
    .option('--no-ai', '跳过 LLM 审查')
    .option('--approve', '直接批准（跳过自动检查）')
    .action(async (options: { cwd?: string; scope?: string; ai?: boolean; approve?: boolean; 'dry-run'?: boolean; dryRun?: boolean }) => {
      await reviewCommand({
        cwd: options.cwd || process.cwd(),
        scope: (options.scope as any) || 'all',
        dryRun: options['dry-run'] ?? options.dryRun,
        approve: options.approve ?? false,
      });
    });

  cli.command('journal', '知识归档 — 从完成任务中提炼经验')
    .option('--cwd <path>', '项目目录')
    .option('--skip-ai', '跳过 LLM，直接写模板')
    .option('--skip-gc', '跳过 decisions.md 自动老化')
    .option('--optional-archive <mode>', '归档模式: always|skip|dry-run')
    .option('--dry-run', '预览归档，不写入状态、breadcrumb 或决策日志')
    .action(async (options: { cwd?: string; 'skip-ai'?: boolean; skipAi?: boolean; 'skip-gc'?: boolean; skipGc?: boolean; 'optional-archive'?: 'always' | 'skip' | 'dry-run'; optionalArchive?: 'always' | 'skip' | 'dry-run'; 'dry-run'?: boolean; dryRun?: boolean }) => {
      await journalCommand({
        cwd: options.cwd || process.cwd(),
        skipAi: options['skip-ai'] ?? options.skipAi,
        skipDecisionGc: options['skip-gc'] ?? options.skipGc,
        archiveMode: (options.dryRun || options['dry-run']) ? 'dry-run' : (options['optional-archive'] ?? options.optionalArchive),
      });
    });

  cli.command('write-journal', '将归档知识记录写回当前任务 spec.md')
    .option('--cwd <path>', '项目目录')
    .option('--content <content>', 'journal 内容（Markdown）')
    .option('--stdin', '从 stdin 读取内容')
    .action(async (options: { cwd?: string; content?: string; stdin?: boolean }) => {
      await writeJournalCommand({
        cwd: options.cwd || process.cwd(),
        content: options.content,
        stdin: options.stdin,
      });
    });
}
