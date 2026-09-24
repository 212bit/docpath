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

import { dirname, isAbsolute, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { readFile, readdir, mkdir, copyFile, chmod, stat } from 'node:fs/promises';
import { exists, writeFileSafe } from '../utils/file.js';
import { getDocpathPackageVersion } from '../utils/package-info.js';
import { readProtocolBlocks, renderProtocolBlocks } from '../utils/protocol-blocks.js';
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
  listReviewSkillNames,
  renderCodexConfigContent,
  renderOpenCodeConfigContent,
  buildExpectedInstallAssets,
  readInstallMetadata,
  detectInstallAssetDrift,
  sampleAssetPaths,
  buildInstallDoctorReportFromContext,
  createInstallContext,
  sha256,
  isLocallyCustomizableInstallAsset,
} from '../utils/install-core.js';

const MERGE_DRIVER_ID = 'docpath-markdown';
const MERGE_DRIVER_SECTION = `[merge "${MERGE_DRIVER_ID}"]`;
const MERGE_DRIVER_ATTRIBUTES = [
  `.docpath/backlog/*.md merge=${MERGE_DRIVER_ID}`,
  `.docpath/backlog/archived/*.md merge=${MERGE_DRIVER_ID}`,
  `.docpath/rules/*.md merge=${MERGE_DRIVER_ID}`,
  // R-335 FR-2: 机器生成的文档索引走 take-current 策略，避免并发收口必冲突
  `.docpath/docs.md merge=${MERGE_DRIVER_ID}`,
  `.docpath/docs-index.json merge=${MERGE_DRIVER_ID}`,
];

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

async function writeManagedFile(
  filePath: string,
  content: string,
  force: boolean,
  label: string,
  isCustomizable = false
): Promise<'written' | 'skipped' | 'unchanged'> {
  if (await exists(filePath)) {
    const existing = await readFile(filePath, 'utf-8');
    if (existing === content) {
      console.log(`✓  ${label} 已是最新`);
      return 'unchanged';
    }

    if (isCustomizable) {
      if (force) {
        const isInteractive = (process.stdin.isTTY && process.stdout.isTTY) || process.env.DOCPATH_TEST_TTY === '1';
        if (isInteractive) {
          const { confirm, isCancel } = await import('@clack/prompts');
          const shouldOverwrite = await confirm({
            message: `检测到本地定制资产 ${label} 已被修改，是否用模板覆写（这会丢失本地定制）？`,
            initialValue: false,
          });
          if (isCancel(shouldOverwrite) || shouldOverwrite !== true) {
            console.log(`⏭️  跳过覆写本地定制资产 ${label}。`);
            skippedManagedFiles.push(`${label} (本地定制)`);
            return 'skipped';
          }
        } else {
          console.warn(`⚠️  警告: 检测到本地定制资产 ${label} 已被修改。在非交互模式下跳过覆写。若要重置，请先手动删除该文件。`);
          skippedManagedFiles.push(`${label} (本地定制)`);
          return 'skipped';
        }
      } else {
        skippedManagedFiles.push(label);
        console.log(`⏭️  ${label} 已存在，跳过。使用 --force 覆盖；差异预览:`);
        console.log(renderDiffHint(existing, content));
        return 'skipped';
      }
    } else {
      if (!force) {
        skippedManagedFiles.push(label);
        console.log(`⏭️  ${label} 已存在，跳过。使用 --force 覆盖；差异预览:`);
        console.log(renderDiffHint(existing, content));
        return 'skipped';
      }
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
  // R-279: 本地改动按三方判定分方向, 各给对应处置——不再一律推荐覆盖式重装。
  if (report.localAhead.length > 0) {
    console.log(`    local_ahead (本地领先, 模板未动): ${sampleAssetPaths(report.localAhead)}`);
    console.log('      → 本地承载未回灌修正; 先把修正 diff 回灌 templates/, 勿直接 install --force 覆盖');
  }
  if (report.manifestStale.length > 0) {
    console.log(`    manifest_stale (本地已与模板一致): ${sampleAssetPaths(report.manifestStale)}`);
    console.log('      → 仅 manifest 记录过期; 重装只刷新记录, 无覆盖风险');
  }
  if (report.diverged.length > 0) {
    console.log(`    diverged (本地与模板双向漂移): ${sampleAssetPaths(report.diverged)}`);
    console.log('      → 人工比对合并后再重装');
  }
  if (report.localAhead.length > 0 || report.diverged.length > 0) {
    console.log('    建议: 先处理 local_ahead/diverged 文件的回灌或合并, 再运行 docpath install --target ' + report.target + ' --force 刷新副本与 manifest');
  } else {
    console.log(`    建议运行: docpath install --target ${report.target}`);
  }
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
  // R-361: npm-link 自引用场景——docpath 通过 npm-link 指向自身 checkout，改模板会使所有
  // 受管项目报 install-manifest-drift，这是必然复发的结构性约束而非项目损坏。检测到时追加说明，
  // 避免误判。判定依据：CLI 入口（含被 npm-link 解引用后的真实路径）落在当前工作目录树内，
  // 即 docpath 的安装源就是当前项目本身。
  try {
    const cliEntry = process.argv[1] ? resolve(process.argv[1]) : '';
    if (cliEntry) {
      const realEntry = realpathSync(cliEntry);
      const cwdReal = realpathSync(context.targetDir);
      if (realEntry === cwdReal || realEntry.startsWith(cwdReal + '/')) {
        console.log('\n💡  检测到 npm-link 自引用：本机 docpath 经 npm-link 指向当前工作目录（即 docpath 自身仓库）。');
        console.log('    在此场景下，修改 docpath 模板源（templates/protocols/）后，所有受管项目都会报');
        console.log('    install-manifest-drift —— 这是结构性约束，并非项目损坏，无需惊慌。');
        console.log('    如需消除漂移告警，请在各受管项目执行: docpath install --force（重建协议副本）。');
        console.log('    ⚠️  不要为了消除告警去回退模板改动——那会丢失你在本仓库的修改。');
      }
    }
  } catch {
    // 路径解析失败时静默跳过自引用检测，不影响正常 doctor 输出。
  }
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

async function resolveGitDir(targetDir: string): Promise<string | null> {
  const dotGit = join(targetDir, '.git');
  if (!(await exists(dotGit))) return null;

  const info = await stat(dotGit);
  if (info.isDirectory()) return dotGit;
  if (!info.isFile()) return null;

  const content = await readFile(dotGit, 'utf-8');
  const match = content.match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) return null;
  const gitDir = match[1].trim();
  return isAbsolute(gitDir) ? gitDir : resolve(dirname(dotGit), gitDir);
}

function renderMergeDriverCommand(): string {
  return './.docpath/bin/docpath merge-driver %O %A %B %P';
}

function upsertGitConfigSection(
  content: string,
  section: string,
  entries: Record<string, string>,
): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const start = lines.findIndex((line) => line.trim() === section);
  const entryLines = Object.entries(entries).map(([key, value]) => `\t${key} = ${value}`);

  if (start === -1) {
    const next = [...lines];
    if (next.length > 0 && next.at(-1) !== '') next.push('');
    next.push(section, ...entryLines);
    return `${next.join('\n')}\n`;
  }

  let end = start + 1;
  while (end < lines.length && !lines[end].trim().startsWith('[')) end++;

  const seen = new Set<string>();
  const replacement = [section];
  for (const line of lines.slice(start + 1, end)) {
    const match = line.match(/^\s*([A-Za-z0-9.-]+)\s*=/);
    const key = match?.[1];
    if (key && Object.prototype.hasOwnProperty.call(entries, key)) {
      if (!seen.has(key)) {
        replacement.push(`\t${key} = ${entries[key]}`);
        seen.add(key);
      }
    } else {
      replacement.push(line);
    }
  }
  for (const [key, value] of Object.entries(entries)) {
    if (!seen.has(key)) replacement.push(`\t${key} = ${value}`);
  }

  return `${[
    ...lines.slice(0, start),
    ...replacement,
    ...lines.slice(end),
  ].join('\n')}\n`;
}

function appendMissingGitAttributes(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const missing = MERGE_DRIVER_ATTRIBUTES.filter((line) => !lines.includes(line));
  if (missing.length === 0) return content;

  const next = [...lines];
  if (next.length > 0 && next.at(-1) !== '') next.push('');
  const comment = '# Generated by docpath install. Structured merge for DocPath markdown.';
  if (!next.includes(comment)) next.push(comment);
  next.push(...missing);
  return `${next.join('\n')}\n`;
}

async function installGitMergeDriver(context: InstallContext): Promise<void> {
  const { targetDir } = context;
  const gitDir = await resolveGitDir(targetDir);
  if (!gitDir) {
    console.log('⏭️  未找到 .git/，跳过 DocPath merge driver 注册');
    return;
  }

  const configPath = join(gitDir, 'config');
  const existingConfig = await exists(configPath) ? await readFile(configPath, 'utf-8') : '';
  const nextConfig = upsertGitConfigSection(existingConfig, MERGE_DRIVER_SECTION, {
    name: 'DocPath structured markdown merge driver',
    driver: renderMergeDriverCommand(),
  });
  if (nextConfig !== existingConfig) {
    await writeFileSafe(configPath, nextConfig);
    console.log(`✅  Git merge driver 已注册 → ${configPath}`);
  } else {
    console.log('✓  Git merge driver 已是最新');
  }

  const attributesPath = join(targetDir, '.gitattributes');
  const existingAttributes = await exists(attributesPath) ? await readFile(attributesPath, 'utf-8') : '';
  const nextAttributes = appendMissingGitAttributes(existingAttributes);
  if (nextAttributes !== existingAttributes) {
    await writeFileSafe(attributesPath, nextAttributes);
    console.log('✅  Git attributes 已映射 DocPath backlog/rules markdown');
  } else {
    console.log('✓  Git attributes 已是最新');
  }
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
    await installProtocolFile(targetDir, 'AGENTS.md', projectName, force);
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

  await installReviewSkills(docpathDir, force);
}

async function installReviewSkills(docpathDir: string, force: boolean): Promise<void> {
  let written = 0;
  let skipped = 0;
  for (const skillName of await listReviewSkillNames()) {
    const content = await readFile(await resolveTemplate('review-skills', skillName, 'SKILL.md'), 'utf-8');
    const skillDir = join(docpathDir, 'review-skills', skillName);
    const skillFile = join(skillDir, 'SKILL.md');
    await mkdir(skillDir, { recursive: true });
    const result = await writeManagedFile(
      skillFile,
      content,
      force,
      `Review Skill → .docpath/review-skills/${skillName}/SKILL.md`,
    );
    if (result === 'skipped') skipped++;
    else written++;
  }
  if (written > 0) {
    const suffix = skipped > 0 ? ` (跳过 ${skipped} 个已存在)` : '';
    console.log(`✅  Review Skills 已处理 (${written} 个)${suffix}`);
  } else {
    console.log('⏭️  Review Skills 已存在，跳过');
  }
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
  if (skippedManagedFiles.length > 0) {
    console.log(`\n⚠️  安装完成但有 ${skippedManagedFiles.length} 项与模板不同且未覆盖（R-312 不再静默庆祝）:`);
    for (const label of skippedManagedFiles.slice(0, 10)) console.log(`    - ${label}`);
    if (skippedManagedFiles.length > 10) console.log(`    ... 共 ${skippedManagedFiles.length} 项`);
    console.log('    覆盖陈旧副本: docpath install --force（本地定制资产会经确认/保留）');
    console.log(`\n✅  其余资产已就绪 (target: ${target})。`);
    return;
  }
  console.log(`\n🎉  Agent 协议安装完成 (target: ${target})！`);
  if (target === 'claude') {
    console.log('    CLAUDE.md / AGENTS.md 和 .claude/commands/ 已就绪，在 Claude Code 中输入 /docpath-status 开始使用。');
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
  await installGitMergeDriver(context);
  await installEntryProtocols(context);
  await installDocpathTemplates(context);
  await installAgentSpecificFiles(context);
  await installGitHooks(context);
  await writeInstallMetadata(context);
  printInstallSummary(target);
}

// ─── 内部工具 ───

// R-312（SynapBuddy 实测）：非 force 安装静默跳过差异文件仍输出完成庆祝，
// 三份陈旧协议副本被掩盖一天。跳过项收集器让终局输出诚实。
const skippedManagedFiles: string[] = [];


const STANDARD_PROTOCOL_SECTIONS = [
  'First Steps & Access Model',
  'Agent Lifecycle Commands',
  'Lightweighting & Execution Rules',
  'Required Gates & Boundaries',
  'Worktree Concurrent Development',
  'Linked Project',
];

function extractCustomProtocolSections(content: string): string[] {
  const sections = content.split(/(?=^##\s+)/m);
  const custom: string[] = [];
  for (const section of sections) {
    const match = section.match(/^##\s+([^\n]+)/);
    if (!match) continue;
    const heading = match[1].trim();
    const isStandard = STANDARD_PROTOCOL_SECTIONS.some(
      std => heading.toLowerCase().includes(std.toLowerCase()) || std.toLowerCase().includes(heading.toLowerCase())
    );
    if (!isStandard) {
      custom.push(section.trim());
    }
  }
  return custom;
}

async function installProtocolFile(
  targetDir: string,
  filename: string,
  projectName: string,
  force: boolean
): Promise<void> {
  const filePath = join(targetDir, filename);
  // R-297: 协议根文件从唯一手写层 templates/protocols/ 渲染（参数化源）。
  const tplPath = await resolveTemplate('protocols', filename);
  let content = await readFile(tplPath, 'utf-8');
  content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  const isCustomizable = isLocallyCustomizableInstallAsset({ path: filename });

  if (await exists(filePath)) {
    const existing = await readFile(filePath, 'utf-8');
    if (existing === content) {
      console.log(`✓  ${filename} 已是最新`);
      return;
    }

    // ── 智能无损更新（Smart Block Update）──
    // 若本地文件包含协议注入块标记，优先以无损方式合并最新共享契约块，保留本地项目绑定与定制
    if (existing.includes('<!-- docpath:block ')) {
      try {
        const templatesDir = await resolveTemplate();
        const blocksDir = join(templatesDir, 'protocols', 'blocks');
        const blocks = await readProtocolBlocks(blocksDir);
        if (blocks) {
          const result = renderProtocolBlocks(existing, blocks);
          if (result.updated.length > 0) {
            await writeFileSafe(filePath, result.content);
            console.log(`✅  ${filename} 智能无损更新: 已同步 ${result.updated.length} 个协议块 (${result.updated.join(', ')})，保留项目绑定与本地定制`);
            return;
          } else if (result.present.length > 0) {
            console.log(`✓  ${filename} 已是最新（协议注入块已对齐，保留本地定制）`);
            return;
          }
        }
      } catch {
        // 出错时回退常规 writeManagedFile 逻辑
      }
    }

    // ── 历史旧版协议自动升级（Legacy Upgrade with Block Adoption）──
    // 若本地文件为旧版 DocPath 协议（无 block 标记），在 force 模式下自动升级为带 block 标记的新版，并保留项目绑定与自定义段落
    if (force && (existing.includes('# DocPath Agent Protocol') || existing.includes('Linked to:'))) {
      try {
        let upgraded = content;
        // 尝试保留已有文件中显式指定的项目名
        const projectMatch = existing.match(/Linked to:\s*\*\*([^*]+)\*\*/);
        if (projectMatch && projectMatch[1]) {
          upgraded = upgraded.replace(new RegExp(`Linked to:\\s*\\*\\*${projectName}\\*\\*`, 'g'), `Linked to: **${projectMatch[1]}**`);
        }
        // 提取并保留非标准自定义段落
        const customSections = extractCustomProtocolSections(existing);
        if (customSections.length > 0) {
          upgraded = upgraded.trimEnd() + '\n\n' + customSections.join('\n\n') + '\n';
        }
        await writeFileSafe(filePath, upgraded);
        console.log(`✅  ${filename} 旧版协议已升级为带注入块的新格式，保留项目绑定与本地定制`);
        return;
      } catch {
        // 回退 writeManagedFile
      }
    }
  }

  await writeManagedFile(filePath, content, force, filename, isCustomizable);
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
