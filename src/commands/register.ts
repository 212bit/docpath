/** 注册 DocPath CLI 命令。 */

import type { CAC } from 'cac';
import { initCommand } from './init.js';
import { statusCommand } from './status.js';
import { brainstormCommand } from './brainstorm.js';
import { refineCommand } from './refine.js';
import { writeSpecCommand } from './write-spec.js';
import { writePlanCommand } from './write-plan.js';
import { writeJournalCommand } from './write-journal.js';
import { planCommand } from './plan.js';
import { continueCommand } from './continue.js';
import { goCommand } from './go.js';
import { checkCommand } from './check.js';
import { reviewCommand } from './review.js';
import { journalCommand } from './journal.js';
import { configCommand } from './config.js';
import { resumeCommand } from './resume.js';
import { diffCommand } from './diff.js';
import { learnCommand } from './learn.js';
import { contextCommand } from './context.js';
import { exportCommand } from './export.js';
import { statsCommand } from './stats.js';
import { unlinkCommand } from './unlink.js';
import { docsCommand } from './docs.js';
import { revealCommand } from './reveal.js';
import { installCommand } from './install.js';
import { tddCommand } from './tdd.js';
import { debugCommand } from './debug.js';
import { backlogCommand } from './backlog.js';
import { tasksCommand } from './tasks.js';
import { taskCommand } from './task.js';
import { gcCommand } from './gc.js';
import { runCommand, compactCommand, discoverCommand, nextCommand } from './runtime.js';
import { agentCommand } from './agent.js';
import { disclosureCommand } from '../utils/disclosure.js';

function getOptionValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function normalizeTaskFileSyncSource(value: string | undefined, optionName: string): 'canonical' | 'current' | undefined {
  if (!value) return undefined;
  if (value === 'canonical' || value === 'current') return value;
  throw new Error(`docpath ${optionName}: 参数非法: ${value}（允许: canonical|current）`);
}

function registerInitializationCommands(cli: CAC): void {

// ─── docpath:init ───
cli.command('init', '初始化 .docpath/ 工作流目录')
  .option('--cwd <path>', '项目目录')
  .option('--force', '强制重新生成')
  .option('--level <level>', '初始复杂度级别 (0|1|2|3)')
  .option('--link <path>', '关联已初始化的项目路径')
  .action(async (options: { cwd?: string; force?: boolean; level?: string; link?: string }) => {
    await initCommand({
      cwd: options.cwd || process.cwd(),
      force: !!options.force,
      level: options.level ? parseInt(options.level, 10) as any : undefined,
      link: options.link,
    });
  });

// ─── docpath:status ───
cli.command('status', '查看当前工作流状态')
  .option('--cwd <path>', '项目目录')
  .option('--agent', '输出 agent 友好的 YAML 状态')
  .action(async (options: { cwd?: string; agent?: boolean }) => {
    await statusCommand({ cwd: options.cwd || process.cwd(), agent: options.agent });
  });

}

function registerBrainstormCommands(cli: CAC): void {
// ─── docpath:brainstorm ───
cli.command('brainstorm [file]', '苏格拉底式需求拷问 — 从模糊需求到结构化 spec')
  .option('--cwd <path>', '项目目录')
  .option('--input <input>', '初始需求描述')
  .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
  .option('--dry-run', '非交互模式，直接输出 spec 预览')
  .option('--one-shot', '单次模式：直接从 input 生成 spec，不进入交互循环')
  .action(async (file: string | undefined, options: { cwd?: string; input?: string; file?: string; 'dry-run'?: boolean; oneShot?: boolean }) => {
    await brainstormCommand({
      cwd: options.cwd || process.cwd(),
      input: options.input,
      file: file || options.file,
      dryRun: options['dry-run'],
      noInteractive: options['oneShot'],
    });
  });

// 常见误拼兼容：brainstor -> brainstorm
cli.command('brainstor [file]', 'brainstorm 的兼容别名')
  .option('--cwd <path>', '项目目录')
  .option('--input <input>', '初始需求描述')
  .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
  .option('--dry-run', '非交互模式，直接输出 spec 预览')
  .option('--one-shot', '单次模式：直接从 input 生成 spec，不进入交互循环')
  .action(async (file: string | undefined, options: { cwd?: string; input?: string; file?: string; 'dry-run'?: boolean; oneShot?: boolean }) => {
    await brainstormCommand({
      cwd: options.cwd || process.cwd(),
      input: options.input,
      file: file || options.file,
      dryRun: options['dry-run'],
      noInteractive: options['oneShot'],
    });
  });

}

function registerRefineCommand(cli: CAC): void {
// ─── docpath:refine ───
cli.command('refine [file]', '需求梳理 — 从需求文档生成标准 spec.md')
  .option('--cwd <path>', '项目目录')
  .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
  .option('--content <content>', '需求文档内容')
  .option('--stdin', '从 stdin 读取需求文档')
  .option('--dry-run', '只预览输入，不更新状态')
  .action(async (file: string | undefined, options: { cwd?: string; file?: string; content?: string; stdin?: boolean; 'dry-run'?: boolean; dryRun?: boolean }) => {
    await refineCommand({
      cwd: options.cwd || process.cwd(),
      file: file || options.file,
      content: options.content,
      stdin: options.stdin,
      dryRun: options['dry-run'] || options.dryRun,
    });
  });

}

function registerSpecPlanCommands(cli: CAC): void {
// ─── docpath:write-spec ───
cli.command('write-spec', '从 brainstorm 结果写入 spec.md')
  .option('--cwd <path>', '项目目录')
  .option('--content <content>', 'spec 内容（YAML/Markdown）')
  .option('--stdin', '从 stdin 读取内容')
  .action(async (options: { cwd?: string; content?: string; stdin?: boolean }) => {
    await writeSpecCommand({
      cwd: options.cwd || process.cwd(),
      content: options.content,
      stdin: options.stdin,
    });
  });

// ─── docpath:plan ───
cli.command('plan', '从 spec.md 生成执行计划')
  .option('--cwd <path>', '项目目录')
  .option('--dry-run', '预览模式，不写入文件')
  .action(async (options: { cwd?: string; 'dry-run'?: boolean }) => {
    await planCommand({
      cwd: options.cwd || process.cwd(),
      dryRun: options['dry-run'],
    });
  });

// ─── docpath:write-plan ───
cli.command('write-plan', '从 plan 结果写入 plan.md')
  .option('--cwd <path>', '项目目录')
  .option('--content <content>', 'plan 内容（Markdown）')
  .option('--stdin', '从 stdin 读取内容')
  .action(async (options: { cwd?: string; content?: string; stdin?: boolean }) => {
    await writePlanCommand({
      cwd: options.cwd || process.cwd(),
      content: options.content,
      stdin: options.stdin,
    });
  });

}

function registerExecutionCommands(cli: CAC): void {
// ─── docpath:continue ───
cli.command('continue', '断线重连 — 读取 breadcrumb 恢复执行，检查升级信号')
  .option('--cwd <path>', '项目目录')
  .option('--verbose', '显示详细上下文')
  .action(async (options: { cwd?: string; verbose?: boolean }) => {
    await continueCommand({
      cwd: options.cwd || process.cwd(),
      verbose: options.verbose,
    });
  });

// ─── docpath:go ───
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

}

function registerCheckCommand(cli: CAC): void {
// ─── docpath:check ───
cli.command('check', '质量门禁 — 编译/测试/lint/检查 + 工作流护栏')
  .option('--cwd <path>', '项目目录')
  .option('--skip-tests', '跳过测试')
  .option('--skip-lint', '跳过 lint')
  .option('--harness', '启用工作流护栏检查 (pre-flight/boundary/pattern)')
  .option('--preflight', '仅执行 pre-flight 检查')
  .option('--boundary', '仅执行 boundary 检查')
  .option('--only-harness', '仅执行 harness 检查，跳过编译/测试/lint')
  .option('--fix-drift <source>', '检测到任务文件漂移时自动同步: canonical | current')
  .action(async (options: { cwd?: string; 'skip-tests'?: boolean; 'skip-lint'?: boolean; harness?: boolean; preflight?: boolean; boundary?: boolean; 'only-harness'?: boolean; 'fix-drift'?: string; fixDrift?: string }) => {
    // Fallback: cac may not pass boolean options, so parse from process.argv
    const argv = process.argv.slice(2);
    const hasFlag = (flag: string) => argv.includes(flag);
    
    const skipTests = options['skip-tests'] || hasFlag('--skip-tests');
    const skipLint = options['skip-lint'] || hasFlag('--skip-lint');
    const harness = options.harness || hasFlag('--harness');
    const preflight = options.preflight || hasFlag('--preflight');
    const boundary = options.boundary || hasFlag('--boundary');
    const onlyHarness = options['only-harness'] || hasFlag('--only-harness');
    const fixDrift = normalizeTaskFileSyncSource(options['fix-drift'] || options.fixDrift || getOptionValue(argv, '--fix-drift'), 'check --fix-drift');
    
    await checkCommand({
      cwd: options.cwd || process.cwd(),
      skipTests,
      skipLint,
      harness: harness || onlyHarness,
      preflight,
      boundary,
      onlyHarness,
      fixDrift,
    });
  });

}

function registerReviewJournalCommands(cli: CAC): void {
// ─── docpath:review ───
cli.command('review', '结构化代码审查 (可选 LLM 深度审查)')
  .option('--cwd <path>', '项目目录')
  .option('--scope <scope>', '审查范围: staged|last_commit|all')
  .option('--dry-run', '只预览审查结果，不写入状态')
  .option('--no-ai', '跳过 LLM 审查')
  .option('--approve', '直接批准（跳过自动检查）')
  .action(async (options: { cwd?: string; scope?: string; ai?: boolean; approve?: boolean; 'dry-run'?: boolean; dryRun?: boolean }) => {
    await reviewCommand({
      cwd: options.cwd || process.cwd(),
      scope: (options.scope as any) || 'staged',
      dryRun: options['dry-run'] ?? options.dryRun,
      approve: options.approve ?? false,
    });
  });

// ─── docpath:journal ───
cli.command('journal', '知识归档 — 从完成任务中提炼经验')
  .option('--cwd <path>', '项目目录')
  .option('--skip-ai', '跳过 LLM，直接写模板')
  .option('--optional-archive <mode>', '归档模式: always|skip|dry-run')
  .option('--dry-run', '预览归档，不写入状态、breadcrumb 或决策日志')
  .action(async (options: { cwd?: string; 'skip-ai'?: boolean; skipAi?: boolean; 'optional-archive'?: 'always' | 'skip' | 'dry-run'; optionalArchive?: 'always' | 'skip' | 'dry-run'; 'dry-run'?: boolean; dryRun?: boolean }) => {
    await journalCommand({
      cwd: options.cwd || process.cwd(),
      skipAi: options['skip-ai'] ?? options.skipAi,
      archiveMode: (options.dryRun || options['dry-run']) ? 'dry-run' : (options['optional-archive'] ?? options.optionalArchive),
    });
  });

// ─── docpath:write-journal ───
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

function registerConfigCommand(cli: CAC): void {
// ─── docpath:config ───
cli.command('config [...args]', '查看/更新配置')
  .option('--cwd <path>', '项目目录')
  .action(async (args: string[], options: { cwd?: string }) => {
    const cwd = options.cwd || process.cwd();
    const subcommand = args[0];
    
    // 子命令: config get <key>
    if (subcommand === 'get' && args[1]) {
      await configCommand({ cwd, get: args[1] });
      return;
    }
    
    // 子命令: config set <key> <value>
    if (subcommand === 'set' && args[1] && args[2]) {
      await configCommand({ cwd, set: `${args[1]}=${args[2]}` });
      return;
    }
    
    // 子命令: config list
    if (subcommand === 'list') {
      await configCommand({ cwd, list: true });
      return;
    }
    
    // 默认: 显示全部配置
    await configCommand({ cwd, list: true });
  });

}

function registerResumeDiffLearnCommands(cli: CAC): void {
// ─── docpath:resume ───
cli.command('resume', '断线恢复 — 跳到上次中断点')
  .option('--cwd <path>', '项目目录')
  .option('--verbose', '显示更详细的 checkpoint 上下文')
  .action(async (options: { cwd?: string; verbose?: boolean }) => {
    await resumeCommand({
      cwd: options.cwd || process.cwd(),
      verbose: options.verbose,
    });
  });

// ─── docpath:diff ───
cli.command('diff', '查看步骤间差异')
  .option('--scope <scope>', '差异范围: staged|last|step|all')
  .option('--step <step>', '指定步骤编号 (e.g. S1)')
  .option('--no-color', '禁用颜色')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string; scope?: string; step?: string; 'no-color'?: boolean }) => {
    await diffCommand({
      cwd: options.cwd || process.cwd(),
      scope: options.scope,
      step: options.step,
      noColor: options['no-color'],
    });
  });

// ─── docpath:learn ───
cli.command('learn', '从 journal 提取规则 → 更新 style.md')
  .option('--journal <path>', '指定 journal 文件')
  .option('--from-journal', '忽略 lesson-candidates，直接从 journal 提取')
  .option('--dry-run', '只预览提取结果，不写入 style.md / architecture.md')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string; journal?: string; 'from-journal'?: boolean; fromJournal?: boolean; 'dry-run'?: boolean; dryRun?: boolean }) => {
    await learnCommand({
      cwd: options.cwd || process.cwd(),
      journalPath: options.journal,
      fromJournal: options['from-journal'] ?? options.fromJournal,
      dryRun: options['dry-run'] ?? options.dryRun,
    });
  });

}

function registerContextExportStatsCommands(cli: CAC): void {
// ─── docpath:context ───
cli.command('context', '生成 Claude Code 可消费的上下文包')
  .option('--cwd <path>', '项目目录')
  .option('--max-tokens <n>', '最大 token 预算 (默认 8000)')
  .option('--format <format>', '输出格式: prompt(默认) | raw')
  .option('--no-spec', '不包含 spec')
  .option('--no-plan', '不包含 plan')
  .option('--output <file>', '保存到文件')
  .option('--agent', '输出 Agent 可读 YAML 状态')
  .action(async (options: { cwd?: string; 'max-tokens'?: string; format?: string; spec?: boolean; plan?: boolean; output?: string; agent?: boolean }) => {
    await contextCommand({
      cwd: options.cwd || process.cwd(),
      maxTokens: options['max-tokens'] ? parseInt(options['max-tokens'], 10) : undefined,
      format: options.format as 'prompt' | 'raw' | undefined,
      withSpec: options.spec !== false,
      withPlan: options.plan !== false,
      output: options.output,
      agent: !!options.agent,
    });
  });

// ─── docpath:export ───
cli.command('export', '导出工作流状态为可分享的 standalone markdown')
  .option('--cwd <path>', '项目目录')
  .option('--output <file>', '输出文件路径 (默认 stdout)')
  .option('--full', '包含完整 spec/plan (默认只摘要)')
  .action(async (options: { cwd?: string; output?: string; full?: boolean }) => {
    await exportCommand({
      cwd: options.cwd || process.cwd(),
      output: options.output,
      full: !!options.full,
    });
  });

// ─── docpath:stats ───
cli.command('stats', '项目统计面板')
  .option('--cwd <path>', '项目目录')
  .option('--format <format>', '输出格式: table(默认) | json')
  .option('--agent', '输出 Agent 可读 YAML 状态')
  .action(async (options: { cwd?: string; format?: string; agent?: boolean }) => {
    await statsCommand({
      cwd: options.cwd || process.cwd(),
      format: options.format as 'table' | 'json' | undefined,
      agent: !!options.agent,
    });
  });


}

function registerRunCommand(cli: CAC): void {
// ─── docpath:runtime (Phase4) ───
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


}

function registerAgentCommand(cli: CAC): void {
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

function registerRuntimeUtilityCommands(cli: CAC): void {
cli.command('compact', '持久化压缩运行上下文到 workspace/compact-context.md')
  .option('--cwd <path>', '项目目录')
  .option('--max-entries <n>', '保留最近 breadcrumb 条数 (默认 20)')
  .option('--dry-run', '只输出，不写文件')
  .action(async (options: { cwd?: string; 'max-entries'?: string; maxEntries?: string; dryRun?: boolean; 'dry-run'?: boolean }) => {
    await compactCommand({
      cwd: options.cwd || process.cwd(),
      maxEntries: options.maxEntries || options['max-entries'] ? parseInt((options.maxEntries || options['max-entries'])!, 10) : undefined,
      dryRun: !!(options.dryRun || options['dry-run']),
    });
  });

cli.command('discover', '发现 DocPath 关键上下文文件')
  .option('--cwd <path>', '项目目录')
  .option('--format <format>', 'text(默认) | json')
  .action(async (options: { cwd?: string; format?: string }) => {
    await discoverCommand({
      cwd: options.cwd || process.cwd(),
      format: options.format as 'text' | 'json' | undefined,
    });
  });

cli.command('next', '输出下一步建议')
  .option('--cwd <path>', '项目目录')
  .option('--agent', '输出 Agent YAML')
  .option('--auto-fix <source>', '检测到任务文件漂移时自动同步: canonical | current')
  .action(async (options: { cwd?: string; agent?: boolean; 'auto-fix'?: string; autoFix?: string }) => {
    const argv = process.argv.slice(2);
    await nextCommand({
      cwd: options.cwd || process.cwd(),
      agent: !!options.agent,
      autoFix: normalizeTaskFileSyncSource(options['auto-fix'] || options.autoFix || getOptionValue(argv, '--auto-fix'), 'next --auto-fix'),
    });
  });

}

function registerBacklogCommand(cli: CAC): void {
// ─── docpath:backlog ───
cli.command('backlog <action> [id]', '需求条目管理: add | list | refresh | accept | plan | promote | done | drop')
  .option('--cwd <path>', '项目目录')
  .option('--title <title>', 'add: 条目标题')
  .option('--priority <priority>', 'add/list: 优先级过滤或创建优先级 (P0|P1|P2|P3)')
  .option('--level <level>', 'add: 条目复杂度 (0|1|2|3)')
  .option('--status <status>', 'list: 状态过滤')
  .option('--agent', 'list: 输出 agent YAML')
  .action(async (action: string, id: string | undefined, options: { cwd?: string; title?: string; priority?: string; level?: string; status?: string; agent?: boolean }) => {
    await backlogCommand({
      cwd: options.cwd || process.cwd(),
      action,
      id,
      title: options.title,
      priority: options.priority,
      level: options.level,
      status: options.status,
      agent: !!options.agent,
    });
  });

}

function registerTaskMaintenanceCommands(cli: CAC): void {
// ─── docpath:tasks ───
cli.command('tasks <action>', '任务文件别名管理: drift | sync')
  .option('--cwd <path>', '项目目录')
  .option('--from <source>', 'sync: 同步来源 canonical | current')
  .action(async (action: string, options: { cwd?: string; from?: 'canonical' | 'current' }) => {
    await tasksCommand({
      cwd: options.cwd || process.cwd(),
      action,
      from: options.from,
    });
  });

// ─── docpath:task ───
cli.command('task <action>', '当前任务生命周期管理: abort | reset')
  .option('--cwd <path>', '项目目录')
  .action(async (action: string, options: { cwd?: string }) => {
    await taskCommand({
      cwd: options.cwd || process.cwd(),
      action,
    });
  });

// ─── docpath:gc ───
cli.command('gc', '清理历史任务目录')
  .option('--cwd <path>', '项目目录')
  .option('--force', '执行归档而不是仅预览')
  .option('--delete', '在 force 模式下直接删除而不是归档到 done')
  .action(async (options: { cwd?: string; force?: boolean; delete?: boolean }) => {
    await gcCommand({
      cwd: options.cwd || process.cwd(),
      force: !!options.force,
      delete: !!options.delete,
    });
  });

}

function registerDocsCommands(cli: CAC): void {
// ─── docpath:docs ───
cli.command('docs [action]', '文档资产管理')
  .option('--cwd <path>', '项目目录')
  .option('--scan', '扫描文档生成索引')
  .option('--list', '列出所有注册文档')
  .option('--add <path>', '添加文档到索引')
  .action(async (action: string | undefined, options: { cwd?: string; scan?: boolean; list?: boolean; add?: string }) => {
    const sub = action || (options.scan ? 'scan' : options.add ? 'add' : 'list');
    await docsCommand({
      cwd: options.cwd || process.cwd(),
      action: sub,
      args: options.add ? [options.add] : [],
    });
  });

// ─── docpath:reveal ───
cli.command('reveal', '渐进式上下文披露 — 按 level 0-3 输出上下文')
  .option('--cwd <path>', '项目目录')
  .option('--level <level>', '披露级别: 0(micro)|1(brief)|2(standard)|3(full)')
  .option('--topic <topic>', '按文档 path/title/summary/scope/type 过滤')
  .option('--format <format>', '输出格式: text(默认)|raw')
  .option('--output <file>', '保存到文件')
  .action(async (options: { cwd?: string; level?: string; topic?: string; format?: string; output?: string }) => {
    // Fallback: cac may not pass options, so parse from process.argv
    const argv = process.argv;
    const getArg = (flag: string): string | undefined => {
      const idx = argv.indexOf(flag);
      return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
    };
    
    const levelStr = options.level || getArg('--level') || '1';
    await revealCommand({
      cwd: options.cwd || process.cwd(),
      level: parseInt(levelStr, 10),
      topic: options.topic || getArg('--topic'),
      format: (options.format || getArg('--format') || 'text') as 'text' | 'raw',
      output: options.output || getArg('--output'),
    });
  });

}

function registerInstallCommands(cli: CAC): void {
// ─── docpath:unlink ───
cli.command('unlink', '取消项目关联')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string }) => {
    await unlinkCommand({ cwd: options.cwd || process.cwd() });
  });

// ─── docpath:install ───
cli.command('install', '安装 Agent 协议文件到项目')
  .option('--cwd <path>', '项目目录')
  .option('--target <type>', '目标类型: codex | claude | opencode | universal (默认 universal)')
  .option('--force', '覆盖已有文件')
  .action(async (options: { cwd?: string; target?: string; force?: boolean }) => {
    await installCommand({
      cwd: options.cwd || process.cwd(),
      target: options.target,
      force: !!options.force,
    });
  });

// ─── 解析并执行 ───
}

function registerTddDebugCommands(cli: CAC): void {

// ─── docpath:tdd ── (Stage 1: TDD Skill 循环)
cli.command('tdd', 'TDD 工作流 — start/spec/plan/act/check/done')
  .option('--cwd <path>', '项目目录')
  .option('--action <action>', 'TDD 动作: start|next|done')
  .option('--dry-run', '仅预览')
  .action(async (options: { cwd?: string; action?: string; 'dry-run'?: boolean }) => {
    await tddCommand({
      cwd: options.cwd || process.cwd(),
      action: (options.action as any) || 'next',
      dryRun: options['dry-run'],
    });
  });

// ─── docpath:disclosure ── (Stage 4: Progressive Disclosure)
cli.command('disclosure', '渐进式信息展示 — summary|detail|debug')
  .option('--cwd <path>', '项目目录')
  .option('--level <level>', '展示层级: summary|detail|debug')
  .action(async (options: { cwd?: string; level?: string }) => {
    await disclosureCommand({
      cwd: options.cwd || process.cwd(),
      level: options.level,
    });
  });

// ─── docpath:debug ── (Systematic Debugging Workflow)
cli.command('debug [phase]', '系统化调试工作流 — reproduce/isolate/hypothesize/verify/fix')
  .option('--cwd <path>', '项目目录')
  .action(async (phase: string | undefined, options: { cwd?: string }) => {
    const cwd = options.cwd || process.cwd();
    if (!phase || !['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'].includes(phase)) {
      console.log('用法: docpath debug <reproduce|isolate|hypothesize|verify|fix>');
      return;
    }
    await debugCommand({ cwd, action: phase as any });
  });

}

export function registerCommands(cli: CAC): void {
  registerInitializationCommands(cli);
  registerBrainstormCommands(cli);
  registerRefineCommand(cli);
  registerSpecPlanCommands(cli);
  registerExecutionCommands(cli);
  registerCheckCommand(cli);
  registerReviewJournalCommands(cli);
  registerConfigCommand(cli);
  registerResumeDiffLearnCommands(cli);
  registerContextExportStatsCommands(cli);
  registerRunCommand(cli);
  registerAgentCommand(cli);
  registerRuntimeUtilityCommands(cli);
  registerBacklogCommand(cli);
  registerTaskMaintenanceCommands(cli);
  registerDocsCommands(cli);
  registerInstallCommands(cli);
  registerTddDebugCommands(cli);
}
