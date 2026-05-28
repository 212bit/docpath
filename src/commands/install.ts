/**
 * docpath install — 安装 Agent 协议文件
 *
 * S5: 完整实现
 * - --target claude|opencode|universal (默认 universal)
 * - --force 覆盖已有文件
 * - 项目检测 (复用 detect.ts)
 * - 生成 .claude/commands/ 或 .opencode/commands/
 */

import { join, resolve, basename } from 'node:path';
import { readFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { exists, writeFileSafe } from '../utils/file.js';
import { detectProject, type ProjectInfo } from '../utils/detect.js';

type Target = 'claude' | 'opencode' | 'universal';

interface InstallOptions {
  cwd?: string;
  target?: string;
  force?: boolean;
}

// ─── 模板路径解析 ───

const TEMPLATES_ROOT = join(process.cwd(), 'templates');

function templatePath(...segments: string[]): string {
  return join(TEMPLATES_ROOT, ...segments);
}

async function resolveTemplate(...segments: string[]): Promise<string> {
  const devPath = templatePath(...segments);
  if (await exists(devPath)) return devPath;

  // fallback: 包内
  const pkgPath = join(import.meta.dirname ?? join(process.cwd(), 'dist'), '..', 'templates', ...segments);
  if (await exists(pkgPath)) return pkgPath;

  throw new Error(`模板文件未找到: ${segments.join('/')}`);
}

// ─── 复制目录工具 ───

async function copyDir(
  src: string,
  dest: string,
  opts: { force: boolean; label: string }
): Promise<number> {
  if (!(await exists(src))) return 0;
  await mkdir(dest, { recursive: true });
  const files = await readdir(src);
  let copied = 0;
  for (const file of files) {
    if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;
    const destFile = join(dest, file);
    if (!opts.force && (await exists(destFile))) continue;
    await copyFile(join(src, file), destFile);
    copied++;
  }
  if (copied > 0) {
    const skipped = files.length - copied;
    const suffix = skipped > 0 ? ` (跳过 ${skipped} 个已存在)` : '';
    console.log(`✅  ${opts.label} 已复制 (${copied} 个)${suffix}`);
  } else {
    console.log(`⏭️  ${opts.label} 已存在，跳过`);
  }
  return copied;
}

// ─── 主命令 ───

export async function installCommand(options: InstallOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const target = (options.target || 'universal') as Target;
  const force = !!options.force;
  const targetDir = cwd;
  const docpathDir = join(targetDir, '.docpath');
  const projectName = basename(targetDir);

  // 检查 .docpath 是否存在
  if (!(await exists(docpathDir))) {
    console.error('❌  目标目录没有 .docpath/ 工作流目录');
    console.error('   请先运行: docpath init');
    process.exit(1);
  }

  // 项目检测
  let projectInfo: ProjectInfo | null = null;
  try {
    projectInfo = await detectProject(targetDir);
  } catch {
    // 非致命，继续
  }

  const detected = projectInfo ? `${projectInfo.type}/${projectInfo.language}` : '未检测到';
  console.log(`📦  安装 Agent 协议文件到: ${targetDir}`);
  console.log(`    目标: ${target} | 项目: ${detected}\n`);

  // ─── 1. 入口协议文件 (universal 模式: root 目录) ───
  if (target === 'universal') {
    await installProtocolFile(targetDir, 'CLAUDE.md', projectName, force);
    await installProtocolFile(targetDir, 'AGENTS.md', projectName, force);
  }

  // ─── 2. .docpath/ 内容 (所有 target 都装) ───
  await copyDir(
    await resolveTemplate('workflows'),
    join(docpathDir, 'workflows'),
    { force, label: '工作流模板 → .docpath/workflows/' }
  );

  await copyDir(
    await resolveTemplate('skills'),
    join(docpathDir, 'skills'),
    { force, label: 'Skills 模板 → .docpath/skills/' }
  );

  await copyDir(
    await resolveTemplate('protocols'),
    join(docpathDir, 'protocols'),
    { force, label: 'Protocols 模板 → .docpath/protocols/' }
  );

  await copyDir(
    await resolveTemplate('commands'),
    join(docpathDir, 'commands'),
    { force, label: 'Commands 模板 → .docpath/commands/' }
  );

  // ─── 3. Agent-specific 目录 ───
  if (target === 'claude') {
    // .claude/commands/ — Claude Code slash commands
    await installAgentCommands(
      targetDir, '.claude', 'commands', 'docpath',
      force, 'Claude Code slash 命令'
    );
  } else if (target === 'opencode') {
    // .opencode/commands/ — OpenCode commands
    await installAgentCommands(
      targetDir, '.opencode', 'commands', 'docpath',
      force, 'OpenCode 命令'
    );
  }

  // ─── 4. 写入安装元数据 ───
  const metaPath = join(docpathDir, '.install-meta.json');
  const meta = {
    target,
    installedAt: new Date().toISOString(),
    projectName,
    projectType: projectInfo?.type ?? 'unknown',
    docpathVersion: '0.1.0',
  };
  await writeFileSafe(metaPath, JSON.stringify(meta, null, 2) + '\n');

  console.log(`\n🎉  Agent 协议安装完成 (target: ${target})！`);
  if (target === 'claude') {
    console.log('    在 Claude Code 中输入 /docpath-workflow 开始使用。');
  } else if (target === 'opencode') {
    console.log('    在 OpenCode 中输入 /docpath-workflow 开始使用。');
  } else {
    console.log('    CLAUDE.md / AGENTS.md 已就绪，支持 Claude Code 和通用 Agent。');
  }
}

// ─── 内部工具 ───

async function installProtocolFile(
  targetDir: string,
  filename: string,
  projectName: string,
  force: boolean
): Promise<void> {
  const filePath = join(targetDir, filename);
  if (!force && (await exists(filePath))) {
    console.log(`⏭️  ${filename} 已存在，跳过`);
    return;
  }
  const tplPath = await resolveTemplate(filename);
  let content = await readFile(tplPath, 'utf-8');
  content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  await writeFileSafe(filePath, content);
  console.log(`✅  ${filename} 已生成`);
}

async function installAgentCommands(
  targetDir: string,
  agentDir: string,       // '.claude' | '.opencode'
  subdir: string,         // 'commands'
  prefix: string,         // 'docpath'
  force: boolean,
  label: string
): Promise<void> {
  const srcDir = await resolveTemplate('commands');
  if (!(await exists(srcDir))) {
    console.log(`⏭️  ${label}: 模板源不存在，跳过`);
    return;
  }

  const destDir = join(targetDir, agentDir, subdir);
  await mkdir(destDir, { recursive: true });

  const files = await readdir(srcDir);
  let copied = 0;
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    // Claude/OpenCode slash commands 需要带前缀
    const destName = file.startsWith(prefix) ? file : `${prefix}-${file}`;
    const destFile = join(destDir, destName);
    if (!force && (await exists(destFile))) continue;
    await copyFile(join(srcDir, file), destFile);
    copied++;
  }

  if (copied > 0) {
    console.log(`✅  ${label} 已复制 (${copied} 个) → ${agentDir}/${subdir}/`);
  } else {
    console.log(`⏭️  ${label} 已存在，跳过`);
  }
}
