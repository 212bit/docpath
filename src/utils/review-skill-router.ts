import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readDocPathConfig } from './config.js';

export type ReviewScope = 'all' | 'staged' | 'last_commit' | 'task';
export type ReviewSkillGateStatus = 'disabled' | 'not_required' | 'required' | 'pass' | 'fail' | 'pass_with_skips';
export type ReviewSkillStatus = 'pass' | 'fail';

export interface ReviewSkillRequirement {
  skill: string;
  language: 'typescript' | 'javascript';
  role: 'language';
  frameworks: string[];
  files: string[];
  diff_fingerprint: string;
  skill_source_path: string;
  write_command: string;
  skill_missing: boolean;
}

export interface ReviewSkillFinding {
  file: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  line?: number;
}

export interface ReviewSkillEvidence {
  skill: string;
  language: string;
  role: 'language';
  frameworks: string[];
  scope: ReviewScope | string;
  files: string[];
  diff_fingerprint: string;
  status: ReviewSkillStatus;
  findings: ReviewSkillFinding[];
  summary?: string;
  generated_at: string;
}

export interface ReviewSkillSkip {
  skill: string;
  reason: string;
  scope: ReviewScope | string;
  files: string[];
  diff_fingerprint: string;
  generated_at: string;
}

export interface ReviewSkillGate {
  status: ReviewSkillGateStatus;
  scope: ReviewScope;
  requirements: ReviewSkillRequirement[];
  missing_evidence: string[];
  invalid_evidence: Array<{ skill: string; reason: string }>;
  evidence_warnings?: Array<{ skill: string; reason: string; fix_command: string }>;
  skips: ReviewSkillSkip[];
}

const LANGUAGE_RULES: Array<{
  language: 'typescript' | 'javascript';
  skill: string;
  extensions: RegExp;
  sourceDir: string;
}> = [
  { language: 'typescript', skill: 'docpath-review-typescript', extensions: /\.(ts|tsx)$/i, sourceDir: 'typescript' },
  { language: 'javascript', skill: 'docpath-review-javascript', extensions: /\.(js|jsx|mjs|cjs)$/i, sourceDir: 'javascript' },
];

const EXCLUDED_SOURCE_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)(dist|build|coverage|\.turbo|\.next|out)\//,
  /(^|\/)(vendor|fixtures|__snapshots__)\//,
  /(^|\/).*\.min\.(js|mjs|cjs)$/i,
  /(^|\/).*\.d\.ts$/i,
  /(^|\/).*generated.*\.(ts|tsx|js|jsx|mjs|cjs)$/i,
];

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000 });
}

/**
 * R-276: task 口径的时间锚点。state.started_at 是 phase 开始时间 (每次 phase 转移被
 * transitions 刷新), 直接用它做任务累计 diff 锚会在 check/review 失败等转移后静默
 * 缩小覆盖面。真任务起点取 canonical 任务目录 breadcrumb 首条时间戳 (append-only,
 * 任务作用域); 缺失时回退 fallback (state.started_at)。
 */
export function resolveTaskStartedAt(docpathDir: string, taskId?: string, fallback?: string): string | undefined {
  if (taskId?.trim()) {
    try {
      const raw = readFileSync(join(docpathDir, 'tasks', taskId, 'breadcrumb.jsonl'), 'utf-8');
      const first = raw.split('\n').find((line) => line.trim());
      const ts = first ? (JSON.parse(first) as { timestamp?: unknown }).timestamp : undefined;
      if (typeof ts === 'string' && ts.trim()) return ts;
    } catch {
      // 无 canonical breadcrumb (quick 任务/手工工作区) → 回退 state.started_at。
    }
  }
  return fallback?.trim() ? fallback : undefined;
}

/**
 * R-276: task 口径的 diff 基线 = 任务 started_at 以来首个提交的父提交。
 * 无 started_at / 任务内无提交 / 首提交无父 (root) 时分别回退 null / null / 首提交自身。
 */
export function resolveTaskBaseRef(cwd: string, startedAt?: string): string | null {
  if (!startedAt?.trim()) return null;
  try {
    const commits = runGit(cwd, ['rev-list', '--reverse', `--since=${startedAt}`, 'HEAD'])
      .split('\n').map((line) => line.trim()).filter(Boolean);
    const first = commits[0];
    if (!first) return null;
    try {
      runGit(cwd, ['rev-parse', '--verify', `${first}^`]);
      return `${first}^`;
    } catch {
      return first;
    }
  } catch {
    return null;
  }
}

export function isReviewSkillGateSourceFile(file: string): boolean {
  if (EXCLUDED_SOURCE_PATHS.some((pattern) => pattern.test(file))) return false;
  return LANGUAGE_RULES.some((rule) => rule.extensions.test(file));
}

function languageForFile(file: string): (typeof LANGUAGE_RULES)[number] | null {
  if (!isReviewSkillGateSourceFile(file)) return null;
  return LANGUAGE_RULES.find((rule) => rule.extensions.test(file)) || null;
}

function diffForFile(cwd: string, file: string, scope: ReviewScope, taskBaseRef?: string | null): string {
  try {
    if (scope === 'staged') return runGit(cwd, ['diff', '--cached', '--', file]);
    if (scope === 'last_commit') return runGit(cwd, ['diff', 'HEAD~1..HEAD', '--', file]);
    if (scope === 'task') {
      // R-276: 与 review.ts 同口径——任务基线..HEAD + 工作区, 不再用全历史 patch。
      const parts = [
        taskBaseRef ? runGit(cwd, ['diff', `${taskBaseRef}..HEAD`, '--', file]) : '',
        runGit(cwd, ['diff', '--', file]),
        runGit(cwd, ['diff', '--cached', '--', file]),
      ].join('\n');
      if (parts.trim()) return parts;
    }
    const unstaged = runGit(cwd, ['diff', '--', file]);
    const staged = runGit(cwd, ['diff', '--cached', '--', file]);
    if (unstaged.trim() || staged.trim()) return `${unstaged}\n${staged}`;
  } catch {
    // Fall through to content hashing for untracked files or non-git workspaces.
  }
  try {
    return readFileSync(join(cwd, file), 'utf-8');
  } catch {
    return '';
  }
}

function fingerprintForFiles(cwd: string, scope: ReviewScope, files: string[], taskBaseRef?: string | null): string {
  const hash = createHash('sha256');
  hash.update(`scope:${scope}\n`);
  for (const file of [...files].sort()) {
    hash.update(`file:${file}\n`);
    hash.update(diffForFile(cwd, file, scope, taskBaseRef));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function isReviewSkillGateEnabled(cwd: string): Promise<boolean> {
  const config = await readDocPathConfig(cwd);
  return config.review_skill_gate?.enabled !== false;
}

export async function buildReviewSkillRequirements(
  cwd: string,
  docpathDir: string,
  changedFiles: string[],
  scope: ReviewScope,
  opts?: { taskBaseRef?: string | null },
): Promise<{ enabled: boolean; requirements: ReviewSkillRequirement[] }> {
  const enabled = await isReviewSkillGateEnabled(cwd);
  if (!enabled) return { enabled, requirements: [] };

  const bySkill = new Map<string, { rule: (typeof LANGUAGE_RULES)[number]; files: string[] }>();
  for (const file of changedFiles) {
    const rule = languageForFile(file);
    if (!rule) continue;
    const current = bySkill.get(rule.skill) || { rule, files: [] };
    current.files.push(file);
    bySkill.set(rule.skill, current);
  }

  const requirements = [...bySkill.values()]
    .map(({ rule, files }) => {
      const sortedFiles = [...new Set(files)].sort();
      const skillSourcePath = join(docpathDir, 'review-skills', rule.sourceDir, 'SKILL.md');
      return {
        skill: rule.skill,
        language: rule.language,
        role: 'language' as const,
        frameworks: [],
        files: sortedFiles,
        diff_fingerprint: fingerprintForFiles(cwd, scope, sortedFiles, opts?.taskBaseRef),
        skill_source_path: `.docpath/review-skills/${rule.sourceDir}/SKILL.md`,
        write_command: `docpath write-review-skill --skill ${rule.skill} --language ${rule.language} --scope ${scope} --stdin`,
        skill_missing: !existsSync(skillSourcePath),
      };
    })
    .sort((a, b) => a.skill.localeCompare(b.skill));

  return { enabled, requirements };
}

function sameFileSet(actual: string[], expected: string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((file, index) => file === right[index]);
}

function validateEvidenceForRequirement(
  evidence: ReviewSkillEvidence | undefined,
  requirement: ReviewSkillRequirement,
  scope: ReviewScope,
): string | null {
  if (!evidence) return 'missing skill review evidence';
  if (evidence.skill !== requirement.skill) return 'skill mismatch';
  if (evidence.language !== requirement.language) return 'language mismatch';
  if (evidence.role !== requirement.role) return 'role mismatch';
  if (evidence.scope !== scope) return 'scope mismatch';
  if (!sameFileSet(evidence.files, requirement.files)) return 'file set mismatch';
  if (evidence.diff_fingerprint !== requirement.diff_fingerprint) return 'diff fingerprint mismatch';
  if (evidence.status !== 'pass' && evidence.status !== 'fail') return 'status must be pass or fail';
  if (evidence.status === 'pass' && evidence.findings.some((finding) => finding.severity === 'error')) {
    return 'pass evidence contains error findings';
  }
  if (evidence.status === 'fail') return 'skill review status is fail';
  return null;
}

export function evaluateReviewSkillGate(input: {
  enabled: boolean;
  requirements: ReviewSkillRequirement[];
  skillReviews?: ReviewSkillEvidence[];
  skillSkips?: ReviewSkillSkip[];
  scope: ReviewScope;
}): ReviewSkillGate {
  if (!input.enabled) {
    return { status: 'disabled', scope: input.scope, requirements: [], missing_evidence: [], invalid_evidence: [], evidence_warnings: [], skips: [] };
  }
  if (input.requirements.length === 0) {
    return { status: 'not_required', scope: input.scope, requirements: [], missing_evidence: [], invalid_evidence: [], evidence_warnings: [], skips: [] };
  }

  const reviews = input.skillReviews || [];
  const skips = input.skillSkips || [];
  const missingEvidence: string[] = [];
  const invalidEvidence: Array<{ skill: string; reason: string }> = [];
  const evidenceWarnings: Array<{ skill: string; reason: string; fix_command: string }> = [];
  const acceptedSkips: ReviewSkillSkip[] = [];

  for (const requirement of input.requirements) {
    if (requirement.skill_missing) {
      invalidEvidence.push({ skill: requirement.skill, reason: `missing skill source: ${requirement.skill_source_path}` });
      continue;
    }

    const skip = skips.find((candidate) =>
      candidate.skill === requirement.skill
      && candidate.reason.trim().length > 0
      && candidate.scope === input.scope
      && candidate.diff_fingerprint === requirement.diff_fingerprint
      && sameFileSet(candidate.files, requirement.files)
    );
    if (skip) {
      acceptedSkips.push(skip);
      continue;
    }

    const evidence = reviews.find((candidate) => candidate.skill === requirement.skill);
    const invalidReason = validateEvidenceForRequirement(evidence, requirement, input.scope);
    if (!evidence) missingEvidence.push(requirement.skill);
    else if (invalidReason === 'file set mismatch') {
      evidenceWarnings.push({
        skill: requirement.skill,
        reason: invalidReason,
        fix_command: requirement.write_command,
      });
    } else if (invalidReason) invalidEvidence.push({ skill: requirement.skill, reason: invalidReason });
  }

  const failed = missingEvidence.length > 0 || invalidEvidence.length > 0;
  return {
    status: failed ? 'fail' : acceptedSkips.length > 0 ? 'pass_with_skips' : 'pass',
    scope: input.scope,
    requirements: input.requirements,
    missing_evidence: missingEvidence,
    invalid_evidence: invalidEvidence,
    evidence_warnings: evidenceWarnings,
    skips: acceptedSkips,
  };
}

export function createReviewSkillSkip(
  requirement: ReviewSkillRequirement,
  scope: ReviewScope,
  reason: string,
): ReviewSkillSkip {
  return {
    skill: requirement.skill,
    reason,
    scope,
    files: requirement.files,
    diff_fingerprint: requirement.diff_fingerprint,
    generated_at: new Date().toISOString(),
  };
}

export function createReviewSkillEvidence(input: {
  requirement: ReviewSkillRequirement;
  scope: ReviewScope;
  status: ReviewSkillStatus;
  findings?: ReviewSkillFinding[];
  summary?: string;
}): ReviewSkillEvidence {
  return {
    skill: input.requirement.skill,
    language: input.requirement.language,
    role: input.requirement.role,
    frameworks: input.requirement.frameworks,
    scope: input.scope,
    files: input.requirement.files,
    diff_fingerprint: input.requirement.diff_fingerprint,
    status: input.status,
    findings: input.findings || [],
    ...(input.summary ? { summary: input.summary } : {}),
    generated_at: new Date().toISOString(),
  };
}

export function findRequirement(
  requirements: ReviewSkillRequirement[],
  skill: string,
  language?: string,
): ReviewSkillRequirement | null {
  return requirements.find((requirement) =>
    requirement.skill === skill && (!language || requirement.language === language)
  ) || null;
}
