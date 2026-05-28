/**
 * docpath:init — 在项目根目录初始化 .docpath/ 状态机目录
 * 
 * 生成的目录结构:
 * .docpath/
 * ├── config.yaml
 * ├── CLAUDE.md (灵魂协议文件)
 * ├── spec/
 * │   ├── architecture.md
 * │   ├── style.md
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
import { exists, ensureDir, writeFileSafe, createLink } from '../utils/file.js';
import type { ComplexityLevel } from '../engine/state-machine.js';
import { createDefaultState } from '../engine/state-machine.js';
import { loadTemplate } from '../utils/file.js';
import { detectProject, formatProjectInfo, detectMonorepo, type ProjectInfo } from '../utils/detect.js';

interface InitOptions {
  cwd?: string;
  level?: ComplexityLevel;
  force?: boolean;
  link?: string;
}

const TEMPLATES_DIR = join(
  new URL('.', import.meta.url).pathname,
  '..', 'templates'
);

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const docpathDir = join(cwd, '.docpath');

  // ── --link 模式：关联已有项目 ──
  if (options.link) {
    const targetPath = options.link;
    if (!(await exists(join(targetPath, '.docpath')))) {
      console.log('❌  目标项目未找到 .docpath/ 目录');
      return;
    }
    await ensureDir(docpathDir);
    await createLink(cwd, targetPath);
    console.log('🔗  已关联项目: ' + targetPath);
    console.log('    所有 docpath 命令将使用目标项目的 .docpath/\n');
    return;
  }

  // 检查是否已存在
  if (!options.force && await exists(docpathDir)) {
    console.log('⚠️  .docpath/ 目录已存在。使用 --force 重新生成。');
    return;
  }

  // ── 自动检测项目信息 ──
  console.log('\n🔍  检测项目信息...\n');
  const projectInfo = await detectProject(cwd);
  console.log(formatProjectInfo(projectInfo));

  // ── Monorepo 检测 ──
  const monorepo = await detectMonorepo(cwd);
  if (monorepo.isMonorepo) {
    console.log(`\n📦  检测到 Monorepo (${monorepo.type || 'generic'})\n`);
    for (const sub of monorepo.subProjects) {
      console.log(`  ├── ${sub.name}/`);
      console.log(`  │     类型: ${sub.info.type} | 框架: ${sub.info.framework || '—'} | 语言: ${sub.info.language}`);
    }
    console.log();
  }

  // 如果用户没指定 level，用检测到的复杂度
  const level: ComplexityLevel = options.level || String(projectInfo.complexity) as ComplexityLevel;

  // ── 创建目录结构 ──
  console.log('\n📁  初始化 DocPath 工作流...\n');

  const dirs = [
    '.docpath',
    '.docpath/spec',
    '.docpath/spec/template',
    '.docpath/tasks',
    '.docpath/workspace',
    '.docpath/journal',
  ];

  for (const dir of dirs) {
    await ensureDir(join(cwd, dir));
  }
  console.log('  ✓  目录结构已创建');

  // ── 写入 config.yaml (含自动检测的项目信息) ──
  await writeFileSafe(join(cwd, '.docpath/config.yaml'), generateConfig(level, projectInfo));
  console.log('  ✓  config.yaml (已填充项目信息)');

  // ── 写入 workspace/current.md (状态寄存器) ──
  const defaultState = createDefaultState();
  if (options.level !== undefined) {
    defaultState.level = options.level;
  }
  const currentContent = await loadTemplate(join(TEMPLATES_DIR, 'current.template.md'));
  await writeFileSafe(join(cwd, '.docpath/workspace/current.md'), currentContent);
  console.log('  ✓  workspace/current.md (状态寄存器)');

  // ── 写入 workspace/breadcrumb.md ──
  const breadcrumbContent = await loadTemplate(join(TEMPLATES_DIR, 'breadcrumb.template.md'));
  await writeFileSafe(join(cwd, '.docpath/workspace/breadcrumb.md'), breadcrumbContent);
  console.log('  ✓  workspace/breadcrumb.md (面包屑)');

  // ── 写入 CLAUDE.md (灵魂文件) ──
  const claudeContent = await loadTemplate(join(TEMPLATES_DIR, 'CLAUDE.md'));
  await writeFileSafe(join(cwd, 'CLAUDE.md'), claudeContent);
  console.log('  ✓  CLAUDE.md (灵魂协议文件)');

  // ── 写入 spec 模板 ──
  const specTemplates = [
    'architecture.template.md',
    'style.template.md',
    'spec.template.md',
    'plan.template.md',
    'task.template.md',
    'check.template.md',
    'review.template.md',
  ];

  for (const tmpl of specTemplates) {
    const srcPath = join(TEMPLATES_DIR, tmpl);
    let content: string;
    try {
      content = await loadTemplate(srcPath);
    } catch {
      content = `# ${tmpl.replace('.template.md', '')}\n\n<!-- 自动生成占位 -->\n`;
    }
    // 模板文件 -> .docpath/spec/template/
    await writeFileSafe(join(cwd, '.docpath/spec/template', tmpl), content);
  }
  console.log('  ✓  spec/template/ (6 份文档模板)');

  // ── 写入初始 spec 文件 ──
  const architectureContent = await loadTemplate(join(TEMPLATES_DIR, 'architecture.template.md'));
  await writeFileSafe(join(cwd, '.docpath/spec/architecture.md'), architectureContent);

  const styleContent = await loadTemplate(join(TEMPLATES_DIR, 'style.template.md'));
  await writeFileSafe(join(cwd, '.docpath/spec/style.md'), styleContent);

  // ── 创建 .gitignore（如果 .git 存在） ──
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreExists = await exists(gitignorePath);
  if (!gitignoreExists) {
    await writeFileSafe(gitignorePath, '.docpath/journal/\n.docpath/tasks/\n');
    console.log('  ✓  .gitignore (添加 journal/ 和 tasks/ 排除)');
  }

  // ── 完成 ──
  const levelLabel = options.level !== undefined ? `Level ${options.level} (手动)` : `Level ${level} (自动检测)`;
  const detected = [
    projectInfo.type !== 'unknown' ? `类型:${projectInfo.type}` : null,
    projectInfo.framework ? `框架:${projectInfo.framework}` : null,
    projectInfo.language !== 'Unknown' ? `语言:${projectInfo.language}` : null,
  ].filter(Boolean).join(', ');
  
  console.log(`\n✨  DocPath 初始化完成！`);
  console.log(`  🎯 目标级别: ${levelLabel}`);
  if (detected) {
    console.log(`  🔍 检测到: ${detected}`);
  }
  console.log('\n  下一步:');
  console.log('    • 编辑 .docpath/config.yaml 调整项目配置');
  console.log('    • CLAUDE.md 已就绪，Claude Code 进入时会自动读取');
  console.log('    • 运行 docpath:status 查看当前状态');
  console.log('    • 提交你的第一个任务即可体验渐进式工作流\n');
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
  spec: .docpath/spec/
  journal: .docpath/journal/
`;
}
