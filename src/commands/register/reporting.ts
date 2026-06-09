import type { CAC } from 'cac';
import { changesCommand } from '../changes.js';
import { contextCommand } from '../context.js';
import { deliverablesCommand } from '../deliverables.js';
import { exportCommand } from '../export.js';
import { projectsCommand } from '../projects.js';
import { rolesCommand } from '../roles.js';
import { statsCommand } from '../stats.js';

function registerChangesCommand(cli: CAC): void {
  cli.command('changes', '提交前只读变更收口视图')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .option('--json', '输出 JSON')
    .option('--since <ref>', '按 git ref 汇总差异，例如 HEAD、main、origin/main、last-check')
    .action(async (options: { cwd?: string; agent?: boolean; json?: boolean; since?: string }) => {
      await changesCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
        json: !!options.json,
        since: options.since,
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
}

function registerDeliverablesCommand(cli: CAC): void {
  cli.command('deliverables [action]', '业务交付物模板与索引')
    .option('--cwd <path>', '项目目录')
    .option('--template <id>', '模板 ID')
    .option('--output <file>', '输出文件路径；省略时只渲染到 stdout')
    .option('--force', '允许覆盖已存在文件')
    .option('--json', '输出 JSON')
    .action(async (action: 'list' | 'render' | 'check' | undefined, options: { cwd?: string; template?: string; output?: string; force?: boolean; json?: boolean }) => {
      await deliverablesCommand({
        cwd: options.cwd || process.cwd(),
        action,
        template: options.template,
        output: options.output,
        force: !!options.force,
        json: !!options.json,
      });
    });
}

function registerRolesCommand(cli: CAC): void {
  cli.command('roles [action]', '角色 Profile 与 role-based context')
    .option('--cwd <path>', '项目目录')
    .option('--role <id>', '角色 ID')
    .option('--json', '输出 JSON')
    .action(async (action: 'list' | 'context' | undefined, options: { cwd?: string; role?: string; json?: boolean }) => {
      await rolesCommand({
        cwd: options.cwd || process.cwd(),
        action,
        role: options.role,
        json: !!options.json,
      });
    });
}

function registerExportCommand(cli: CAC): void {
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
}

function registerStatsCommand(cli: CAC): void {
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

function registerProjectsCommand(cli: CAC): void {
  cli.command('projects', '查看本地 SQLite 注册项目')
    .option('--json', '输出 JSON')
    .action(async (options: { json?: boolean }) => {
      await projectsCommand({ json: !!options.json });
    });
}

export function registerReportingCommands(cli: CAC): void {
  registerChangesCommand(cli);
  registerContextCommand(cli);
  registerDeliverablesCommand(cli);
  registerRolesCommand(cli);
  registerExportCommand(cli);
  registerStatsCommand(cli);
  registerProjectsCommand(cli);
}
