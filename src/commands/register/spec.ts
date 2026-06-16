import type { CAC } from 'cac';
import { analyzeCommand } from '../analyze.js';
import { brainstormCommand } from '../brainstorm.js';
import { planCommand } from '../plan.js';
import { refineCommand } from '../refine.js';
import { writeAnalysisCommand } from '../write-analysis.js';
import { writePlanCommand } from '../write-plan.js';
import { writeSpecCommand } from '../write-spec.js';
import { writeDesignCommand } from '../write-design.js';
import { warnDeprecatedCommand } from './command-metadata.js';

export function registerSpecCommands(cli: CAC): void {
  registerBrainstormCommand(cli, 'brainstorm', '输出需求澄清 prompt contract，由当前 Agent 生成 spec');
  registerBrainstormCommand(cli, 'brainstor', 'brainstorm 的兼容别名');
  registerAnalyzeCommand(cli);
  registerRefineCommand(cli);
  registerWriteAnalysisCommand(cli);
  registerWriteSpecCommand(cli);
  registerWriteDesignCommand(cli);
  registerPlanCommand(cli);
  registerWritePlanCommand(cli);
}

function registerBrainstormCommand(cli: CAC, name: string, description: string): void {
  cli.command(`${name} [file]`, description)
    .option('--cwd <path>', '项目目录')
    .option('--input <input>', '初始需求描述')
    .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
    .option('--dry-run', '只预览本地 spec 草稿，不写文件或状态')
    .option('--one-shot', '单次 prompt 模式：从 input 生成本地草稿，不进入交互循环')
    .action(async (file: string | undefined, options: { cwd?: string; input?: string; file?: string; 'dry-run'?: boolean; dryRun?: boolean; oneShot?: boolean }) => {
      if (name === 'brainstor') warnDeprecatedCommand('brainstor', 'brainstorm');
      await brainstormCommand({
        cwd: options.cwd || process.cwd(),
        input: options.input,
        file: file || options.file,
        dryRun: options['dry-run'] || options.dryRun,
        noInteractive: options['oneShot'],
      });
    });
}


function registerAnalyzeCommand(cli: CAC): void {
  cli.command('analyze [file]', '输出开发前分析 prompt payload；正式内容由当前 Agent 写入 analysis')
    .option('--cwd <path>', '项目目录')
    .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
    .option('--content <content>', '需求内容')
    .option('--stdin', '从 stdin 读取需求内容')
    .option('--dry-run', '只预览分析 prompt payload，不写文件或状态')
    .option('--mode <mode>', '分析深度: quick/deep（默认 deep）')
    .action(async (file: string | undefined, options: { cwd?: string; file?: string; content?: string; stdin?: boolean; 'dry-run'?: boolean; dryRun?: boolean; mode?: 'quick' | 'deep' }) => {
      await analyzeCommand({
        cwd: options.cwd || process.cwd(),
        file: file || options.file,
        content: options.content,
        stdin: options.stdin,
        dryRun: options['dry-run'] || options.dryRun,
        mode: options.mode,
      });
    });
}

function registerRefineCommand(cli: CAC): void {
  cli.command('refine [file]', '输出需求梳理 prompt contract，由当前 Agent 生成 spec')
    .option('--cwd <path>', '项目目录')
    .option('--file <path>', '需求文档路径（等价于位置参数 [file]）')
    .option('--content <content>', '需求文档内容')
    .option('--stdin', '从 stdin 读取需求文档')
    .option('--dry-run', '只预览 refine prompt，不写文件或状态')
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


function registerWriteAnalysisCommand(cli: CAC): void {
  cli.command('write-analysis', 'artifact sink：写入当前 Agent 生成的 analysis/<section>.md')
    .option('--cwd <path>', '项目目录')
    .option('--content <content>', 'analysis 内容（Markdown）')
    .option('--stdin', '从 stdin 读取内容')
    .option('--section <section>', '分析分区: requirements/product/ui/technical/risks/open-questions')
    .action(async (options: { cwd?: string; content?: string; stdin?: boolean; section?: string }) => {
      await writeAnalysisCommand({
        cwd: options.cwd || process.cwd(),
        content: options.content,
        stdin: options.stdin,
        section: options.section,
      });
    });
}

function registerWriteSpecCommand(cli: CAC): void {
  cli.command('write-spec', 'artifact sink：写入当前 Agent 生成的 spec.md')
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
}

function registerWriteDesignCommand(cli: CAC): void {
  cli.command('write-design', 'artifact sink：写入当前 Agent 生成的设计 brief/handoff/approval')
    .option('--cwd <path>', '项目目录')
    .option('--kind <kind>', '文档类型: brief/handoff/preview/approval/acceptance（默认 preview）')
    .option('--content <content>', '设计文档内容（Markdown）')
    .option('--stdin', '从 stdin 读取内容')
    .action(async (options: { cwd?: string; kind?: string; content?: string; stdin?: boolean }) => {
      await writeDesignCommand({
        cwd: options.cwd || process.cwd(),
        kind: options.kind,
        content: options.content,
        stdin: options.stdin,
      });
    });
}

function registerPlanCommand(cli: CAC): void {
  cli.command('plan', '输出 plan prompt；复杂计划由当前 Agent 用 write-plan 写入')
    .option('--cwd <path>', '项目目录')
    .option('--dry-run', '只预览 plan prompt，不写文件或状态')
    .action(async (options: { cwd?: string; 'dry-run'?: boolean; dryRun?: boolean }) => {
      await planCommand({
        cwd: options.cwd || process.cwd(),
        dryRun: options['dry-run'] || options.dryRun,
      });
    });
}

function registerWritePlanCommand(cli: CAC): void {
  cli.command('write-plan', 'artifact sink：写入当前 Agent 生成的 plan.md')
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
