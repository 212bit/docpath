/**
 * docpath install — 安装 Agent 协议文件
 *
 * S5: 完整实现
 * - --target codex|claude|opencode|universal (默认 universal)
 * - --force 覆盖已有文件
 * - 项目检测 (复用 detect.ts)
 * - 生成 Codex/Claude Code/OpenCode 可消费的协议与命令配置
 *
 * 安装健康/资产校验核心层（类型、上下文、期望资产、漂移检测、doctor、模板/渲染工具）
 * 见 utils/install-core.ts；本文件仅保留安装执行与 CLI 命令入口。
 */

import { join, resolve } from 'node:path';
import { readFile, readdir, mkdir, copyFile, chmod } from 'node:fs/promises';
import { exists, writeFileSafe } from '../utils/file.js';
import { getDocpathPackageVersion } from '../utils/package-info.js';
import {
  type Target,
  type HookMode,
  type InstallOptions,
  type InstallContext,
  type InstallDoctorReport,
  resolveTemplate,
  shellQuote,
  wrapClaudeCommandWithShim,
  listCodexSkillNames,
  renderCodexConfigContent,
  renderOpenCodeConfigContent,
  buildExpectedInstallAssets,
  readInstallMetadata,
  detectInstallAssetDrift,
  sampleAssetPaths,
  buildInstallDoctorReportFromContext,
  createInstallContext,
  sha256,
} from '../utils/install-core.js';

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

function renderDiffHint(existing: string, next: string): string {
  const oldLines = existing.split('\n');
  const newLines = next.split('\n');
  const max = Math.max(oldLines.length, newLines.length);
  const changes: string[] = [];

  for (let i = 0; i < max && changes.length < 8; i++) {
    if (oldLines[i] === newLines[i]) continue;
    changes.push(`  - ${i + 1}: ${oldLines[i] ?? '<missing>'}`);
    changes.push(`  + ${i + 1}: ${newLines[i] ?? '<missing>'}`);
  }

  return changes.length > 0 ? changes.join('\n') : '  内容不同，但未能生成简短 diff。';
}

async function writeManagedFile(filePath: string, content: string, force: boolean, label: string): Promise<'written' | 'skipped' | 'unchanged'> {
  if (await exists(filePath)) {
    const existing = await readFile(filePath, 'utf-8');
    if (existing === content) {
      console.log(`✓  ${label} 已是最新`);
      return 'unchanged';
    }
    if (!force) {
      console.log(`⏭️  ${label} 已存在，跳过。使用 --force 覆盖；差异预览:`);
      console.log(renderDiffHint(existing, content));
      return 'skipped';
    }
  }

  await writeFileSafe(filePath, content);
  console.log(`✅  ${label} 已生成`);
  return 'written';
}

// ─── CLI 入口：check / doctor ───

async function runInstallCheck(context: InstallContext): Promise<void> {
  const meta = await readInstallMetadata(context.docpathDir);
  if (!meta) {
    throw new Error('未找到 .docpath/.install-meta.json，请先运行 docpath install');
  }
  if (!Array.isArray(meta.assets) || meta.assets.length === 0) {
    throw new Error('安装资产 manifest 缺失，请重新运行 docpath install');
  }

  const report = await detectInstallAssetDrift(context.targetDir, meta, {
    target: context.target,
    projectName: context.projectName,
  });

  if (!report.hasDrift) {
    console.log(`✅  install manifest 检查通过 (target: ${report.target}, assets: ${report.assetCount})`);
    return;
  }

  console.log(`❌  install manifest 检查失败: 模板 ${report.templateDrift.length} 项, 缺失 ${report.missingLocal.length} 项, 本地改动 ${report.modifiedLocal.length} 项`);
  const sample = sampleAssetPaths(report.templateDrift);
  if (sample) console.log(`    模板漂移示例: ${sample}`);
  const missingSample = sampleAssetPaths(report.missingLocal);
  if (missingSample) console.log(`    缺失文件示例: ${missingSample}`);
  const modifiedSample = sampleAssetPaths(report.modifiedLocal);
  if (modifiedSample) console.log(`    本地改动示例: ${modifiedSample}`);
  console.log(`    建议运行: docpath install --target ${report.target}`);
  throw new Error('install manifest drift detected');
}

function printDoctorReport(report: InstallDoctorReport): void {
  if (report.issues.length === 0) {
    console.log(`✅  install doctor 通过 (target: ${report.target})`);
    return;
  }

  console.log(`❌  install doctor 发现 ${report.errors} 个错误, ${report.warnings} 个警告`);
  for (const issue of report.issues) {
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    console.log(`  ${icon} [${issue.id}] ${issue.message}`);
    console.log(`     建议: ${issue.suggestion}`);
  }
}

async function runInstallDoctor(context: InstallContext, json = false): Promise<void> {
  const report = await buildInstallDoctorReportFromContext(context);
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.passed) process.exitCode = 1;
    return;
  }
  printDoctorReport(report);
  if (!report.passed) throw new Error('install doctor failed');
}

// ─── 安装执行 ───

async function installLocalCliShim(targetDir: string, force: boolean): Promise<void> {
  const shimDir = join(targetDir, '.docpath', 'bin');
  const shimPath = join(shimDir, 'docpath');
  const cliEntry = process.argv[1] ? resolve(process.argv[1]) : '';
  const nodeBin = process.execPath;

  if (!cliEntry || !(await exists(cliEntry))) {
    console.log('⚠️  无法定位当前 DocPath CLI 入口，跳过 .docpath/bin/docpath shim');
    return;
  }

  const content = [
    '#!/usr/bin/env sh',
    '# Generated by docpath install. Local shim preferred by Claude/OpenCode command templates.',
    `exec ${shellQuote(nodeBin)} ${shellQuote(cliEntry)} "$@"`,
    '',
  ].join('\n');

  await mkdir(shimDir, { recursive: true });
  const result = await writeManagedFile(shimPath, content, force, '本地 DocPath CLI shim → .docpath/bin/docpath');
  if (result !== 'skipped') await chmod(shimPath, 0o755);
}

function renderPreCommitHook(hookMode: HookMode): string {
  const command = hookMode === 'agent-done' ? 'agent done' : 'check';
  return [
    '#!/usr/bin/env sh',
    '# Generated by docpath install --hooks. Runs DocPath gates before commit.',
    'set -eu',
    '',
    'if [ -x ./.docpath/bin/docpath ]; then',
    `  exec ./.docpath/bin/docpath ${command}`,
    'elif command -v docpath >/dev/null 2>&1; then',
    `  exec docpath ${command}`,
    'elif [ -x ./node_modules/.bin/docpath ]; then',
    `  exec ./node_modules/.bin/docpath ${command}`,
    'elif [ -f ./bin/docpath.js ]; then',
    `  exec node ./bin/docpath.js ${command}`,
    'elif [ -f ./dist/index.js ]; then',
    `  exec node ./dist/index.js ${command}`,
    'else',
    '  echo "DocPath CLI not found. Install it or run from the DocPath project root."',
    '  exit 127',
    'fi',
    '',
  ].join('\n');
}

async function installGitHooks(context: InstallContext): Promise<void> {
  const { targetDir, force, hooks, hookMode } = context;
  if (!hooks) return;

  const gitDir = join(targetDir, '.git');
  if (!(await exists(gitDir))) {
    console.log('⏭️  未找到 .git/，跳过 git hooks 安装');
    return;
  }

  const hooksDir = join(gitDir, 'hooks');
  const preCommitPath = join(hooksDir, 'pre-commit');
  await mkdir(hooksDir, { recursive: true });
  const result = await writeManagedFile(
    preCommitPath,
    renderPreCommitHook(hookMode),
    force,
    `Git pre-commit hook (${hookMode}) → .git/hooks/pre-commit`,
  );
  if (result !== 'skipped') await chmod(preCommitPath, 0o755);
}

async function installEntryProtocols(context: InstallContext): Promise<void> {
  const { target, targetDir, projectName, force } = context;
  // ─── 1. 入口协议文件 ───
  if (target === 'universal') {
    await installProtocolFile(targetDir, 'CLAUDE.md', projectName, force);
    await installProtocolFile(targetDir, 'AGENTS.md', projectName, force);
    await installProtocolFile(targetDir, 'CODEX.md', projectName, force);
    await installProtocolFile(targetDir, 'OPENCODE.md', projectName, force);
  } else if (target === 'codex') {
    await installProtocolFile(targetDir, 'AGENTS.md', projectName, force);
    await installProtocolFile(targetDir, 'CODEX.md', projectName, force);
  } else if (target === 'claude') {
    await installProtocolFile(targetDir, 'CLAUDE.md', projectName, force);
  } else if (target === 'opencode') {
    await installProtocolFile(targetDir, 'OPENCODE.md', projectName, force);
  }
}

async function installDocpathTemplates(context: InstallContext): Promise<void> {
  const { docpathDir, force } = context;
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
}

async function installCodexSkills(targetDir: string, force: boolean): Promise<void> {
  const skillsRoot = join(targetDir, '.codex', 'skills');
  await mkdir(skillsRoot, { recursive: true });
  let written = 0;
  let skipped = 0;

  for (const skillName of await listCodexSkillNames()) {
    const content = await readFile(await resolveTemplate('codex-skills', skillName, 'SKILL.md'), 'utf-8');
    const skillDir = join(skillsRoot, skillName);
    const skillFile = join(skillDir, 'SKILL.md');
    await mkdir(skillDir, { recursive: true });
    const result = await writeManagedFile(
      skillFile,
      content,
      force,
      `Codex Skill → .codex/skills/${skillName}/SKILL.md`,
    );
    if (result === 'skipped') skipped++;
    else written++;
  }

  if (written > 0) {
    const suffix = skipped > 0 ? ` (跳过 ${skipped} 个已存在)` : '';
    console.log(`✅  Codex Skills 已处理 (${written} 个)${suffix}`);
  } else {
    console.log('⏭️  Codex Skills 已存在，跳过');
  }
}

async function installAgentSpecificFiles(context: InstallContext): Promise<void> {
  const { target, targetDir, force } = context;
  // ─── 3. Agent-specific 目录 ───
  if (target === 'claude' || target === 'universal') {
    await installAgentCommands(
      targetDir, '.claude', 'commands', 'docpath',
      force, 'Claude Code slash 命令'
    );
  }
  if (target === 'opencode' || target === 'universal') {
    await installAgentCommands(
      targetDir, '.opencode', 'commands', 'docpath',
      force, 'OpenCode 命令'
    );
  }
  if (target === 'codex' || target === 'universal') {
    await installCodexConfig(targetDir, force);
    await installCodexSkills(targetDir, force);
  }
  if (target === 'opencode' || target === 'universal') {
    await installOpenCodeConfig(targetDir, force);
  }
}

async function writeInstallMetadata(context: InstallContext): Promise<void> {
  const { target, docpathDir, targetDir, projectName, projectInfo } = context;
  // ─── 4. 写入安装元数据 ───
  const metaPath = join(docpathDir, '.install-meta.json');
  const docpathVersion = await getDocpathPackageVersion();
  const expectedAssets = await buildExpectedInstallAssets({ target, projectName });

  const assets = [];
  for (const asset of expectedAssets) {
    const localPath = join(targetDir, asset.path);
    if (await exists(localPath)) {
      const content = await readFile(localPath, 'utf-8');
      assets.push({
        path: asset.path,
        source: asset.source,
        sha256: sha256(content),
      });
    } else {
      assets.push(asset);
    }
  }

  const meta = {
    target,
    installedAt: new Date().toISOString(),
    projectName,
    projectType: projectInfo?.type ?? 'unknown',
    docpathVersion,
    assets,
  };
  await writeFileSafe(metaPath, JSON.stringify(meta, null, 2) + '\n');
}

function printInstallSummary(target: Target): void {
  console.log(`\n🎉  Agent 协议安装完成 (target: ${target})！`);
  if (target === 'claude') {
    console.log('    CLAUDE.md 和 .claude/commands/ 已就绪，在 Claude Code 中输入 /docpath-status 开始使用。');
  } else if (target === 'opencode') {
    console.log('    OPENCODE.md 和 .opencode/commands/ 已就绪，可在 OpenCode 中调用 DocPath 命令。');
  } else if (target === 'codex') {
    console.log('    AGENTS.md / CODEX.md / .codex/config.toml / .codex/skills/ 已就绪，可在 Codex 中读取项目协议与 $docpath Skills。');
  } else {
    console.log('    CODEX.md / CLAUDE.md / AGENTS.md / OPENCODE.md、.codex/skills/ 及三端配置已就绪。');
  }
}

// ─── 主命令 ───

export async function installCommand(options: InstallOptions = {}): Promise<void> {
  const context = await createInstallContext(options);
  const { target, targetDir, force, projectInfo } = context;
  const detected = projectInfo ? `${projectInfo.type}/${projectInfo.language}` : '未检测到';
  const quietJsonDoctor = options.doctor && options.json;
  if (!quietJsonDoctor) {
    console.log(`📦  安装 Agent 协议文件到: ${targetDir}`);
    console.log(`    目标: ${target} | 项目: ${detected}\n`);
  }

  if (options.checkOnly || options.check) {
    await runInstallCheck(context);
    return;
  }

  if (options.doctor) {
    await runInstallDoctor(context, !!options.json);
    return;
  }

  await installLocalCliShim(targetDir, force);
  await installEntryProtocols(context);
  await installDocpathTemplates(context);
  await installAgentSpecificFiles(context);
  await installGitHooks(context);
  await writeInstallMetadata(context);
  printInstallSummary(target);
}

// ─── 内部工具 ───

async function installProtocolFile(
  targetDir: string,
  filename: string,
  projectName: string,
  force: boolean
): Promise<void> {
  const filePath = join(targetDir, filename);
  const tplPath = await resolveTemplate(filename);
  let content = await readFile(tplPath, 'utf-8');
  content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  await writeManagedFile(filePath, content, force, filename);
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
    const srcFile = join(srcDir, file);
    if (agentDir === '.claude') {
      const original = await readFile(srcFile, 'utf-8');
      await writeFileSafe(destFile, wrapClaudeCommandWithShim(original));
    } else {
      await copyFile(srcFile, destFile);
    }
    copied++;
  }

  if (copied > 0) {
    console.log(`✅  ${label} 已复制 (${copied} 个) → ${agentDir}/${subdir}/`);
  } else {
    console.log(`⏭️  ${label} 已存在，跳过`);
  }
}

async function installCodexConfig(targetDir: string, force: boolean): Promise<void> {
  const codexDir = join(targetDir, '.codex');
  await mkdir(codexDir, { recursive: true });
  const configPath = join(codexDir, 'config.toml');
  await writeManagedFile(configPath, renderCodexConfigContent(), force, 'Codex 配置 → .codex/config.toml');
}

async function installOpenCodeConfig(targetDir: string, force: boolean): Promise<void> {
  const opencodeDir = join(targetDir, '.opencode');
  await mkdir(opencodeDir, { recursive: true });
  const configPath = join(opencodeDir, 'docpath.json');
  await writeManagedFile(configPath, renderOpenCodeConfigContent(), force, 'OpenCode 配置 → .opencode/docpath.json');
}
