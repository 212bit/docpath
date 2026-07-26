import type { CAC } from 'cac';
import { changesCommand } from '../changes.js';
import { contextCommand } from '../context.js';
import { projectsCommand } from '../projects.js';
import { renderCommand } from '../render.js';
import { normalizeEnumOption, parseIntegerOption } from './shared.js';

function parseScopeFiles(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function registerChangesCommand(cli: CAC): void {
  cli.command('changes', '提交前只读变更收口视图')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .option('--json', '输出 JSON')
    .option('--since <ref>', '按 git ref 汇总差异，例如 HEAD、main、origin/main、last-check')
    .option('--task <taskId>', '按指定 task_id 生成 closeout 视图')
    .option('--scope <files>', '按显式文件集生成 closeout 视图；多个文件用逗号分隔')
    .action(async (options: { cwd?: string; agent?: boolean; json?: boolean; since?: string; task?: string; scope?: string | string[] }) => {
      await changesCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
        json: !!options.json,
        since: options.since,
        task: options.task,
        scope: parseScopeFiles(options.scope),
      });
    });
}

function registerContextCommand(cli: CAC): void {
  cli.command('context', '生成 Claude Code 可消费的上下文包')
    .option('--cwd <path>', '项目目录')
    .option('--max-tokens <n>', '最大 token 预算 (默认 8000)')
    .option('--format <format>', '输出格式: prompt(默认) | raw')
    .option('--no-spec', '不包含 spec')
    .option('--no-plan', '不包含 plan')
    .option('--topic <topic>', '按文档 path/title/summary/scope/type/topic_tags 过滤并按需展开')
    .option('--task-id <taskId>', '按任务 ID 定位并按需展开相关文档')
    .option('--include-archive', '允许归档正文参与预算竞争')
    .option('--output <file>', '保存到文件')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .action(async (options: { cwd?: string; 'max-tokens'?: string; maxTokens?: string; format?: string; spec?: boolean; plan?: boolean; topic?: string; taskId?: string; 'task-id'?: string; includeArchive?: boolean; 'include-archive'?: boolean; output?: string; agent?: boolean }) => {
      await contextCommand({
        cwd: options.cwd || process.cwd(),
        maxTokens: parseIntegerOption(options.maxTokens || options['max-tokens'], 'context --max-tokens', { min: 1 }),
        format: normalizeEnumOption(options.format, 'context --format', ['prompt', 'raw'] as const),
        withSpec: options.spec !== false,
        withPlan: options.plan !== false,
        topic: options.topic,
        taskId: options.taskId || options['task-id'],
        includeArchive: !!(options.includeArchive || options['include-archive']),
        output: options.output,
        agent: !!options.agent,
      });
    });
}

function registerDeliverablesCommand(cli: CAC): void {
}

function registerRolesCommand(cli: CAC): void {
}

function registerExportCommand(cli: CAC): void {
}

function registerRenderCommand(cli: CAC): void {
  cli.command('render', '从 JSON/JSONL 真源重新生成 Markdown 视图')
    .option('--cwd <path>', '项目目录')
    .option('--view <view>', '视图: current | spec | plan | breadcrumb | check | review')
    .option('--all', '生成所有支持视图')
    .option('--json', '输出 JSON')
    .action(async (options: { cwd?: string; view?: string; all?: boolean; json?: boolean }) => {
      await renderCommand({
        cwd: options.cwd || process.cwd(),
        view: options.view,
        all: !!options.all,
        json: !!options.json,
      });
    });
}

function registerStatsCommand(cli: CAC): void {
}

function registerProjectsCommand(cli: CAC): void {
  cli.command('projects', '查看本地 SQLite 注册项目')
    .option('--json', '输出 JSON')
    .action(async (options: { json?: boolean }) => {
      await projectsCommand({ json: !!options.json });
    });
}

function registerPromptCommand(cli: CAC): void {
}

export function registerReportingCommands(cli: CAC): void {
  registerChangesCommand(cli);
  registerContextCommand(cli);
  registerDeliverablesCommand(cli);
  registerRolesCommand(cli);
  registerExportCommand(cli);
  registerRenderCommand(cli);
  registerStatsCommand(cli);
  registerProjectsCommand(cli);
  registerPromptCommand(cli);
}
