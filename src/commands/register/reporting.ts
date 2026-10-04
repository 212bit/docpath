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
  cli.command('milestone [action] [target] [...extra]', '里程碑全生命周期管理：大目标规划、Backlog拆解、跟踪看板、验收门禁与发布')
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', '里程碑标题/目标描述')
    .option('--release-version <version>', '目标版本号 (例如 v1.2.0)')
    .option('--target-version <version>', '目标版本号 (例如 v1.2.0)')
    .option('--ver <version>', '目标版本号简写 (例如 v1.2.0)')
    .option('--priority <priority>', '里程碑优先级 (P0|P1|P2|P3)')
    .option('--target-date <date>', '目标交付日期 (YYYY-MM-DD)')
    .option('--owner <owner>', '负责人或团队')
    .option('--objective <text>', '核心目标长描述')
    .option('--criteria <criteria>', '阶段验收标准 (多个以逗号分隔)')
    .option('--non-goals <text>', '非目标/边界约束')
    .option('--items <items>', 'decompose: 批量拆解子需求 (JSON 或多行文本)')
    .option('--since <ref>', '按 git ref/tag 汇总差异')
    .option('--force', '强制执行 (如跳过未完成项强制验收)')
    .option('--dry-run', '预览发布简报或执行操作，不写盘')
    .option('--agent', '输出 Agent 可读 YAML 状态')
    .option('--json', '输出 JSON')
    .action(async (...rawArgs: any[]) => {
      const options = (typeof rawArgs[rawArgs.length - 1] === 'object' && rawArgs[rawArgs.length - 1] !== null
        ? rawArgs.pop()
        : {}) as {
          cwd?: string;
          title?: string;
          version?: string;
          releaseVersion?: string;
          'release-version'?: string;
          targetVersion?: string;
          'target-version'?: string;
          ver?: string;
          priority?: string;
          targetDate?: string;
          'target-date'?: string;
          owner?: string;
          objective?: string;
          criteria?: string | string[];
          nonGoals?: string;
          'non-goals'?: string;
          items?: string;
          since?: string;
          force?: boolean;
          dryRun?: boolean;
          agent?: boolean;
          json?: boolean;
        };

      const [actionOrTarget, targetArg, ...extraArgs] = rawArgs;

      const knownActions = new Set([
        'add', 'plan', 'create', 'decompose', 'split', 'bind', 'link', 'unbind',
        'status', 'board', 'track', 'verify', 'check', 'accept', 'release', 'publish',
        'draft', 'list', 'show', 'timeline',
      ]);

      let action: any = 'list';
      let version = targetArg;
      const backlogIds: string[] = [];

      const explicitVersion = options.releaseVersion || options['release-version'] || options.targetVersion || options['target-version'] || options.ver || options.version;

      if (!actionOrTarget) {
        action = 'list';
      } else if (knownActions.has(actionOrTarget)) {
        action = actionOrTarget;
        if (action === 'add' || action === 'plan') {
          options.title = options.title || targetArg;
          version = explicitVersion;
        } else {
          version = targetArg || explicitVersion;
        }
        if (Array.isArray(extraArgs)) {
          for (const item of extraArgs) {
            if (Array.isArray(item)) {
              backlogIds.push(...item);
            } else if (item) {
              backlogIds.push(item);
            }
          }
        }
      } else if (/^v\d+/i.test(actionOrTarget) || /^M-\d+/i.test(actionOrTarget)) {
        // e.g. docpath milestone v0.2.0 or docpath milestone M-001
        action = 'show';
        version = actionOrTarget;
      } else {
        // default treat as milestone add "<title>"
        action = 'add';
        options.title = options.title || actionOrTarget;
        version = explicitVersion;
      }

      let parsedCriteria: string[] | undefined;
      if (options.criteria) {
        parsedCriteria = Array.isArray(options.criteria)
          ? options.criteria
          : options.criteria.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean);
      }

      await milestoneCommand({
        cwd: options.cwd || process.cwd(),
        action,
        version: explicitVersion || version,
        title: options.title,
        since: options.since,
        priority: options.priority,
        targetDate: options.targetDate || options['target-date'],
        owner: options.owner,
        objective: options.objective,
        criteria: parsedCriteria,
        nonGoals: options.nonGoals || options['non-goals'],
        items: options.items,
        backlogIds,
        force: !!options.force,
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
    .option('--current', '仅探查并输出当前活跃任务的实时会话遥测数据')
    .option('--limit <n>', '展示最近 N 个任务 (默认 10)')
    .option('--agent', '输出 Agent 可读 YAML 监控状态')
    .option('--json', '输出 JSON 格式监控数据')
    .option('--strict', '严格模式：若存在严重违规或健康分低于阈值则返回非零退出码')
    .option('--ci', 'CI 模式：同 --strict 门禁检测')
    .option('--threshold <n>', '健康分及格阈值 (默认 70)')
    .action(async (options: { cwd?: string; current?: boolean; limit?: string | number; agent?: boolean; json?: boolean; strict?: boolean; ci?: boolean; threshold?: string | number }) => {
      await monitorCommand({
        cwd: options.cwd || process.cwd(),
        current: !!options.current,
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
