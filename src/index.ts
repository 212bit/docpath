#!/usr/bin/env node

/**
 * DocPath CLI — 文径工作流引擎
 * 
 * 文档即有限状态机 (Document as FSM)
 * 
 * 命令:
 *   docpath:init     — 初始化 .docpath/ 目录
 *   docpath:status   — 查看当前工作流状态
 *   docpath:plan     — 从 spec.md 生成执行计划
 *   docpath:continue — 断点续接
 */

import { cac } from 'cac';
import { readFileSafe, resolveDocpathDir } from './utils/file.js';
import { join } from 'node:path';
import { initCommand } from './commands/init.js';
import { brainstormCommand } from './commands/brainstorm.js';
import { writeSpecCommand } from './commands/write-spec.js';
import { planCommand } from './commands/plan.js';
import { continueCommand } from './commands/continue.js';
import { goCommand } from './commands/go.js';
import { checkCommand } from './commands/check.js';
import { reviewCommand } from './commands/review.js';
import { journalCommand } from './commands/journal.js';
import { configCommand } from './commands/config.js';
import { resumeCommand } from './commands/resume.js';
import { diffCommand } from './commands/diff.js';
import { learnCommand } from './commands/learn.js';
import { contextCommand } from './commands/context.js';
import { exportCommand } from './commands/export.js';
import { statsCommand } from './commands/stats.js';
import { unlinkCommand } from './commands/unlink.js';
import { docsCommand } from './commands/docs.js';
import { revealCommand } from './commands/reveal.js';
import { installCommand } from './commands/install.js';
import { tddCommand } from './commands/tdd.js';
import { debugCommand } from './commands/debug.js';
import { disclosureCommand } from './utils/disclosure.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

const cli = cac('docpath');

cli.version(pkg.version);
cli.help();

// ─── docpath:init ───
cli.command('init', '初始化 .docpath/ 工作流目录')
  .option('--force', '强制重新生成')
  .option('--level <level>', '初始复杂度级别 (0|1|2|3)')
  .option('--link <path>', '关联已初始化的项目路径')
  .action(async (options: { force?: boolean; level?: string; link?: string }) => {
    await initCommand({
      force: !!options.force,
      level: options.level ? parseInt(options.level, 10) as any : undefined,
      link: options.link,
    });
  });

// ─── docpath:status ───
cli.command('status', '查看当前工作流状态')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string }) => {
    const cwd = options.cwd || process.cwd();
    const statePath = join(cwd, '.docpath/workspace/current.md');
    const breadcrumbPath = join(cwd, '.docpath/workspace/breadcrumb.md');

    const stateContent = await readFileSafe(statePath);
    if (!stateContent) {
      console.log('\n⚠️  未找到 .docpath/workspace/current.md');
      console.log('  请先运行 docpath:init 初始化工作流\n');
      return;
    }

    console.log('\n📊  DocPath 工作流状态\n');

    // 从 YAML front matter 提取状态
    const levelMatch = stateContent.match(/level:\s*(\d)/);
    const stateMatch = stateContent.match(/state:\s*(\w+)/);
    const taskMatch = stateContent.match(/task_title:\s*"?([^"\n]+)"?/);

    const level = levelMatch ? levelMatch[1] : '?';
    const state = stateMatch ? stateMatch[1] : '?';
    const task = taskMatch ? taskMatch[1] : '(无活跃任务)';

    const LEVEL_NAMES: Record<string, string> = {
      '0': '即时响应', '1': '轻量任务', '2': '标准任务', '3': '复杂任务',
    };

    console.log(`  级别:  Level ${level} — ${LEVEL_NAMES[level] || '未知'}`);
    console.log(`  状态:  ${state}`);
    console.log(`  任务:  ${task}`);
    console.log(`  文件:  ${statePath}`);

    // 查看面包屑
    const breadcrumb = await readFileSafe(breadcrumbPath);
    if (breadcrumb && breadcrumb.includes('## 当前会话')) {
      const phaseMatch = breadcrumb.match(/当前 Phase:\s*(\w+)/);
      const subTaskMatch = breadcrumb.match(/当前子任务:\s*(.+)/);
      if (phaseMatch || subTaskMatch) {
        console.log(`\n  🍞  执行进度:`);
        if (phaseMatch) console.log(`     Phase: ${phaseMatch[1]}`);
        if (subTaskMatch) console.log(`     子任务: ${subTaskMatch[1]}`);
      }
    }

    // ── 显示关联项目 ──
    try {
      const docpathDir = await resolveDocpathDir(cwd);
      const infoRaw = await readFileSafe(join(docpathDir, 'docpath.json'));
      if (infoRaw) {
        const info = JSON.parse(infoRaw);
        if (info.linkedTo) {
          const target = join(cwd, info.linkedTo);
          console.log(`  🔗  已关联: ${info.linkedTo} (${target})`);
        }
      }
    } catch { /* no link */ }

    console.log('');
  });

// ─── docpath:brainstorm ───
cli.command('brainstorm', '苏格拉底式需求拷问 — 从模糊需求到结构化 spec')
  .option('--cwd <path>', '项目目录')
  .option('--input <input>', '初始需求描述')
  .option('--dry-run', '非交互模式，直接输出 spec 预览')
  .option('--one-shot', '单次模式：直接从 input 生成 spec，不进入交互循环')
  .action(async (options: { cwd?: string; input?: string; 'dry-run'?: boolean; oneShot?: boolean }) => {
    await brainstormCommand({
      cwd: options.cwd || process.cwd(),
      input: options.input,
      dryRun: options['dry-run'],
      noInteractive: options['oneShot'],
    });
  });

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
  .option('--dry-run', '仅预览，不更新状态')
  .action(async (options: { cwd?: string; step?: string; 'dry-run'?: boolean }) => {
    await goCommand({
      cwd: options.cwd || process.cwd(),
      step: options.step,
      dryRun: options['dry-run'],
    });
  });

// ─── docpath:check ───
cli.command('check', '质量门禁 — 编译/测试/lint/检查 + 工作流护栏')
  .option('--cwd <path>', '项目目录')
  .option('--skip-tests', '跳过测试')
  .option('--skip-lint', '跳过 lint')
  .option('--harness', '启用工作流护栏检查 (pre-flight/boundary/pattern)')
  .option('--preflight', '仅执行 pre-flight 检查')
  .option('--boundary', '仅执行 boundary 检查')
  .option('--only-harness', '仅执行 harness 检查，跳过编译/测试/lint')
  .action(async (options: { cwd?: string; 'skip-tests'?: boolean; 'skip-lint'?: boolean; harness?: boolean; preflight?: boolean; boundary?: boolean; 'only-harness'?: boolean }) => {
    // Fallback: cac may not pass boolean options, so parse from process.argv
    const argv = process.argv.slice(2);
    const hasFlag = (flag: string) => argv.includes(flag);
    
    const skipTests = options['skip-tests'] || hasFlag('--skip-tests');
    const skipLint = options['skip-lint'] || hasFlag('--skip-lint');
    const harness = options.harness || hasFlag('--harness');
    const preflight = options.preflight || hasFlag('--preflight');
    const boundary = options.boundary || hasFlag('--boundary');
    const onlyHarness = options['only-harness'] || hasFlag('--only-harness');
    
    await checkCommand({
      cwd: options.cwd || process.cwd(),
      skipTests,
      skipLint,
      harness: harness || onlyHarness,
      preflight,
      boundary,
      onlyHarness,
    });
  });

// ─── docpath:review ───
cli.command('review', '结构化代码审查 (可选 LLM 深度审查)')
  .option('--cwd <path>', '项目目录')
  .option('--scope <scope>', '审查范围: staged|last_commit|all')
  .option('--no-ai', '跳过 LLM 审查')
  .action(async (options: { cwd?: string; scope?: string; ai?: boolean }) => {
    await reviewCommand({
      cwd: options.cwd || process.cwd(),
      scope: (options.scope as any) || 'staged',
      useAi: options.ai !== false,
    });
  });

// ─── docpath:journal ───
cli.command('journal', '知识归档 — 从完成任务中提炼经验')
  .option('--cwd <path>', '项目目录')
  .option('--skip-ai', '跳过 LLM，直接写模板')
  .action(async (options: { cwd?: string; 'skip-ai'?: boolean }) => {
    await journalCommand({
      cwd: options.cwd || process.cwd(),
      skipAi: options['skip-ai'],
    });
  });

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

// ─── docpath:resume ───
cli.command('resume', '断线恢复 — 跳到上次中断点')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string }) => {
    await resumeCommand({ cwd: options.cwd || process.cwd() });
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
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string; journal?: string }) => {
    await learnCommand({
      cwd: options.cwd || process.cwd(),
      journalPath: options.journal,
    });
  });

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

// ─── docpath:docs ───
cli.command('docs', '文档资产管理')
  .option('--cwd <path>', '项目目录')
  .option('--scan', '扫描文档生成索引')
  .option('--list', '列出所有注册文档')
  .option('--add <path>', '添加文档到索引')
  .action(async (options: { cwd?: string; scan?: boolean; list?: boolean; add?: string }) => {
    // 手动路由子命令
    const args = process.argv.slice(3);
    const sub = args[0] || 'list';
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
  .option('--format <format>', '输出格式: text(默认)|raw')
  .option('--output <file>', '保存到文件')
  .action(async (options: { cwd?: string; level?: string; format?: string; output?: string }) => {
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
      format: (options.format || getArg('--format') || 'text') as 'text' | 'raw',
      output: options.output || getArg('--output'),
    });
  });

// ─── docpath:unlink ───
cli.command('unlink', '取消项目关联')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string }) => {
    await unlinkCommand({ cwd: options.cwd || process.cwd() });
  });

// ─── docpath:install ───
cli.command('install', '安装 Agent 协议文件到项目')
  .option('--cwd <path>', '项目目录')
  .option('--target <type>', '目标类型: claude | opencode | universal (默认 universal)')
  .option('--force', '覆盖已有文件')
  .action(async (options: { cwd?: string; target?: string; force?: boolean }) => {
    await installCommand({
      cwd: options.cwd || process.cwd(),
      target: options.target,
      force: !!options.force,
    });
  });

// ─── 解析并执行 ───

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
cli.command('debug', '系统化调试工作流 — reproduce/isolate/hypothesize/verify/fix')
  .option('--cwd <path>', '项目目录')
  .action(async (options: { cwd?: string }) => {
    const cwd = options.cwd || process.cwd();
    const sub = cli.args[0];
    if (!sub || !['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'].includes(sub)) {
      console.log('用法: docpath debug <reproduce|isolate|hypothesize|verify|fix>');
      return;
    }
    await debugCommand({ cwd, action: sub as any });
  });

// ─── journal 命令扩展: 添加 --optional-archive 选项 ──
// (在已有 journal 命令注册处添加选项)

cli.parse();
