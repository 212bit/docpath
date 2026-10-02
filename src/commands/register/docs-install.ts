import type { CAC } from 'cac';
import { docsCommand } from '../docs.js';
import { installCommand } from '../install.js';
import { mergeDriverCommand } from '../merge-driver.js';
import { revealCommand } from '../reveal.js';
import { unlinkCommand } from '../unlink.js';
import { normalizeEnumOption, parseIntegerOption } from './shared.js';

const KNOWN_DOCS_ACTIONS = new Set([
  'scan',
  'sync',
  'list',
  'lint',
  'doctor',
  'check',
  'fix',
  'repair',
  'search',
  'find',
  'query',
  'graph',
  'arch',
  'architecture',
  'core',
  'archive',
  'status',
  'add',
  'guard',
  'hook',
]);

function registerDocsCommandHelper(cli: CAC, commandName: string, description: string): void {
  cli.command(`${commandName} [action] [...query]`, description)
    .option('--cwd <path>', '项目目录')
    .option('--scan', '扫描文档生成索引')
    .option('--sync', '全量同步与自愈（诊断修复断链/未索引并重建索引）')
    .option('--list', '列出所有注册文档')
    .option('--lint', '巡检文档健康度（检查断链、空文件等）')
    .option('--doctor', '全景体检文档生态健康度')
    .option('--guard', '活文档 Git 防腐守卫拦截')
    .option('--staged', 'guard: 仅检查 git 暂存区发生变更的活文档')
    .option('--install', 'guard: 自动安装/配置 Git pre-commit 防腐钩子')
    .option('--fix', '一键自愈修复死链、缺失标题与未索引文档；graph: 半自动修复关联图谱；guard: 自愈并重新暂存')
    .option('--mermaid', 'graph: 输出 mermaid 全景关联图')
    .option('--dry-run', '预览自愈修复操作，不修改文件')
    .option('--search <query>', '根据关键词检索文档')
    .option('--status <status>', '按状态过滤列表 (active | wip | deprecated)')
    .option('--type <type>', '按文档类型过滤 (reference | runbook | template | index | log)')
    .option('--scope <scope>', '按作用域过滤 (project | task | backend | frontend | infra | shared)')
    .option('--tag <tag>', '按标签过滤 (topic_tags)')
    .option('--by <target>', '归档或废弃文档时的替代文档路径')
    .option('--reason <msg>', '状态变更或归档原因')
    .option('--full', 'list: 输出完整表格')
    .option('--add <path>', '添加文档到索引')
    .option('--agent', 'Agent 模式输出结构化 YAML')
    .option('--json', '输出 JSON 格式')
    .action(async (action: string | undefined, query: string[] | undefined, options: {
      cwd?: string;
      scan?: boolean;
      sync?: boolean;
      list?: boolean;
      lint?: boolean;
      doctor?: boolean;
      guard?: boolean;
      staged?: boolean;
      install?: boolean;
      fix?: boolean;
      mermaid?: boolean;
      'dry-run'?: boolean;
      dryRun?: boolean;
      json?: boolean;
      full?: boolean;
      add?: string;
      search?: string;
      status?: string;
      type?: string;
      scope?: string;
      tag?: string;
      by?: string;
      reason?: string;
      agent?: boolean;
    }) => {
      let sub = action;
      let queryArgs: string[] = query && query.length > 0 ? [...query] : [];

      if (!sub) {
        if (options.guard || options.install) sub = 'guard';
        else if (options.sync) sub = 'sync';
        else if (options.fix) sub = 'fix';
        else if (options.doctor) sub = 'doctor';
        else if (options.scan) sub = 'scan';
        else if (options.lint) sub = 'lint';
        else if (options.search) {
          sub = 'search';
          if (typeof options.search === 'string') queryArgs = [options.search];
        } else if (options.add) {
          sub = 'add';
          if (typeof options.add === 'string') queryArgs = [options.add];
        } else {
          sub = 'list';
        }
      } else if (!KNOWN_DOCS_ACTIONS.has(sub.toLowerCase())) {
        // 智能自适应路由：非已知子命令的参数直接作为 search 检索关键词
        queryArgs = [sub, ...queryArgs];
        sub = 'search';
      }

      await docsCommand({
        cwd: options.cwd || process.cwd(),
        action: sub,
        args: queryArgs,
        status: options.status,
        type: options.type,
        scope: options.scope,
        tag: options.tag,
        by: options.by,
        reason: options.reason,
        full: !!options.full,
        agent: !!options.agent,
        dryRun: !!(options.dryRun || options['dry-run']),
        json: !!options.json,
        graphFix: sub === 'graph' && !!options.fix,
        mermaid: !!options.mermaid,
        staged: options.staged !== undefined ? !!options.staged : undefined,
        fix: !!options.fix,
        install: !!options.install,
      });
    });
}

export function registerDocsInstallCommands(cli: CAC): void {
  registerDocsCommandHelper(cli, 'docs', '文档资产管理与自愈 (scan | sync | list | lint | doctor | fix | search | graph | archive | status)');
  registerDocsCommandHelper(cli, 'doc', '文档资产管理与自愈 (docs 命令别名，支持关键词直达检索)');

  cli.command('reveal', '渐进式上下文披露 — 按 level 0-3 输出上下文')
    .option('--cwd <path>', '项目目录')
    .option('--level <level>', '披露级别: 0(micro)|1(brief)|2(standard)|3(full)')
    .option('--topic <topic>', '按文档 path/title/summary/scope/type 过滤')
    .option('--task-id <taskId>', '按任务 ID 定位相关文档')
    .option('--include-archive', '允许归档正文参与预算竞争')
    .option('--format <format>', '输出格式: text(默认)|raw')
    .option('--output <file>', '保存到文件')
    .action(async (options: { cwd?: string; level?: string; topic?: string; taskId?: string; 'task-id'?: string; includeArchive?: boolean; 'include-archive'?: boolean; format?: string; output?: string }) => {
      const argv = process.argv;
      const getArg = (flag: string): string | undefined => {
        const idx = argv.indexOf(flag);
        return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
      };

      const levelStr = options.level || getArg('--level') || '1';
      await revealCommand({
        cwd: options.cwd || process.cwd(),
        level: parseIntegerOption(levelStr, 'reveal --level', { min: 0, max: 3 }),
        topic: options.topic || getArg('--topic'),
        taskId: options.taskId || options['task-id'] || getArg('--task-id'),
        includeArchive: !!(options.includeArchive || options['include-archive'] || argv.includes('--include-archive')),
        format: normalizeEnumOption(options.format || getArg('--format') || 'text', 'reveal --format', ['text', 'raw'] as const),
        output: options.output || getArg('--output'),
      });
    });

  cli.command('unlink', '取消项目关联')
    .option('--cwd <path>', '项目目录')
    .action(async (options: { cwd?: string }) => {
      await unlinkCommand({ cwd: options.cwd || process.cwd() });
    });

  registerInstallCommand(cli);
  registerUpdateCommand(cli);
  registerMergeDriverCommand(cli);
}

function registerUpdateCommand(cli: CAC): void {
  cli.command('update', '一键平滑升级当前项目的 DocPath 协议与组件（智能保留定制）')
    .option('--cwd <path>', '项目目录')
    .option('--target <type>', '目标类型: codex | claude | opencode | universal (默认读取已安装 target)')
    .option('--full', '全量升级模式: 将协议文件重构为最新标准模板（保留项目绑定与本地自定义段落）')
    .option('--reset-protocols', '--full 别名: 全量升级重置协议模板')
    .option('--hooks', '同步安装/更新 git hooks')
    .option('--hook-mode <mode>', 'pre-commit 模式: check | agent-done (默认 check)')
    .action(async (options: { cwd?: string; target?: string; full?: boolean; resetProtocols?: boolean; 'reset-protocols'?: boolean; hooks?: boolean; hookMode?: string; 'hook-mode'?: string }) => {
      await installCommand({
        cwd: options.cwd || process.cwd(),
        target: options.target,
        force: true,
        full: !!options.full,
        resetProtocols: !!(options.resetProtocols || options['reset-protocols'] || options.full),
        hooks: !!options.hooks,
        hookMode: options.hookMode || options['hook-mode'],
      });
    });
}

function registerInstallCommand(cli: CAC): void {
  cli.command('install', '安装 Agent 协议文件到项目')
    .option('--cwd <path>', '项目目录')
    .option('--target <type>', '目标类型: codex | claude | opencode | universal (默认 universal)')
    .option('--force', '覆盖已有文件')
    .option('--full', '全量升级模式: 将已有协议文件升级为最新标准模板（保留项目绑定与自定义段落）')
    .option('--reset-protocols', '--full 别名: 全量升级重置协议模板')
    .option('--check-only', '仅检查安装资产 manifest 漂移，不写入文件')
    .option('--check', '仅检查安装资产 manifest 漂移，不写入文件（--check-only 别名）')
    .option('--doctor', '诊断安装资产、shim 与 Agent 配置风险，不写入文件')
    .option('--json', 'doctor: 输出 JSON 诊断结果')
    .option('--hooks', '安装 git hooks')
    .option('--hook-mode <mode>', 'pre-commit 模式: check | agent-done (默认 check)')
    .action(async (options: { cwd?: string; target?: string; force?: boolean; full?: boolean; resetProtocols?: boolean; 'reset-protocols'?: boolean; check?: boolean; checkOnly?: boolean; 'check-only'?: boolean; doctor?: boolean; json?: boolean; hooks?: boolean; hookMode?: string; 'hook-mode'?: string }) => {
      await installCommand({
        cwd: options.cwd || process.cwd(),
        target: options.target,
        force: !!options.force,
        full: !!options.full,
        resetProtocols: !!(options.resetProtocols || options['reset-protocols'] || options.full),
        check: !!options.check,
        checkOnly: !!(options.checkOnly || options['check-only']),
        doctor: !!options.doctor,
        json: !!options.json,
        hooks: !!options.hooks,
        hookMode: options.hookMode || options['hook-mode'],
      });
    });
}

function registerMergeDriverCommand(cli: CAC): void {
  cli.command('merge-driver <ancestor> <current> <other> [path]', 'Git merge driver for DocPath backlog and rules markdown')
    .option('--cwd <path>', '项目目录')
    .action(async (
      ancestor: string,
      current: string,
      other: string,
      pathOrOptions: string | { cwd?: string } | undefined,
      maybeOptions?: { cwd?: string },
    ) => {
      const path = typeof pathOrOptions === 'string' ? pathOrOptions : undefined;
      const options = typeof pathOrOptions === 'object' && pathOrOptions !== null
        ? pathOrOptions
        : maybeOptions || {};
      await mergeDriverCommand({
        cwd: options.cwd || process.cwd(),
        ancestor,
        current,
        other,
        path,
      });
    });
}
