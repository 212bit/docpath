import { execFileSync } from 'node:child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { readStdin } from '../utils/stdin.js';
import { readReviewEvidence, writeReviewEvidence } from '../utils/workspace-evidence.js';
import {
  buildReviewSkillRequirements,
  createReviewSkillEvidence,
  findRequirement,
  type ReviewScope,
  type ReviewSkillFinding,
  type ReviewSkillStatus,
} from '../utils/review-skill-router.js';

interface WriteReviewSkillOptions {
  cwd: string;
  skill?: string;
  language?: string;
  scope?: string;
  status?: string;
  files?: string;
  findingsJson?: string;
  summary?: string;
  content?: string;
  stdin?: boolean;
}

interface WriteReviewSkillPayload {
  status?: string;
  files?: string[];
  findings?: ReviewSkillFinding[];
  summary?: string;
}

function normalizeScope(scope: string): ReviewScope {
  if (scope === 'all' || scope === 'staged' || scope === 'last_commit') return scope;
  throw new Error(`write-review-skill --scope: 参数非法: ${scope}（允许: all|staged|last_commit）`);
}

function normalizeStatus(status: string): ReviewSkillStatus {
  if (status === 'pass' || status === 'fail') return status;
  throw new Error('write-review-skill status must be pass or fail');
}

function parseNameList(output: string): string[] {
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function parsePorcelainPaths(output: string): string[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) || rawPath : rawPath;
    });
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000 });
}

function collectChangedFiles(cwd: string, scope: ReviewScope): string[] {
  try {
    const files = scope === 'staged'
      ? parseNameList(runGit(cwd, ['diff', '--name-only', '--cached']))
      : scope === 'last_commit'
        ? parseNameList(runGit(cwd, ['show', '--name-only', '--format=""', 'HEAD']))
        : parsePorcelainPaths(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
    return [...new Set(files)].filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(file));
  } catch {
    return [];
  }
}

function parseJsonPayload(raw: string): WriteReviewSkillPayload {
  try {
    return JSON.parse(raw) as WriteReviewSkillPayload;
  } catch {
    throw new Error('write-review-skill payload must be valid JSON');
  }
}

async function readPayload(options: WriteReviewSkillOptions): Promise<WriteReviewSkillPayload> {
  if (options.content) return parseJsonPayload(options.content);
  if (options.stdin) {
    const raw = (await readStdin()).trim();
    if (!raw) throw new Error('未提供 review skill evidence JSON。用法: echo ... | docpath write-review-skill --stdin');
    return parseJsonPayload(raw);
  }
  return {
    status: options.status,
    files: options.files ? options.files.split(',').map((file) => file.trim()).filter(Boolean) : undefined,
    findings: options.findingsJson ? parseJsonPayload(options.findingsJson).findings : undefined,
    summary: options.summary,
  };
}

function validateFindings(findings: unknown): ReviewSkillFinding[] {
  if (findings === undefined) return [];
  if (!Array.isArray(findings)) throw new Error('findings must be an array');
  for (const finding of findings) {
    if (!finding || typeof finding !== 'object') throw new Error('each finding must be an object');
    const item = finding as Partial<ReviewSkillFinding>;
    if (typeof item.file !== 'string' || typeof item.message !== 'string') throw new Error('each finding requires file and message');
    if (item.severity !== 'info' && item.severity !== 'warn' && item.severity !== 'error') {
      throw new Error('finding severity must be info, warn, or error');
    }
  }
  return findings as ReviewSkillFinding[];
}

function sameFileSet(actual: string[], expected: string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((file, index) => file === right[index]);
}

export async function writeReviewSkillCommand(options: WriteReviewSkillOptions): Promise<void> {
  const cwd = options.cwd;
  const docpathDir = await resolveDocpathDir(cwd);
  const skill = options.skill?.trim();
  const language = options.language?.trim();
  if (!skill) throw new Error('write-review-skill requires --skill');
  if (!language) throw new Error('write-review-skill requires --language');
  const scope = normalizeScope(options.scope || 'all');
  const payload = await readPayload(options);
  const status = normalizeStatus(payload.status || options.status || '');
  const files = payload.files || [];
  if (files.length === 0) throw new Error('write-review-skill requires files[] evidence');
  const findings = validateFindings(payload.findings);
  if (status === 'pass' && findings.some((finding) => finding.severity === 'error')) {
    throw new Error('pass skill review evidence cannot contain severity:error findings');
  }

  const changedFiles = collectChangedFiles(cwd, scope);
  const { enabled, requirements } = await buildReviewSkillRequirements(cwd, docpathDir, changedFiles, scope);
  if (!enabled) throw new Error('review skill gate is disabled for this workspace');
  const requirement = findRequirement(requirements, skill, language);
  if (!requirement) throw new Error(`no current Review Skill Router requirement for ${skill}/${language}`);
  if (requirement.skill_missing) throw new Error(`missing skill source: ${requirement.skill_source_path}`);
  if (!sameFileSet(files, requirement.files)) throw new Error('skill review files must exactly match current router requirement');

  const previous = await readReviewEvidence(docpathDir);
  const evidence = createReviewSkillEvidence({
    requirement,
    scope,
    status,
    findings,
    summary: payload.summary || options.summary,
  });
  const skillReviews = [
    ...(previous?.skill_reviews || []).filter((item) => item.skill !== evidence.skill),
    evidence,
  ].sort((a, b) => a.skill.localeCompare(b.skill));

  await writeReviewEvidence(docpathDir, {
    schema_version: 1,
    kind: 'review',
    timestamp: new Date().toISOString(),
    scope: previous?.scope || scope,
    finding_scope: previous?.finding_scope || 'mixed',
    finding_scope_counts: previous?.finding_scope_counts,
    files: previous?.files || [],
    findings: previous?.findings || [],
    errors: previous?.errors || 0,
    warnings: previous?.warnings || 0,
    infos: previous?.infos || 0,
    approved: previous?.approved || false,
    manual: previous?.manual,
    skill_reviews: skillReviews,
    skill_review_skips: previous?.skill_review_skips || [],
    skill_review_gate: previous?.skill_review_gate,
  });

  console.log(`✅  review skill evidence written: ${skill} (${status})`);
  console.log(`    scope: ${scope}`);
  console.log(`    files: ${requirement.files.length}`);
  console.log(`    diff_fingerprint: ${requirement.diff_fingerprint}`);
}
