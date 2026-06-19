/**
 * 安装健康与资产校验核心层。
 *
 * 从 commands/install.ts 下沉，使 utils→commands 反向依赖（agent-output → install）
 * 转为 utils→utils。包含：安装类型、目标规范化、安装上下文、期望资产生成、资产漂移
 * 检测、install doctor 报告构建，以及被这些能力与 install 写入逻辑共享的模板/渲染工具。
 * commands/install.ts 仅保留安装执行与 CLI 命令入口。
 */

import { join, basename } from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { exists } from './file.js';
import { detectProject, type ProjectInfo } from './detect.js';

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

export interface InstallOptions {
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

export interface InstallContext {
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

// ─── 模板路径解析 ───

const TEMPLATES_ROOT = join(process.cwd(), 'templates');

function templatePath(...segments: string[]): string {
  return join(TEMPLATES_ROOT, ...segments);
}

export async function resolveTemplate(...segments: string[]): Promise<string> {
  const devPath = templatePath(...segments);
  if (await exists(devPath)) return devPath;

  // fallback: 包内
  const pkgPath = join(import.meta.dirname ?? join(process.cwd(), 'dist'), '..', 'templates', ...segments);
  if (await exists(pkgPath)) return pkgPath;

  throw new Error(`模板文件未找到: ${segments.join('/')}`);
}

// ─── 命令包装与哈希工具 ───

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function wrapClaudeCommandWithShim(content: string): string {
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

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function manifestEntry(path: string, source: string, content: string): InstallAssetManifestEntry {
  return { path, source, sha256: sha256(content) };
}

export async function listTemplateFiles(...segments: string[]): Promise<string[]> {
  const dir = await resolveTemplate(...segments);
  const files = await readdir(dir);
  return files.filter((file) => file.endsWith('.md') || file.endsWith('.txt')).sort();
}

export async function listCodexSkillNames(): Promise<string[]> {
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

export function renderCodexConfigContent(): string {
  return `# DocPath adapter for Codex CLI / Codex-style coding agents.
# Codex reads workflow instructions from AGENTS.md. CODEX.md remains an
# instruction fallback for environments that do not use AGENTS.md directly.

project_doc_fallback_filenames = ["CODEX.md"]
`;
}

export function renderOpenCodeConfigContent(): string {
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

// ─── 目标规范化 ───

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

// ─── 资产漂移检测 ───

function assetKey(asset: Pick<InstallAssetManifestEntry, 'path' | 'source'>): string {
  return `${asset.path}\0${asset.source}`;
}

function isLocallyCustomizableInstallAsset(asset: Pick<InstallAssetManifestEntry, 'path'>): boolean {
  return asset.path === 'AGENTS.md';
}

export async function readInstallMetadata(docpathDir: string): Promise<InstallMetadata | null> {
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

export function sampleAssetPaths(assets: InstallAssetManifestEntry[], limit = 3): string {
  return assets.slice(0, limit).map((asset) => asset.path).join(', ');
}

// ─── Install doctor ───

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

export async function buildInstallDoctorReportFromContext(context: InstallContext): Promise<InstallDoctorReport> {
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

// ─── 安装上下文 ───

export async function createInstallContext(options: InstallOptions): Promise<InstallContext> {
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

export type { HookMode };
