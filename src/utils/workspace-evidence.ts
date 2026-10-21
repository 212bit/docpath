import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readFileSafe, writeFileAtomic } from './file.js';
import type { ReviewSkillEvidence, ReviewSkillGate, ReviewSkillSkip } from './review-skill-router.js';
import { CHECK_CATEGORIES, CHECK_SEVERITIES, type CheckCategory, type CheckSeverity } from '../types/check.js';

export interface GitBaselineEvidence {
  ref: string;
  branch: string;
  worktree_dirty: boolean;
}

/** R-334: 窄 union —— 读侧校验器保证类型安全 */
export interface CheckEvidenceItem {
  name: string;
  passed: boolean;
  output: string;
  category?: CheckCategory;
  severity?: CheckSeverity;
  environment_failure?: boolean;
  /** R-350: 该环境失败是否确定性可证（可用于 check_env_exempt 豁免） */
  environment_exemptible?: boolean;
  /** R-347: 实际执行的外部命令 */
  command?: string;
}

/** R-334: 宽 string → 窄 union 校验器；返回 undefined 表示非合法值（兼容旧证据） */
export function parseCheckCategory(value: string | undefined): CheckCategory | undefined {
  if (value === undefined) return undefined;
  return (CHECK_CATEGORIES as readonly string[]).includes(value) ? (value as CheckCategory) : undefined;
}

/** R-334: severity 校验器 */
export function parseCheckSeverity(value: string | undefined): CheckSeverity | undefined {
  if (value === undefined) return undefined;
  return (CHECK_SEVERITIES as readonly string[]).includes(value) ? (value as CheckSeverity) : undefined;
}

export interface LastCheckEvidence {
  schema_version: 1;
  kind: 'last-check';
  task_id?: string;
  timestamp: string;
  /** R-276(补齐): 检查时的 git HEAD; 供 done 复用判定感知 check 后的新提交 (旧证据缺省, 向后兼容) */
  head?: string;
  passed: boolean;
  /** R-350: 本次 check 通过是否来自环境豁免（gate=check_env_exempt 而非 check_pass） */
  env_exempt?: boolean;
  check_count: number;
  /** R-331: 代码范围 digest（HEAD + scope status 联合哈希）；scope 缓存复用判定键 */
  code_scope_digest?: string;
  /** R-502: 计算 digest 时的工具链指纹（node 版本|platform|arch），用于诊断缓存失效原因 */
  toolchain?: string;
  /** 分门类代码与配置 digest（compile / test / lint 分解缓存，R-403） */
  category_digests?: {
    compile?: string;
    test?: string;
    lint?: string;
  };
  /** R-331: 重 runner 判定是否来自缓存复用（链式命中仍可信：digest 等值是唯一有效性判据） */
  cached?: boolean;
  git?: GitBaselineEvidence;
  checks: CheckEvidenceItem[];
}

export interface ReviewFindingEvidence {
  file: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  line?: number;
  finding_scope?: 'current_diff' | 'baseline_or_whole_file';
}

export interface ReviewFindingScopeCounts {
  current_diff: { errors: number; warnings: number; infos: number };
  baseline_or_whole_file: { errors: number; warnings: number; infos: number };
}

export interface ReviewEvidence {
  schema_version: 1;
  kind: 'review';
  task_id?: string;
  timestamp: string;
  /** R-276: 审查时的 git HEAD; 供 done 复用判定感知 review 后的新提交 (旧证据缺省, 向后兼容) */
  head?: string;
  scope?: string;
  finding_scope?: 'current_changes' | 'baseline' | 'mixed';
  finding_scope_counts?: ReviewFindingScopeCounts;
  files: string[];
  findings: ReviewFindingEvidence[];
  errors: number;
  warnings: number;
  infos: number;
  approved: boolean;
  manual?: boolean;
  skill_reviews?: ReviewSkillEvidence[];
  skill_review_skips?: ReviewSkillSkip[];
  skill_review_gate?: ReviewSkillGate;
}

function lastCheckJsonPath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'last-check.json');
}

function lastCheckMarkdownPath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'last-check.md');
}

function reviewJsonPath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'review.json');
}

function reviewMarkdownPath(docpathDir: string): string {
  return join(docpathDir, 'workspace', 'review.md');
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatCheckOutput(output: string): string[] {
  return output
    .split('\n')
    .slice(0, 10)
    .map((line) => `  ${line}`);
}

export function renderLastCheckMarkdown(evidence: LastCheckEvidence): string {
  const lines: string[] = ['# Last Check Evidence', ''];
  lines.push(`**时间**: ${evidence.timestamp}`);
  // R-350: 环境豁免的 PASS 必须自证来源，避免读侧把它当成普通 check_pass
  lines.push(`**结果**: ${evidence.passed ? (evidence.env_exempt ? '✅ PASS (环境豁免)' : '✅ PASS') : '❌ FAIL'}`);
  if (evidence.env_exempt) {
    lines.push('env_exempt: true');
  }
  lines.push(`**检查项**: ${evidence.check_count}`);
  if (evidence.task_id) {
    lines.push(`task_id: ${evidence.task_id}`);
  }
  if (evidence.git) {
    lines.push(`git_ref: ${evidence.git.ref}`);
    lines.push(`branch: ${evidence.git.branch}`);
    lines.push(`worktree_dirty: ${evidence.git.worktree_dirty}`);
  }
  lines.push('');
  for (const result of evidence.checks) {
    const icon = result.severity === 'warning' ? '⚠️' : result.passed ? '✅' : '❌';
    lines.push(`- ${icon} ${result.name}`);
    if (result.output) {
      lines.push(...formatCheckOutput(result.output));
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeLastCheckEvidence(docpathDir: string, evidence: LastCheckEvidence): Promise<void> {
  await writeFileAtomic(lastCheckJsonPath(docpathDir), JSON.stringify(evidence, null, 2));
  await writeFileAtomic(lastCheckMarkdownPath(docpathDir), renderLastCheckMarkdown(evidence));
}

export async function readLastCheckEvidence(docpathDir: string): Promise<LastCheckEvidence | null> {
  const fromJson = parseJson<LastCheckEvidence>(await readFileSafe(lastCheckJsonPath(docpathDir)));

  let currentTaskId: string | undefined;
  try {
    const statePath = join(docpathDir, 'workspace', 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      currentTaskId = state?.task_id;
    }
  } catch {
    // ignore
  }
  const expectedTaskId = currentTaskId || 'check';

  if (fromJson?.kind === 'last-check') {
    if (fromJson.task_id !== undefined && fromJson.task_id !== expectedTaskId) return null;
    return fromJson;
  }

  const markdown = await readFileSafe(lastCheckMarkdownPath(docpathDir));
  if (!markdown) return null;
  const taskId = markdown.match(/^task_id:\s*(.+)$/m)?.[1]?.trim();
  if (taskId !== undefined && taskId !== expectedTaskId) return null;

  const timestamp = markdown.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim() || '';
  const passed = /^\*\*结果\*\*:\s*✅\s*PASS(?:\s*\(环境豁免\))?\s*$/m.test(markdown);
  const envExempt = markdown.match(/^env_exempt:\s*(true|false)$/m)?.[1];
  const checkCount = Number.parseInt(markdown.match(/^\*\*检查项\*\*:\s*(\d+)$/m)?.[1] || '0', 10);
  const ref = markdown.match(/^(?:git_ref|ref|commit):\s*`?([a-f0-9]{7,40}|HEAD(?:~\d+)?|[\w./-]+)`?/im)?.[1];
  const branch = markdown.match(/^branch:\s*(.+)$/m)?.[1]?.trim();
  const dirty = markdown.match(/^worktree_dirty:\s*(true|false)$/m)?.[1];
  return {
    schema_version: 1,
    kind: 'last-check',
    task_id: taskId || 'check',
    timestamp,
    passed,
    ...(envExempt === 'true' ? { env_exempt: true } : {}),
    check_count: Number.isFinite(checkCount) ? checkCount : 0,
    ...(ref ? { git: { ref, branch: branch || 'HEAD', worktree_dirty: dirty === 'true' } } : {}),
    checks: [],
  };
}

export function renderReviewMarkdown(evidence: ReviewEvidence): string {
  const lines = [
    '# Code Review Report',
    '',
    `**时间**: ${evidence.timestamp}`,
    ...(evidence.task_id ? [`task_id: ${evidence.task_id}`] : []),
    ...(evidence.scope ? [`scope: ${evidence.scope}`] : []),
    ...(evidence.finding_scope ? [`finding_scope: ${evidence.finding_scope}`] : []),
    ...(evidence.finding_scope_counts ? [
      `current_diff: ${evidence.finding_scope_counts.current_diff.errors} errors, ${evidence.finding_scope_counts.current_diff.warnings} warnings, ${evidence.finding_scope_counts.current_diff.infos} infos`,
      `baseline_or_whole_file: ${evidence.finding_scope_counts.baseline_or_whole_file.errors} errors, ${evidence.finding_scope_counts.baseline_or_whole_file.warnings} warnings, ${evidence.finding_scope_counts.baseline_or_whole_file.infos} infos`,
    ] : []),
    `**状态**: ${evidence.approved ? '✅ PASS' : '❌ FAIL'}`,
    `**文件**: ${evidence.files.length}`,
    `${evidence.approved ? '✅' : '❌'} 代码审查: ${evidence.errors} 错误, ${evidence.warnings} 警告, ${evidence.infos} 提示`,
    ...(evidence.manual ? ['**状态**: ✅ 手动批准 (跳过自动检查)'] : []),
    ...(evidence.skill_review_gate ? [
      `review_skill_gate: ${evidence.skill_review_gate.status}`,
      `skill_reviews: ${evidence.skill_reviews?.length || 0}`,
      `skill_review_skips: ${evidence.skill_review_skips?.length || 0}`,
    ] : []),
    '',
  ];
  for (const finding of evidence.findings) {
    lines.push(`- [${finding.severity.toUpperCase()}] ${finding.file}: ${finding.message}${finding.finding_scope ? ` (${finding.finding_scope})` : ''}`);
  }
  return lines.join('\n');
}

export async function writeReviewEvidence(docpathDir: string, evidence: ReviewEvidence): Promise<void> {
  await writeFileAtomic(reviewJsonPath(docpathDir), JSON.stringify(evidence, null, 2));
  await writeFileAtomic(reviewMarkdownPath(docpathDir), renderReviewMarkdown(evidence));
}

export async function readReviewEvidence(docpathDir: string): Promise<ReviewEvidence | null> {
  const fromJson = parseJson<ReviewEvidence>(await readFileSafe(reviewJsonPath(docpathDir)));

  let currentTaskId: string | undefined;
  try {
    const statePath = join(docpathDir, 'workspace', 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      currentTaskId = state?.task_id;
    }
  } catch {
    // ignore
  }
  const expectedTaskId = currentTaskId || 'review';

  if (fromJson?.kind === 'review') {
    if (fromJson.task_id !== undefined && fromJson.task_id !== expectedTaskId) return null;
    return fromJson;
  }

  const markdown = await readFileSafe(reviewMarkdownPath(docpathDir));
  if (!markdown) return null;
  const taskId = markdown.match(/^task_id:\s*(.+)$/m)?.[1]?.trim();
  if (taskId !== undefined && taskId !== expectedTaskId) return null;

  const timestamp = markdown.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim() || '';
  const files = Number.parseInt(markdown.match(/^\*\*文件\*\*:\s*(\d+)$/m)?.[1] || '0', 10);
  const errorLines = [...markdown.matchAll(/^- \[ERROR\]/gm)].length;
  const warnLines = [...markdown.matchAll(/^- \[WARN\]/gm)].length;
  const infoLines = [...markdown.matchAll(/^- \[INFO\]/gm)].length;
  const approved = !(/❌|FAIL|request-changes|\[ERROR\]|[1-9]\d*\s*错误/i.test(markdown));
  return {
    schema_version: 1,
    kind: 'review',
    task_id: taskId || 'review',
    timestamp,
    scope: markdown.match(/^scope:\s*(.+)$/m)?.[1]?.trim(),
    finding_scope: markdown.match(/^finding_scope:\s*(current_changes|baseline|mixed)$/m)?.[1] as ReviewEvidence['finding_scope'] | undefined,
    files: Array.from({ length: Number.isFinite(files) ? files : 0 }, (_, index) => `file-${index + 1}`),
    findings: [],
    errors: errorLines,
    warnings: warnLines,
    infos: infoLines,
    approved,
    manual: /手动批准/.test(markdown),
  };
}

export async function readLastCheckMarkdown(docpathDir: string): Promise<string> {
  const fromJson = parseJson<LastCheckEvidence>(await readFileSafe(lastCheckJsonPath(docpathDir)));
  if (fromJson?.kind === 'last-check') return renderLastCheckMarkdown(fromJson);
  return await readFileSafe(lastCheckMarkdownPath(docpathDir)) || '';
}

export async function readReviewMarkdown(docpathDir: string): Promise<string> {
  const fromJson = parseJson<ReviewEvidence>(await readFileSafe(reviewJsonPath(docpathDir)));
  if (fromJson?.kind === 'review') return renderReviewMarkdown(fromJson);
  return await readFileSafe(reviewMarkdownPath(docpathDir)) || '';
}
