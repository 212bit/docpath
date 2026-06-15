/**
 * docpath install — 安装 Agent 协议文件
 *
 * S5: 完整实现
 * - --target codex|claude|opencode|universal (默认 universal)
 * - --force 覆盖已有文件
 * - 项目检测 (复用 detect.ts)
 * - 生成 Codex/Claude Code/OpenCode 可消费的协议与命令配置
 */

import { join, resolve, basename } from 'node:path';
import { readFile, readdir, mkdir, copyFile, chmod, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { exists, writeFileSafe } from '../utils/file.js';
import { detectProject, type ProjectInfo } from '../utils/detect.js';
import { getDocpathPackageVersion } from '../utils/package-info.js';

export type Target = 'codex' | 'claude' | 'opencode' | 'universal';
type HookMode = 'check' | 'agent-done';

export interface InstallAssetManifestEntry {
  path: string;
  source: string;
  sha256: string;
}

export interface InstallMetadata {
  target?: string;
  projectName?: string;
  assets?: InstallAssetManifestEntry[];
}

export interface InstallAssetDriftReport {
  target: Target;
  projectName: string;
  assetCount: number;
  templateDrift: InstallAssetManifestEntry[];
  missingLocal: InstallAssetManifestEntry[];
  modifiedLocal: InstallAssetManifestEntry[];
  hasDrift: boolean;
}

interface InstallOptions {
  cwd?: string;
  target?: string;
  force?: boolean;
  hooks?: boolean;
  hookMode?: string;
  checkOnly?: boolean;
  check?: boolean;
  doctor?: boolean;
  json?: boolean;
}

interface InstallContext {
  cwd: string;
  target: Target;
  force: boolean;
  targetDir: string;
  docpathDir: string;
  projectName: string;
  projectInfo: ProjectInfo | null;
  hooks: boolean;
  hookMode: HookMode;
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function wrapClaudeCommandWithShim(content: string): string {
  const runBlock = content.match(/## Run\s+```bash\n([\s\S]*?)\n```/);
  if (!runBlock) return content;

  const command = runBlock[1].trim();
  if (!command.startsWith('docpath ')) return content;

  const fallback = [
    'if [ -x ./.docpath/bin/docpath ]; then',
    `  ./.docpath/bin/${command}`,
    'elif command -v docpath >/dev/null 2>&1; then',
    `  ${command}`,
    'elif [ -x ./node_modules/.bin/docpath ]; then',
    `  ./node_modules/.bin/${command}`,
    'elif [ -f ./bin/docpath.js ]; then',
    `  node ./bin/docpath.js ${command.slice('docpath '.length)}`,
    'elif [ -f ./dist/index.js ]; then',
    `  node ./dist/index.js ${command.slice('docpath '.length)}`,
    'else',
    '  echo "DocPath CLI not found. Install it or run from the DocPath project root."',
    '  exit 127',
    'fi',
  ].join('\n');

  return content.replace(runBlock[0], `## Run\n\n\`\`\`bash\n${fallback}\n\`\`\``);
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function manifestEntry(path: string, source: string, content: string): InstallAssetManifestEntry {
  return { path, source, sha256: sha256(content) };
}

async function listTemplateFiles(...segments: string[]): Promise<string[]> {
  const dir = await resolveTemplate(...segments);
  const files = await readdir(dir);
  return files.filter((file) => file.endsWith('.md') || file.endsWith('.txt')).sort();
}

async function listCodexSkillNames(): Promise<string[]> {
  const dir = await resolveTemplate('codex-skills');
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function entryProtocolFiles(target: Target): string[] {
  if (target === 'universal') return ['CLAUDE.md', 'AGENTS.md', 'CODEX.md', 'OPENCODE.md'];
  if (target === 'codex') return ['AGENTS.md', 'CODEX.md'];
  if (target === 'claude') return ['CLAUDE.md'];
  return ['OPENCODE.md'];
}

function renderCodexConfigContent(): string {
  return `# DocPath adapter for Codex CLI / Codex-style coding agents.
# Codex reads workflow instructions from AGENTS.md. CODEX.md remains an
# instruction fallback for environments that do not use AGENTS.md directly.

project_doc_fallback_filenames = ["CODEX.md"]
`;
}

function renderOpenCodeConfigContent(): string {
  return JSON.stringify({
    protocol: 'OPENCODE.md',
    state: '.docpath/workspace/current.md',
    breadcrumb: '.docpath/workspace/breadcrumb.md',
    commands: {
      status: 'docpath status --agent',
      next: 'docpath next --agent',
      context: 'docpath context --agent',
      check: 'docpath check',
      review: 'docpath review',
      journal: 'docpath journal',
      handoff: 'docpath agent handoff',
    },
  }, null, 2) + '\n';
}

export async function buildExpectedInstallAssets(options: {
  target: Target;
  projectName: string;
}): Promise<InstallAssetManifestEntry[]> {
  const assets: InstallAssetManifestEntry[] = [];

  for (const filename of entryProtocolFiles(options.target)) {
    const template = await readFile(await resolveTemplate(filename), 'utf-8');
    const content = template.replace(/\{\{PROJECT_NAME\}\}/g, options.projectName);
    assets.push(manifestEntry(filename, `protocol:${filename}`, content));
  }

  for (const group of ['workflows', 'skills', 'protocols', 'commands']) {
    for (const file of await listTemplateFiles(group)) {
      const content = await readFile(await resolveTemplate(group, file), 'utf-8');
      assets.push(manifestEntry(`.docpath/${group}/${file}`, `docpath:${group}/${file}`, content));
    }
  }

  if (options.target === 'claude' || options.target === 'universal') {
    for (const file of await listTemplateFiles('commands')) {
      const content = await readFile(await resolveTemplate('commands', file), 'utf-8');
      assets.push(manifestEntry(`.claude/commands/${file}`, `claude-command:${file}`, wrapClaudeCommandWithShim(content)));
    }
  }

  if (options.target === 'opencode' || options.target === 'universal') {
    for (const file of await listTemplateFiles('commands')) {
      const content = await readFile(await resolveTemplate('commands', file), 'utf-8');
      assets.push(manifestEntry(`.opencode/commands/${file}`, `opencode-command:${file}`, content));
    }
  }

  if (options.target === 'codex' || options.target === 'universal') {
    assets.push(manifestEntry('.codex/config.toml', 'codex-config', renderCodexConfigContent()));
    for (const skillName of await listCodexSkillNames()) {
      const content = await readFile(await resolveTemplate('codex-skills', skillName, 'SKILL.md'), 'utf-8');
      assets.push(manifestEntry(
        `.codex/skills/${skillName}/SKILL.md`,
        `codex-skill:${skillName}/SKILL.md`,
        content
      ));
    }
  }

  if (options.target === 'opencode' || options.target === 'universal') {
    assets.push(manifestEntry('.opencode/docpath.json', 'opencode-config', renderOpenCodeConfigContent()));
  }

  return assets.sort((a, b) => a.path.localeCompare(b.path) || a.source.localeCompare(b.source));
}

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

function normalizeTarget(value?: string): Target {
  const target = (value || 'universal') as Target;
  const validTargets: Target[] = ['codex', 'claude', 'opencode', 'universal'];
  if (!validTargets.includes(target)) {
    throw new Error(`未知 target: ${target}. 可选: ${validTargets.join(' | ')}`);
  }
  return target;
}

export function isInstallTarget(value: unknown): value is Target {
  const validTargets: Target[] = ['codex', 'claude', 'opencode', 'universal'];
  return typeof value === 'string' && validTargets.includes(value as Target);
}

function normalizeHookMode(value?: string): HookMode {
  const mode = (value || 'check') as HookMode;
  const validModes: HookMode[] = ['check', 'agent-done'];
  if (!validModes.includes(mode)) {
    throw new Error(`未知 hook mode: ${mode}. 可选: ${validModes.join(' | ')}`);
  }
  return mode;
}

function assetKey(asset: Pick<InstallAssetManifestEntry, 'path' | 'source'>): string {
  return `${asset.path}\0${asset.source}`;
}

function isLocallyCustomizableInstallAsset(asset: Pick<InstallAssetManifestEntry, 'path'>): boolean {
  return asset.path === 'AGENTS.md';
}

async function readInstallMetadata(docpathDir: string): Promise<InstallMetadata | null> {
  const metaPath = join(docpathDir, '.install-meta.json');
  if (!(await exists(metaPath))) return null;

  try {
    return JSON.parse(await readFile(metaPath, 'utf-8')) as InstallMetadata;
  } catch {
    throw new Error('.docpath/.install-meta.json 无法解析，请重新运行 docpath install');
  }
}

async function countLocalAssetDrift(
  targetDir: string,
  installedAssets: InstallAssetManifestEntry[],
): Promise<{ missingLocal: InstallAssetManifestEntry[]; modifiedLocal: InstallAssetManifestEntry[] }> {
  const missingLocal: InstallAssetManifestEntry[] = [];
  const modifiedLocal: InstallAssetManifestEntry[] = [];

  for (const asset of installedAssets) {
    const localPath = join(targetDir, asset.path);
    if (!(await exists(localPath))) {
      if (!isLocallyCustomizableInstallAsset(asset)) missingLocal.push(asset);
      continue;
    }
    const content = await readFile(localPath, 'utf-8');
    if (sha256(content) !== asset.sha256 && !isLocallyCustomizableInstallAsset(asset)) modifiedLocal.push(asset);
  }

  return { missingLocal, modifiedLocal };
}

export async function detectInstallAssetDrift(
  targetDir: string,
  meta: InstallMetadata,
  fallback: { target: Target; projectName: string },
): Promise<InstallAssetDriftReport> {
  const target = meta.target === undefined ? fallback.target : meta.target;
  if (!isInstallTarget(target)) {
    throw new Error(`安装资产 manifest target 非法: ${target}`);
  }
  if (!Array.isArray(meta.assets) || meta.assets.length === 0) {
    throw new Error('安装资产 manifest 缺失，请重新运行 docpath install');
  }

  const projectName = meta.projectName || fallback.projectName;
  const expectedAssets = await buildExpectedInstallAssets({ target, projectName });
  const installedByKey = new Map(meta.assets.map((asset) => [assetKey(asset), asset]));
  const templateDrift = expectedAssets.filter((expected) => {
    if (isLocallyCustomizableInstallAsset(expected)) return false;
    const installed = installedByKey.get(assetKey(expected));
    return !installed || installed.sha256 !== expected.sha256;
  });
  const { missingLocal, modifiedLocal } = await countLocalAssetDrift(targetDir, meta.assets);

  return {
    target,
    projectName,
    assetCount: meta.assets.length,
    templateDrift,
    missingLocal,
    modifiedLocal,
    hasDrift: templateDrift.length > 0 || missingLocal.length > 0 || modifiedLocal.length > 0,
  };
}

function sampleAssetPaths(assets: InstallAssetManifestEntry[], limit = 3): string {
  return assets.slice(0, limit).map((asset) => asset.path).join(', ');
}

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

export interface DoctorIssue {
  severity: 'error' | 'warn';
  id: string;
  message: string;
  suggestion: string;
}

export interface InstallDoctorReport {
  passed: boolean;
  target: Target;
  adapters: Array<'codex' | 'claude' | 'opencode'>;
  current_agent: string | null;
  errors: number;
  warnings: number;
  issues: DoctorIssue[];
  recommended_command: string | null;
}

function adaptersForTarget(target: Target): Array<'codex' | 'claude' | 'opencode'> {
  if (target === 'universal') return ['codex', 'claude', 'opencode'];
  return [target];
}

async function checkShimExecutable(context: InstallContext): Promise<DoctorIssue[]> {
  const shimPath = join(context.targetDir, '.docpath', 'bin', 'docpath');
  if (!(await exists(shimPath))) {
    return [{
      severity: 'warn',
      id: 'shim-missing',
      message: '缺少本地 DocPath CLI shim: .docpath/bin/docpath',
      suggestion: `运行 docpath install --target ${context.target}`,
    }];
  }
  const mode = (await stat(shimPath)).mode;
  if ((mode & 0o111) === 0) {
    return [{
      severity: 'error',
      id: 'shim-not-executable',
      message: '本地 DocPath CLI shim 不可执行: .docpath/bin/docpath',
      suggestion: `运行 docpath install --target ${context.target} --force`,
    }];
  }
  return [];
}

async function checkCodexConfigRisk(context: InstallContext): Promise<DoctorIssue[]> {
  if (context.target !== 'codex' && context.target !== 'universal') return [];
  const configPath = join(context.targetDir, '.codex', 'config.toml');
  if (!(await exists(configPath))) {
    return [{
      severity: 'error',
      id: 'codex-config-missing',
      message: '缺少 Codex 项目配置: .codex/config.toml',
      suggestion: `运行 docpath install --target ${context.target}`,
    }];
  }
  const content = await readFile(configPath, 'utf-8');
  const issues: DoctorIssue[] = [];
  if (/^\s*\[docpath\]/m.test(content) || /^\s*\[docpath\.commands\]/m.test(content)) {
    issues.push({
      severity: 'error',
      id: 'codex-unknown-docpath-table',
      message: '.codex/config.toml 包含 Codex 严格配置可能拒绝的 [docpath] 自定义表',
      suggestion: `运行 docpath install --target ${context.target} --force 生成仅包含官方键的配置`,
    });
  }
  if (!/project_doc_fallback_filenames\s*=\s*\[[^\]]*"CODEX\.md"/.test(content)) {
    issues.push({
      severity: 'warn',
      id: 'codex-fallback-missing',
      message: '.codex/config.toml 未声明 CODEX.md 作为项目说明 fallback',
      suggestion: `运行 docpath install --target ${context.target} --force`,
    });
  }
  return issues;
}

function parseSkillFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const parsed = parseYaml(match[1]);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

async function checkCodexSkillFrontmatter(context: InstallContext): Promise<DoctorIssue[]> {
  if (context.target !== 'codex' && context.target !== 'universal') return [];
  const skillsDir = join(context.targetDir, '.codex', 'skills');
  if (!(await exists(skillsDir))) {
    return [{
      severity: 'error',
      id: 'codex-skills-missing',
      message: '缺少 Codex Skill 目录: .codex/skills',
      suggestion: `运行 docpath install --target ${context.target}`,
    }];
  }

  const issues: DoctorIssue[] = [];
  for (const skillName of await listCodexSkillNames()) {
    const skillPath = join(skillsDir, skillName, 'SKILL.md');
    if (!(await exists(skillPath))) {
      issues.push({
        severity: 'error',
        id: 'codex-skill-missing',
        message: `缺少 Codex Skill: .codex/skills/${skillName}/SKILL.md`,
        suggestion: `运行 docpath install --target ${context.target}`,
      });
      continue;
    }

    const frontmatter = parseSkillFrontmatter(await readFile(skillPath, 'utf-8'));
    const actualName = typeof frontmatter?.name === 'string' ? frontmatter.name.trim() : '';
    if (!actualName) {
      issues.push({
        severity: 'error',
        id: 'codex-skill-frontmatter-name-missing',
        message: `.codex/skills/${skillName}/SKILL.md 缺少 frontmatter name`,
        suggestion: `运行 docpath install --target ${context.target} --force`,
      });
    } else if (actualName !== skillName) {
      issues.push({
        severity: 'error',
        id: 'codex-skill-frontmatter-name-mismatch',
        message: `.codex/skills/${skillName}/SKILL.md frontmatter name 为 ${actualName}，应为 ${skillName}`,
        suggestion: `运行 docpath install --target ${context.target} --force`,
      });
    }
  }
  return issues;
}

async function checkManifestDoctor(context: InstallContext): Promise<DoctorIssue[]> {
  try {
    const meta = await readInstallMetadata(context.docpathDir);
    if (!meta) {
      return [{
        severity: 'error',
        id: 'install-meta-missing',
        message: '缺少 .docpath/.install-meta.json，无法校验安装资产 manifest',
        suggestion: `运行 docpath install --target ${context.target}`,
      }];
    }
    if (!Array.isArray(meta.assets) || meta.assets.length === 0) {
      return [{
        severity: 'error',
        id: 'install-manifest-empty',
        message: '安装资产 manifest 为空',
        suggestion: `运行 docpath install --target ${context.target}`,
      }];
    }
    const report = await detectInstallAssetDrift(context.targetDir, meta, {
      target: context.target,
      projectName: context.projectName,
    });
    if (!report.hasDrift) return [];
    return [{
      severity: 'error',
      id: 'install-manifest-drift',
      message: `安装资产 manifest 漂移: 模板 ${report.templateDrift.length} 项, 缺失 ${report.missingLocal.length} 项, 本地改动 ${report.modifiedLocal.length} 项`,
      suggestion: `运行 docpath install --target ${report.target}`,
    }];
  } catch (err) {
    return [{
      severity: 'error',
      id: 'install-manifest-invalid',
      message: err instanceof Error ? err.message : String(err),
      suggestion: `运行 docpath install --target ${context.target}`,
    }];
  }
}

function buildDoctorReport(context: InstallContext, issues: DoctorIssue[]): InstallDoctorReport {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warn').length;
  return {
    passed: errors === 0,
    target: context.target,
    adapters: adaptersForTarget(context.target),
    current_agent: process.env.DOCPATH_AGENT || null,
    errors,
    warnings,
    issues,
    recommended_command: issues[0]?.suggestion.replace(/^运行\s+/, '') || null,
  };
}

async function buildInstallDoctorReportFromContext(context: InstallContext): Promise<InstallDoctorReport> {
  const issues = [
    ...await checkManifestDoctor(context),
    ...await checkShimExecutable(context),
    ...await checkCodexConfigRisk(context),
    ...await checkCodexSkillFrontmatter(context),
  ];
  return buildDoctorReport(context, issues);
}

export async function buildInstallDoctorReport(options: InstallOptions = {}): Promise<InstallDoctorReport> {
  return buildInstallDoctorReportFromContext(await createInstallContext(options));
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

async function createInstallContext(options: InstallOptions): Promise<InstallContext> {
  const cwd = options.cwd || process.cwd();
  const target = normalizeTarget(options.target);
  const force = !!options.force;
  const targetDir = cwd;
  const docpathDir = join(targetDir, '.docpath');
  const projectName = basename(targetDir);
  const hooks = !!options.hooks;
  const hookMode = normalizeHookMode(options.hookMode);

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

  return { cwd, target, force, targetDir, docpathDir, projectName, projectInfo, hooks, hookMode };
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
  const { target, docpathDir, projectName, projectInfo } = context;
  // ─── 4. 写入安装元数据 ───
  const metaPath = join(docpathDir, '.install-meta.json');
  const docpathVersion = await getDocpathPackageVersion();
  const assets = await buildExpectedInstallAssets({ target, projectName });
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
