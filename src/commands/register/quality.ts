import type { CAC } from 'cac';
import { checkCommand } from '../check.js';
import { journalCommand } from '../journal.js';
import { reviewCommand } from '../review.js';
import { verifyCommand } from '../verify.js';
import { writeReviewSkillCommand } from '../write-review-skill.js';
import { writeJournalCommand } from '../write-journal.js';
import { getOptionValue, normalizeEnumOption, normalizeTaskFileSyncSource } from './shared.js';

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
    .option('--with-review', '检查通过后自动运行 review')
    .option('--non-interactive', '禁用交互式提示（脚本/CI 环境）')
    .option('--no-cache', 'R-331: 禁用 scope 缓存复用，强制全量执行重 runner')
    .option('--force', 'R-333: 允许在无活跃 agent 会话时独立运行（压制会话警告）')
    .option('--no-env-exempt', 'R-350: 关闭环境豁免——即使全部失败项都是工具链不可用也按失败处理')
    .option('--test-scope <scope>', 'R-3xx: 测试减载级别 full|touched（touched=仅跑与本次改动相关的测试，触及核心路径自动回落全量）')
    .action(async (options: { cwd?: string; 'skip-tests'?: boolean; 'skip-lint'?: boolean; harness?: boolean; preflight?: boolean; boundary?: boolean; 'only-harness'?: boolean; 'fix-drift'?: string; fixDrift?: string; verbose?: boolean; 'with-review'?: boolean; withReview?: boolean; 'non-interactive'?: boolean; nonInteractive?: boolean; 'no-cache'?: boolean; noCache?: boolean; force?: boolean; 'env-exempt'?: boolean; envExempt?: boolean; 'test-scope'?: string; testScope?: string }) => {
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
      const withReview = options['with-review'] || options.withReview || hasFlag('--with-review');
      const nonInteractive = options['non-interactive'] || options.nonInteractive || hasFlag('--non-interactive');
      const noCache = options['no-cache'] || options.noCache || hasFlag('--no-cache');
      const force = options.force || hasFlag('--force');
      // R-350: --no-env-exempt 在 commander 下解析为 envExempt=false；同时兜住原始 argv 形态。
      const noEnvExempt = options.envExempt === false || options['env-exempt'] === false || hasFlag('--no-env-exempt');
      const testScopeRaw = options['test-scope'] || options.testScope || getOptionValue(argv, '--test-scope');
      const testScope = testScopeRaw === 'touched' ? 'touched' : testScopeRaw === 'full' ? 'full' : undefined;

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
        withReview,
        nonInteractive,
        noCache,
        force,
        noEnvExempt,
        testScope,
      });
    });

  cli.command('review', '结构化代码审查 (本地静态检查)')
    .option('--cwd <path>', '项目目录')
    .option('--scope <scope>', '审查范围: all|staged|last_commit|task (默认: 活跃任务走 task 累计 diff, 否则 all)')
    .option('--dry-run', '只预览审查结果，不写入状态')
    .option('--approve', '直接批准（跳过自动检查）')
    .option('--force', '允许在无活跃 agent 会话时独立运行')
    .option('--skip-skill-review <skill>', '按 skill 粒度临时跳过 Review Skill Gate，可用逗号分隔')
    .option('--reason <reason>', 'skip skill review 的必填原因')
    .option('--non-interactive', 'R-337: 与 check 对齐的旗标面（review 本无交互路径，接受即为兼容）')
    .action(async (options: { cwd?: string; scope?: string; ai?: boolean; approve?: boolean; 'dry-run'?: boolean; dryRun?: boolean; force?: boolean; 'skip-skill-review'?: string | string[] | boolean; skipSkillReview?: string | string[] | boolean; reason?: string; 'non-interactive'?: boolean; nonInteractive?: boolean }) => {
      await reviewCommand({
        cwd: options.cwd || process.cwd(),
        // R-276: 缺省时不强制 all, 由 reviewCommand 按活跃任务解析默认口径。
        scope: normalizeEnumOption(options.scope, 'review --scope', ['all', 'staged', 'last_commit', 'task'] as const),
        dryRun: options['dry-run'] ?? options.dryRun,
        approve: options.approve ?? false,
        force: options.force ?? false,
        skipSkillReview: [options['skip-skill-review'], options.skipSkillReview].filter(Boolean),
        skipSkillReviewReason: options.reason,
      });
    });

  cli.command('write-review-skill', '写入语言级 review skill evidence')
    .option('--cwd <path>', '项目目录')
    .option('--skill <skill>', 'Router requirement skill id')
    .option('--language <language>', '语言: typescript|javascript')
    .option('--scope <scope>', '审查范围: all|staged|last_commit|task (默认与 docpath review 同源解析)')
    .option('--status <status>', '结果: pass|fail')
    .option('--files <files>', '逗号分隔的文件列表，必须覆盖当前 requirement')
    .option('--findings-json <json>', 'findings JSON，形如 {"findings":[]}')
    .option('--summary <summary>', '审查摘要')
    .option('--content <json>', 'review skill evidence JSON')
    .option('--stdin', '从 stdin 读取 review skill evidence JSON')
    .action(async (options: { cwd?: string; skill?: string; language?: string; scope?: string; status?: string; files?: string; 'findings-json'?: string; findingsJson?: string; summary?: string; content?: string; stdin?: boolean }) => {
      await writeReviewSkillCommand({
        cwd: options.cwd || process.cwd(),
        skill: options.skill,
        language: options.language,
        scope: normalizeEnumOption(options.scope, 'write-review-skill --scope', ['all', 'staged', 'last_commit', 'task'] as const),
        status: options.status,
        files: options.files,
        findingsJson: options['findings-json'] || options.findingsJson,
        summary: options.summary,
        content: options.content,
        stdin: options.stdin,
      });
    });

  cli.command('verify', '语义反漂移与需求闭环门禁 (Scope 边界/FR 闭环/步骤真实性)')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent 消费的结构化 YAML 格式')
    .option('--json', '输出 JSON 格式')
    .action(async (options: { cwd?: string; agent?: boolean; json?: boolean }) => {
      await verifyCommand({
        cwd: options.cwd || process.cwd(),
        agent: options.agent,
        json: options.json,
      });
    });

  cli.command('journal', '知识归档 — 从完成任务中提炼经验')
    .option('--cwd <path>', '项目目录')
    .option('--skip-gc', '跳过 decisions.md 自动老化')
    .option('--optional-archive <mode>', '物理任务目录归档模式: always|skip|dry-run；skip 会保留 canonical evidence 供 git closeout')
    .option('--dry-run', '预览归档，不写入状态、breadcrumb 或决策日志')
    .action(async (options: { cwd?: string; 'skip-gc'?: boolean; skipGc?: boolean; 'optional-archive'?: 'always' | 'skip' | 'dry-run'; optionalArchive?: 'always' | 'skip' | 'dry-run'; 'dry-run'?: boolean; dryRun?: boolean }) => {
      await journalCommand({
        cwd: options.cwd || process.cwd(),
        skipDecisionGc: options['skip-gc'] ?? options.skipGc,
        dryRun: !!(options.dryRun || options['dry-run']),
        archiveMode: options['optional-archive'] ?? options.optionalArchive,
      });
    });

  cli.command('write-journal', '将归档知识记录写回当前任务 spec.md')
    .option('--cwd <path>', '项目目录')
    .option('--content <content>', 'journal 内容（Markdown）')
    .option('--structured', '将内容解析为 AI-native structured journal JSON 并路由写入 spec/rules/decisions')
    .option('--stdin', '从 stdin 读取内容')
    .action(async (options: { cwd?: string; content?: string; structured?: boolean; stdin?: boolean }) => {
      await writeJournalCommand({
        cwd: options.cwd || process.cwd(),
        content: options.content,
        structured: !!options.structured,
        stdin: options.stdin,
      });
    });
}
