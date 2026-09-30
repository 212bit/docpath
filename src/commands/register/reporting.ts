import type { CAC } from 'cac';
import { changelogCommand } from '../changelog.js';
import { changesCommand } from '../changes.js';
import { contextCommand } from '../context.js';
import { projectsCommand } from '../projects.js';
import { renderCommand } from '../render.js';
import { milestoneCommand } from '../milestone.js';
import { budgetCommand } from '../budget.js';
import { statsCommand } from '../stats.js';
import { monitorCommand } from '../monitor.js';
import { normalizeEnumOption, parseIntegerOption } from './shared.js';

function parseScopeFiles(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function registerChangelogCommand(cli: CAC): void {
  cli.command('changelog [targetVersion]', '自动化聚合已归档任务与 Git 提交生成 CHANGELOG.md')
    .option('--cwd <path>', '项目目录')
    .option('--release-version <version>', '指定版本号 (例如 v0.2.0，默认 Unreleased)')
    .option('--title <title>', '版本简报标题')
    .option('--since <ref>', '按 git ref/tag 汇总差异，例如 v0.1.0、HEAD~10')
    .option('--dry-run', '预览 Changelog，不写盘')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .option('--json', '输出 JSON')
    .option('--output <file>', '导出到指定文件')
    .action(async (targetVersion: string | undefined, options: { cwd?: string; releaseVersion?: string; 'release-version'?: string; title?: string; since?: string; dryRun?: boolean; agent?: boolean; json?: boolean; output?: string }) => {
      const version = targetVersion || options.releaseVersion || options['release-version'];
      await changelogCommand({
        cwd: options.cwd || process.cwd(),
        version,
        title: options.title,
        since: options.since,
        dryRun: !!options.dryRun,
        agent: !!options.agent,
        json: !!options.json,
        output: options.output,
      });
    });
}

function registerMilestoneCommand(cli: CAC): void {
  cli.command('milestone [action] [version]', '版本/阶段性里程碑总结：聚合已归档任务与架构决策并生成发布简报')
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', '里程碑标题描述')
    .option('--since <ref>', '按 git ref/tag 汇总差异')
    .option('--dry-run', '预览发布简报，不写盘')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .option('--json', '输出 JSON')
    .action(async (actionOrVersion: string | undefined, versionArg: string | undefined, options: { cwd?: string; title?: string; since?: string; dryRun?: boolean; agent?: boolean; json?: boolean }) => {
      let action: 'create' | 'draft' | 'publish' | 'list' | 'show' | 'timeline' = 'create';
      let version = versionArg;

      if (actionOrVersion === 'list') {
        action = 'list';
      } else if (actionOrVersion === 'show') {
        action = 'show';
      } else if (actionOrVersion === 'timeline') {
        action = 'timeline';
      } else if (actionOrVersion === 'draft') {
        action = 'draft';
      } else if (actionOrVersion === 'publish') {
        action = 'publish';
      } else if (actionOrVersion === 'create') {
        action = 'create';
      } else if (actionOrVersion) {
        // e.g. docpath milestone v0.2.0
        action = 'create';
        version = actionOrVersion;
      }

      await milestoneCommand({
        cwd: options.cwd || process.cwd(),
        action,
        version,
        title: options.title,
        since: options.since,
        dryRun: !!options.dryRun,
        agent: !!options.agent,
        json: !!options.json,
      });
    });
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
  cli.command('context', '生成 Claude Code / Agent 可消费的上下文包')
    .option('--cwd <path>', '项目目录')
    .option('--smart', '智能关联与精准规则投喂 (根据活跃任务与改动文件自动匹配相关规则与文档)')
    .option('--adaptive', '自适应分层预算压缩 (根据 Token 上限多级裁剪装配上下文)')
    .option('--max-tokens <n>', '最大 token 预算 (默认 8000)')
    .option('--format <format>', '输出格式: prompt(默认) | raw')
    .option('--no-spec', '不包含 spec')
    .option('--no-plan', '不包含 plan')
    .option('--topic <topic>', '按文档 path/title/summary/scope/type/topic_tags 过滤并按需展开')
    .option('--task-id <taskId>', '按任务 ID 定位并按需展开相关文档')
    .option('--include-archive', '允许归档正文参与预算竞争')
    .option('--output <file>', '保存到文件')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .action(async (options: { cwd?: string; smart?: boolean; adaptive?: boolean; 'max-tokens'?: string; maxTokens?: string; format?: string; spec?: boolean; plan?: boolean; topic?: string; taskId?: string; 'task-id'?: string; includeArchive?: boolean; 'include-archive'?: boolean; output?: string; agent?: boolean }) => {
      await contextCommand({
        cwd: options.cwd || process.cwd(),
        smart: !!options.smart,
        adaptive: !!options.adaptive,
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
  cli.command('stats', '任务级效能与 Token 投入产出看板')
    .option('--cwd <path>', '项目目录')
    .option('--limit <n>', '展示最近 N 个任务 (默认 10)')
    .option('--agent', '输出 Agent 可读 YAML 效能概览')
    .option('--json', '输出 JSON 格式度量数据')
    .action(async (options: { cwd?: string; limit?: string | number; agent?: boolean; json?: boolean }) => {
      await statsCommand({
        cwd: options.cwd || process.cwd(),
        limit: typeof options.limit === 'string' ? parseInt(options.limit, 10) : options.limit,
        agent: !!options.agent,
        json: !!options.json,
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

function registerBudgetCommand(cli: CAC): void {
  cli.command('budget', '上下文 Token 预算透视看板与智能剪枝建议')
    .option('--cwd <path>', '项目目录')
    .option('--agent', '输出 Agent 可读紧凑 YAML 预算分析')
    .option('--json', '输出 JSON 格式预算分析')
    .option('--suggest', '仅输出剪枝与优化建议')
    .option('--prune', '自动执行瞬态事件与历史决策安全剪枝')
    .option('--dry-run', '配合 --prune 预览剪枝操作')
    .action(async (options: { cwd?: string; agent?: boolean; json?: boolean; suggest?: boolean; prune?: boolean; dryRun?: boolean }) => {
      await budgetCommand({
        cwd: options.cwd || process.cwd(),
        agent: !!options.agent,
        json: !!options.json,
        suggest: !!options.suggest,
        prune: !!options.prune,
        dryRun: !!options.dryRun,
      });
    });
}

function registerMonitorCommand(cli: CAC): void {
  cli.command('monitor', '统一流程合规与 Token 消耗漂移监控看板及 CI 门禁')
    .option('--cwd <path>', '项目目录')
    .option('--limit <n>', '展示最近 N 个任务 (默认 10)')
    .option('--agent', '输出 Agent 可读 YAML 监控状态')
    .option('--json', '输出 JSON 格式监控数据')
    .option('--strict', '严格模式：若存在严重违规或健康分低于阈值则返回非零退出码')
    .option('--ci', 'CI 模式：同 --strict 门禁检测')
    .option('--threshold <n>', '健康分及格阈值 (默认 70)')
    .action(async (options: { cwd?: string; limit?: string | number; agent?: boolean; json?: boolean; strict?: boolean; ci?: boolean; threshold?: string | number }) => {
      await monitorCommand({
        cwd: options.cwd || process.cwd(),
        limit: typeof options.limit === 'string' ? parseInt(options.limit, 10) : options.limit,
        agent: !!options.agent,
        json: !!options.json,
        strict: !!options.strict,
        ci: !!options.ci,
        threshold: typeof options.threshold === 'string' ? parseInt(options.threshold, 10) : options.threshold,
      });
    });
}

function registerPromptCommand(cli: CAC): void {
}

export function registerReportingCommands(cli: CAC): void {
  registerChangelogCommand(cli);
  registerBudgetCommand(cli);
  registerMilestoneCommand(cli);
  registerChangesCommand(cli);
  registerContextCommand(cli);
  registerDeliverablesCommand(cli);
  registerRolesCommand(cli);
  registerExportCommand(cli);
  registerRenderCommand(cli);
  registerStatsCommand(cli);
  registerMonitorCommand(cli);
  registerProjectsCommand(cli);
  registerPromptCommand(cli);
}
