/**
 * docpath:init — 在项目根目录初始化 .docpath/ 状态机目录
 * 
 * 生成的目录结构:
 * .docpath/
 * ├── config.yaml
 * ├── CLAUDE.md (灵魂协议文件)
 * ├── rules/
 * │   ├── architecture.md
 * │   ├── style.md
 * ├── spec/
 * │   └── template/
 * │       ├── spec.template.md
 * │       ├── plan.template.md
 * │       ├── task.template.md
 * │       ├── check.template.md
 * │       └── review.template.md
 * ├── tasks/
 * ├── workspace/
 * │   ├── current.md
 * │   └── breadcrumb.md
 * └── journal/
 */

import { join } from 'node:path';
import { confirm, isCancel, select } from '@clack/prompts';
import { exists, ensureDir, writeFileSafe, createLink } from '../utils/file.js';
import type { ComplexityLevel } from '../engine/state-machine.js';
import { createDefaultState } from '../engine/state-machine.js';
import { loadTemplate } from '../utils/file.js';
import { detectProject, formatProjectInfo, detectMonorepo, type ProjectInfo } from '../utils/detect.js';
import { readCurrentState, writeCurrentState, type CurrentState } from '../utils/workspace.js';
import { ensureRulesDir } from '../utils/rules.js';
import { registerProject, resolveProjectRegistryDbPath } from '../engine/project-registry.js';

interface InitOptions {
  cwd?: string;
  level?: ComplexityLevel;
  force?: boolean;
  link?: string;
  interactive?: boolean;
}

type ExistingDocpathAction = 'register' | 'reinitialize' | 'cancel';
type LevelSource = 'auto' | 'manual' | 'interactive';

const TEMPLATES_DIR = join(
  new URL('.', import.meta.url).pathname,
  '..', 'templates'
);

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const docpathDir = join(cwd, '.docpath');

  validateInteractiveOptions(options);
  if (await handleLinkMode(cwd, docpathDir, options.link)) return;

  // 检查是否已存在
  if (!options.force && await exists(docpathDir)) {
    if (options.interactive) {
      const shouldContinue = await handleExistingDocpathInteractive(cwd);
      if (!shouldContinue) return;
    } else {
      await registerExistingProject(cwd);
      return;
    }
  }

  if (options.interactive) {
    assertInteractiveTty();
  }

  // ── 自动检测项目信息 ──
  console.log('\n🔍  检测项目信息...\n');
  const projectInfo = await detectProject(cwd);
  console.log(formatProjectInfo(projectInfo));
  await printMonorepoInfo(cwd);

  // 如果用户没指定 level，用检测到的复杂度
  const detectedLevel = normalizeDetectedLevel(projectInfo.complexity);
  const level = options.interactive
    ? await promptInteractiveLevel(detectedLevel, options.level ?? detectedLevel)
    : options.level ?? detectedLevel;
  const levelSource = resolveLevelSource(options);

  // ── 创建目录结构 ──
  console.log('\n📁  初始化 DocPath 工作流...\n');
  await createDocpathDirs(cwd, docpathDir);
  await writeInitialConfig(cwd, level, projectInfo);
  await writeInitialStateFiles(cwd, level);
  await writeInitialTemplates(cwd);
  await writeInitialRules(cwd);
  await writeInitialGitignore(cwd);

  // ── 完成 ──
  printInitSummary(level, levelSource, projectInfo);
  const registered = await registerProject(cwd);
  console.log(`  🗄️  已注册到本地项目中心: ${registered.name}`);
  printPostInitNextSteps();
}

function printPostInitNextSteps(): void {
  console.log('\n  下一步:');
  console.log('    • 编辑 .docpath/config.yaml 调整项目配置');
  console.log('    • CLAUDE.md 已就绪，Claude Code 进入时会自动读取');
  console.log('    • 运行 docpath:status 查看当前状态');
  console.log('    • 提交你的第一个任务即可体验渐进式工作流\n');
}

function validateInteractiveOptions(options: InitOptions): void {
  if (options.interactive && options.link) {
    throw new Error([
      'docpath init --interactive 不支持与 --link 同时使用。',
      '关联已有项目请使用:',
      `  docpath init --link ${options.link}`,
      '交互式初始化请使用:',
      '  docpath init --interactive',
    ].join('\n'));
  }
}

function assertInteractiveTty(): void {
  if (process.stdin.isTTY && process.stdout.isTTY) return;
  throw new Error([
    'docpath init --interactive 需要在 TTY 终端中运行。',
    '非交互初始化示例:',
    '  docpath init --level 2',
    '  docpath init --cwd <path> --level 2',
    '已有 .docpath/ 只需注册时:',
    '  docpath init --cwd <path>',
  ].join('\n'));
}

async function registerExistingProject(cwd: string): Promise<void> {
  console.log('⚠️  当前目录已存在 .docpath/，默认不会覆盖已有工作区。');
  console.log('    已改为注册现有项目；如需重建，请明确运行: docpath init --force');
  await repairRuntimeWorkspace(cwd);
  try {
    const registered = await registerProject(cwd);
    console.log(`  🗄️  已注册到本地项目中心: ${registered.name}`);
  } catch (error) {
    console.warn('  ⚠️  本地项目中心注册失败，已跳过；DocPath runtime 修复已完成。');
    console.warn(`     registry: ${resolveProjectRegistryDbPath()}`);
    console.warn(`     reason: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function repairRuntimeWorkspace(cwd: string): Promise<void> {
  const docpathDir = join(cwd, '.docpath');
  await createRuntimeDirs(cwd);

  const statePath = join(docpathDir, 'workspace', 'state.json');
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.md');

  if (!(await exists(statePath))) {
    await writeInitialStateFiles(cwd, undefined);
    console.log('  🩹 已补齐缺失 runtime: workspace/state.json + current.md');
  } else if (!(await exists(currentPath))) {
    const current = await readCurrentState(cwd);
    if (current) {
      await writeCurrentState(cwd, current);
      console.log('  🩹 已补齐缺失 runtime: workspace/current.md');
    }
  }

  if (!(await exists(breadcrumbPath))) {
    const breadcrumbContent = await loadTemplate(join(TEMPLATES_DIR, 'breadcrumb.template.md'));
    await writeFileSafe(breadcrumbPath, breadcrumbContent);
    console.log('  🩹 已补齐缺失 runtime: workspace/breadcrumb.md');
  }
}

async function handleExistingDocpathInteractive(cwd: string): Promise<boolean> {
  assertInteractiveTty();
  console.log('⚠️  当前目录已存在 .docpath/，默认不会覆盖已有工作区。');
  const action = await select<ExistingDocpathAction>({
    message: '请选择处理方式',
    initialValue: 'register',
    options: [
      {
        value: 'register',
        label: '仅注册现有项目',
        hint: '推荐，不覆盖 .docpath/ 文件',
      },
      {
        value: 'reinitialize',
        label: '重新初始化',
        hint: '需要二次确认，会覆盖 DocPath 初始化文件',
      },
      {
        value: 'cancel',
        label: '取消',
      },
    ],
  });

  if (isCancel(action) || action === 'cancel') {
    throw new Error([
      '已取消初始化，未写入文件。',
      '如只需注册现有项目，请运行:',
      `  docpath init --cwd ${cwd}`,
    ].join('\n'));
  }

  if (action === 'register') {
    const registered = await registerProject(cwd);
    console.log(`  🗄️  已注册到本地项目中心: ${registered.name}`);
    return false;
  }

  const confirmed = await confirm({
    message: '确认重新初始化并覆盖 DocPath 初始化文件？',
    initialValue: false,
    active: '确认覆盖',
    inactive: '取消',
  });
  if (isCancel(confirmed) || confirmed !== true) {
    throw new Error('已取消重新初始化，未写入文件。');
  }
  return true;
}

async function handleLinkMode(cwd: string, docpathDir: string, targetPath?: string): Promise<boolean> {
  if (!targetPath) return false;
  if (!(await exists(join(targetPath, '.docpath')))) {
    throw new Error([
      '目标项目未找到 .docpath/ 目录，无法关联。',
      `目标路径: ${targetPath}`,
      '请先初始化目标项目:',
      `  docpath init --cwd ${targetPath}`,
      '或改为初始化当前项目:',
      `  docpath init --cwd ${cwd}`,
    ].join('\n'));
  }
  await ensureDir(docpathDir);
  await createLink(cwd, targetPath);
  console.log('🔗  已关联项目: ' + targetPath);
  console.log('    所有 docpath 命令将使用目标项目的 .docpath/\n');
  return true;
}

async function printMonorepoInfo(cwd: string): Promise<void> {
  const monorepo = await detectMonorepo(cwd);
  if (!monorepo.isMonorepo) return;
  console.log(`\n📦  检测到 Monorepo (${monorepo.type || 'generic'})\n`);
  for (const sub of monorepo.subProjects) {
    console.log(`  ├── ${sub.name}/`);
    console.log(`  │     类型: ${sub.info.type} | 框架: ${sub.info.framework || '—'} | 语言: ${sub.info.language}`);
  }
  console.log();
}

function normalizeDetectedLevel(value: number): ComplexityLevel {
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  return 2;
}

async function promptInteractiveLevel(detected: ComplexityLevel, initialLevel: ComplexityLevel): Promise<ComplexityLevel> {
  const levelOptions = ([detected, 0, 1, 2, 3] as ComplexityLevel[])
    .filter((level, index, levels) => levels.indexOf(level) === index);
  const options = levelOptions
    .map((level) => ({
      value: level,
      label: `Level ${level} - ${levelLabel(level)}`,
      hint: level === detected ? '自动检测推荐' : undefined,
    }));

  const level = await select<ComplexityLevel>({
    message: '选择默认复杂度级别',
    initialValue: initialLevel,
    options,
  });

  if (isCancel(level)) {
    throw new Error('已取消初始化，未写入文件。');
  }
  return level;
}

function levelLabel(level: ComplexityLevel): string {
  const labels: Record<ComplexityLevel, string> = {
    0: '即时响应',
    1: '轻量任务',
    2: '标准任务',
    3: '复杂任务',
  };
  return labels[level];
}

function resolveLevelSource(options: InitOptions): LevelSource {
  if (options.interactive) return 'interactive';
  return options.level === undefined ? 'auto' : 'manual';
}

async function createDocpathDirs(cwd: string, docpathDir: string): Promise<void> {
  const dirs = ['.docpath', '.docpath/rules', '.docpath/spec', '.docpath/spec/template', '.docpath/tasks', '.docpath/workspace', '.docpath/journal'];
  for (const dir of dirs) await ensureDir(join(cwd, dir));
  await createRuntimeDirs(cwd);
  await ensureRulesDir(docpathDir);
  console.log('  ✓  目录结构已创建');
}

async function createRuntimeDirs(cwd: string): Promise<void> {
  const dirs = [
    '.docpath',
    '.docpath/tasks',
    '.docpath/workspace',
    '.docpath/workspace/sessions',
    '.docpath/workspace/leases',
    '.docpath/workspace/commands',
    '.docpath/workspace/bin',
    '.docpath/journal',
  ];
  for (const dir of dirs) await ensureDir(join(cwd, dir));
}

async function writeInitialConfig(cwd: string, level: ComplexityLevel, projectInfo: ProjectInfo): Promise<void> {
  await writeFileSafe(join(cwd, '.docpath/config.yaml'), generateConfig(level, projectInfo));
  console.log('  ✓  config.yaml (已填充项目信息)');
}

async function writeInitialStateFiles(cwd: string, level: ComplexityLevel | undefined): Promise<void> {
  const defaultState = createDefaultState();
  if (level !== undefined) defaultState.level = level;
  const state: CurrentState = {
    level: defaultState.level,
    workflow_profile: 'standard',
    state: defaultState.state,
    task_id: defaultState.task_id || '',
    task_title: defaultState.task_title,
    phase: 'idle',
    gate: 'none',
    current_step: '等待下一步',
    started_at: defaultState.started_at || new Date().toISOString(),
    updated_at: defaultState.updated_at || new Date().toISOString(),
  };
  await writeCurrentState(cwd, state);
  console.log('  ✓  workspace/state.json + current.md (状态寄存器)');
}

async function writeInitialTemplates(cwd: string): Promise<void> {
  const breadcrumbContent = await loadTemplate(join(TEMPLATES_DIR, 'breadcrumb.template.md'));
  await writeFileSafe(join(cwd, '.docpath/workspace/breadcrumb.md'), breadcrumbContent);
  console.log('  ✓  workspace/breadcrumb.md (面包屑)');
  await writeFileSafe(join(cwd, 'CLAUDE.md'), await loadTemplate(join(TEMPLATES_DIR, 'CLAUDE.md')));
  console.log('  ✓  CLAUDE.md (灵魂协议文件)');
  const templates = ['architecture.template.md', 'style.template.md', 'spec.template.md', 'plan.template.md', 'task.template.md', 'check.template.md', 'review.template.md'];
  for (const tmpl of templates) await writeSpecTemplate(cwd, tmpl);
  console.log('  ✓  spec/template/ (6 份文档模板)');
}

async function writeSpecTemplate(cwd: string, tmpl: string): Promise<void> {
  let content: string;
  try {
    content = await loadTemplate(join(TEMPLATES_DIR, tmpl));
  } catch {
    content = `# ${tmpl.replace('.template.md', '')}\n\n<!-- 自动生成占位 -->\n`;
  }
  await writeFileSafe(join(cwd, '.docpath/spec/template', tmpl), content);
}

async function writeInitialRules(cwd: string): Promise<void> {
  await writeFileSafe(join(cwd, '.docpath/rules/architecture.md'), await loadTemplate(join(TEMPLATES_DIR, 'architecture.template.md')));
  await writeFileSafe(join(cwd, '.docpath/rules/style.md'), await loadTemplate(join(TEMPLATES_DIR, 'style.template.md')));
}

async function writeInitialGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore');
  if (await exists(gitignorePath)) return;
  await writeFileSafe(gitignorePath, '.docpath/journal/\n.docpath/tasks/\n');
  console.log('  ✓  .gitignore (添加 journal/ 和 tasks/ 排除)');
}

function printInitSummary(level: ComplexityLevel, levelSource: LevelSource, projectInfo: ProjectInfo): void {
  const sourceLabel: Record<LevelSource, string> = {
    auto: '自动检测',
    manual: '手动',
    interactive: '交互选择',
  };
  const levelSummary = `Level ${level} (${sourceLabel[levelSource]})`;
  const detected = [
    projectInfo.type !== 'unknown' ? `类型:${projectInfo.type}` : null,
    projectInfo.framework ? `框架:${projectInfo.framework}` : null,
    projectInfo.language !== 'Unknown' ? `语言:${projectInfo.language}` : null,
  ].filter(Boolean).join(', ');
  console.log(`\n✨  DocPath 初始化完成！`);
  console.log(`  🎯 目标级别: ${levelSummary}`);
  if (detected) console.log(`  🔍 检测到: ${detected}`);
}

function generateConfig(level: ComplexityLevel, projectInfo?: ProjectInfo): string {
  const now = new Date().toISOString().split('T')[0];
  const name = projectInfo?.name || '';
  const desc = projectInfo?.description || '';
  const type = projectInfo?.type || 'unknown';
  const lang = projectInfo?.language || 'Unknown';
  const fw = projectInfo?.framework || '';

  return `# DocPath 项目配置
# 由 docpath:init 自动生成 (${now})

# 默认复杂度级别 (0|1|2|3)
# 0=即时响应, 1=轻量任务, 2=标准任务, 3=复杂任务
default_level: ${level}

# 工作流设置
workflow:
  # 自动触发 brainstorm (Level 2+ 有效)
  auto_brainstorm: true
  # 自动触发 subagent (Level 2+ 有效)
  auto_subagent: true
  # 强制 TDD (Phase 3 实现)
  enforce_tdd: false
  # 强制 Code Review (Phase 3 实现)
  enforce_review: false

# 项目元信息 (自动检测)
project:
  name: "${name}"
  description: "${desc}"
  type: "${type}"
  language: "${lang}"
  framework: "${fw}"
  created_at: "${now}"

# 路径门禁 (不可修改，由引擎维护)
paths:
  state: .docpath/workspace/current.md
  breadcrumb: .docpath/workspace/breadcrumb.md
  tasks: .docpath/tasks/
  rules: .docpath/rules/
  spec_templates: .docpath/spec/template/
  journal: .docpath/journal/
`;
}
