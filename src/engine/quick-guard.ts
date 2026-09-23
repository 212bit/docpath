import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minimatch } from 'minimatch';
import { parse as parseYaml } from 'yaml';

export interface QuickScopeVerdict {
  allowed: boolean;
  changedFiles: string[];
  /** 变更中未被 allow_patterns 豁免的守卫文件（R-338: 风险复评输入应使用本字段） */
  guardedFiles: string[];
  ignoredDocpathFiles: string[];
  reasons: string[];
  policy: QuickScopePolicy;
}

const MAX_QUICK_CHANGED_FILES = 3;

export interface QuickScopePolicy {
  maxChangedFiles: number;
  allowDocumentOnly: boolean;
  allowPatterns: string[];
}

const DEFAULT_QUICK_SCOPE_POLICY: QuickScopePolicy = {
  maxChangedFiles: MAX_QUICK_CHANGED_FILES,
  allowDocumentOnly: true,
  allowPatterns: [],
};

const RISKY_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.github\//, reason: 'CI/CD configuration changed' },
  { pattern: /^package(?:-lock)?\.json$/, reason: 'package contract changed' },
  { pattern: /^pnpm-lock\.yaml$/, reason: 'dependency lockfile changed' },
  { pattern: /^src\/engine\//, reason: 'core workflow engine changed' },
  { pattern: /^src\/commands\/(agent|check|done|go|journal|review|runtime|register)\b/, reason: 'core lifecycle command changed' },
  { pattern: /^src\/utils\/(agent-output|major-change|task-files|ui-gate|workspace)\.ts$/, reason: 'core workflow utility changed' },
  { pattern: /^templates\/(protocols\/|AGENTS|CLAUDE|OPENCODE|SKILL)/, reason: 'agent protocol template changed' },
  { pattern: /^\.docpath\/rules\//, reason: 'global DocPath rule changed' },
];

function readChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git status --porcelain --untracked-files=all', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 3)
      // porcelain=v1 行格式为固定 `XY <path>`（两位状态码 + 1 空格），slice(3) 取路径。
      // 注意：不能先 trim 行首——` M src/...`（已跟踪修改，前导空格）trim 后变 `M src/...`，
      // slice(3) 会把 `src/` 错切成 `rc/`，导致核心路径（RISKY_PATH_PATTERNS）匹配失效、
      // check 风险复评漏判核心改动进 quick 快车道。
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ''));
  } catch {
    return [];
  }
}

function isDocpathOwnedRuntimeOrEvidence(file: string): boolean {
  return /^\.docpath\/(tasks|workspace|backlog)\//.test(file)
    || file === '.docpath/.install-meta.json'
    || file === '.docpath/docs-index.json'
    || file === '.docpath/workspace.json';
}

function isDocumentOnlyFile(file: string): boolean {
  return file.endsWith('.md') ||
    file.startsWith('docs/') ||
    file.startsWith('doc/') ||
    file.startsWith('notes/') ||
    file === 'README.md' ||
    file === 'CHANGELOG.md';
}

function readQuickScopePolicy(cwd: string): QuickScopePolicy {
  try {
    const parsed = parseYaml(readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8')) as {
      quick?: {
        max_changed_files?: unknown;
        allow_document_only?: unknown;
        allow_patterns?: unknown;
      };
    } | null;
    const quick = parsed?.quick || {};
    const maxChangedFiles = typeof quick.max_changed_files === 'number' && Number.isFinite(quick.max_changed_files)
      ? Math.max(0, Math.floor(quick.max_changed_files))
      : DEFAULT_QUICK_SCOPE_POLICY.maxChangedFiles;
    const allowDocumentOnly = typeof quick.allow_document_only === 'boolean'
      ? quick.allow_document_only
      : DEFAULT_QUICK_SCOPE_POLICY.allowDocumentOnly;
    const allowPatterns = Array.isArray(quick.allow_patterns)
      ? quick.allow_patterns.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : DEFAULT_QUICK_SCOPE_POLICY.allowPatterns;
    return { maxChangedFiles, allowDocumentOnly, allowPatterns };
  } catch {
    return DEFAULT_QUICK_SCOPE_POLICY;
  }
}

function isAllowedByPolicy(file: string, policy: QuickScopePolicy): boolean {
  return policy.allowPatterns.some((pattern) => minimatch(file, pattern, { dot: true }));
}

export function evaluateQuickScope(cwd: string): QuickScopeVerdict {
  const policy = readQuickScopePolicy(cwd);
  const rawChangedFiles = readChangedFiles(cwd);
  const ignoredDocpathFiles = rawChangedFiles.filter(isDocpathOwnedRuntimeOrEvidence);
  const changedFiles = rawChangedFiles.filter((file) => !isDocpathOwnedRuntimeOrEvidence(file));
  const guardedFiles = changedFiles.filter((file) => !isAllowedByPolicy(file, policy));
  const reasons: string[] = [];
  const documentOnly = guardedFiles.length > 0 && guardedFiles.every(isDocumentOnlyFile);

  if (!(policy.allowDocumentOnly && documentOnly) && guardedFiles.length > policy.maxChangedFiles) {
    reasons.push(`changed ${guardedFiles.length} guarded non-DocPath files (quick limit: ${policy.maxChangedFiles})`);
  }

  for (const file of guardedFiles) {
    const risky = RISKY_PATH_PATTERNS.find((item) => item.pattern.test(file));
    if (risky) reasons.push(`${file}: ${risky.reason}`);
  }

  return {
    allowed: reasons.length === 0,
    changedFiles,
    guardedFiles,
    ignoredDocpathFiles,
    reasons,
    policy,
  };
}

export function assertQuickScope(cwd: string): void {
  const verdict = evaluateQuickScope(cwd);
  if (verdict.allowed) return;
  throw new Error([
    'docpath quick: scope exceeds quick profile boundaries',
    `Policy: max_changed_files=${verdict.policy.maxChangedFiles}, allow_document_only=${verdict.policy.allowDocumentOnly}, allow_patterns=${verdict.policy.allowPatterns.length}`,
    ...verdict.reasons.map((reason) => `  - ${reason}`),
    'Upgrade path:',
    '  - Stop using quick for this change.',
    '  - Capture/promote a standard backlog task with spec and plan.',
    '  - Then rerun check/review/done through the standard lifecycle.',
  ].join('\n'));
}
