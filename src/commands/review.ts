/**
 * docpath:review — 结构化代码审查流程
 *
 * 借鉴 Superpowers 的 code-review:
 * 1. collect — 收集变更文件
 * 2. analyze — 逐文件分析 (复杂度/安全/性能)
 * 3. approve/request-changes — 结论
 */

import { existsSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { readCurrentState } from '../utils/workspace.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { emitNextHint } from '../utils/next-hint.js';
import { writeReviewEvidence, readReviewEvidence } from '../utils/workspace-evidence.js';
import {
  buildReviewSkillRequirements,
  createReviewSkillSkip,
  evaluateReviewSkillGate,
  type ReviewSkillGate,
  type ReviewSkillSkip,
} from '../utils/review-skill-router.js';

interface ReviewOptions {
  cwd: string;
  output?: string;
  scope?: ReviewScope | string;
  approve?: boolean;
  dryRun?: boolean;
  /** 强制执行，即使不在 agent 会话中 */
  force?: boolean;
  skipSkillReview?: string[];
  skipSkillReviewReason?: string;
}

type ReviewScope = 'all' | 'staged' | 'last_commit' | 'task';

interface ReviewFinding {
  file: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  line?: number;
  finding_scope?: 'current_diff' | 'baseline_or_whole_file';
}

interface FindingGroups {
  errors: ReviewFinding[];
  warns: ReviewFinding[];
  infos: ReviewFinding[];
}

interface FindingScopeCounts {
  current_diff: { errors: number; warnings: number; infos: number };
  baseline_or_whole_file: { errors: number; warnings: number; infos: number };
}

function normalizeReviewScope(scope: string): ReviewScope {
  if (scope === 'all' || scope === 'staged' || scope === 'last_commit' || scope === 'task') return scope;
  throw new Error(`docpath review --scope: 参数非法: ${scope}（允许: all|staged|last_commit|task）`);
}

function parseNameList(output: string): string[] {
  return output.split('\n').map(line => line.trim()).filter(Boolean);
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

function isReviewableFile(file: string): boolean {
  if (/^\.docpath\/workspace\//.test(file)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(file);
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000 });
}

function collectStatusChangedFiles(cwd: string): string[] {
  return parsePorcelainPaths(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
}

function taskCommitFiles(cwd: string, startedAt?: string): string[] {
  if (!startedAt?.trim()) return [];
  return parseNameList(runGit(cwd, ['log', '--name-only', '--format=', `--since=${startedAt}`, 'HEAD']));
}

function collectTaskChangedFiles(cwd: string, current?: Awaited<ReturnType<typeof readCurrentState>>): string[] {
  try {
    return [...new Set([...taskCommitFiles(cwd, current?.started_at), ...collectStatusChangedFiles(cwd)])].filter(isReviewableFile);
  } catch {
    return [];
  }
}

function collectChangedFiles(cwd: string, scope: ReviewScope = 'all', current?: Awaited<ReturnType<typeof readCurrentState>>): string[] {
  try {
    const files = scope === 'staged'
      ? parseNameList(runGit(cwd, ['diff', '--name-only', '--cached']))
      : scope === 'last_commit'
        ? parseNameList(runGit(cwd, ['show', '--name-only', '--format=""', 'HEAD']))
        : scope === 'task'
          ? collectTaskChangedFiles(cwd, current)
          : collectStatusChangedFiles(cwd);
    return [...new Set(files)].filter(isReviewableFile);
  } catch {
    // 可能没有 git 仓库，或仓库尚无提交。
    return [];
  }
}

async function analyzeChangedFile(cwd: string, file: string): Promise<ReviewFinding[]> {
  const fullPath = join(cwd, file);
  if (!existsSync(fullPath)) return [];

  const findings: ReviewFinding[] = [];
  const content = await readFile(fullPath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 待办标记扫描
    if (/\/\/\s*TODO/i.test(line)) {
      findings.push({ file, severity: 'info', line: i + 1, message: `L${i + 1}: 未处理的 TODO: ${line.trim().slice(0, 80)}` });
    }
    // console.log 遗留
    if (/console\.(log|debug)\(/.test(line) && !file.includes('test') && !file.includes('src/commands/')) {
      findings.push({ file, severity: 'warn', line: i + 1, message: `L${i + 1}: 生产代码中的 console.log` });
    }
    // any 类型
    if (/:\s*any\b/.test(line)) {
      findings.push({ file, severity: 'warn', line: i + 1, message: `L${i + 1}: 使用了 any 类型` });
    }
    // 硬编码路径
    if (/['"]\/(Users|home|tmp)\//.test(line)) {
      findings.push({ file, severity: 'error', line: i + 1, message: `L${i + 1}: 硬编码绝对路径` });
    }
  }

  const funcMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*\{[\s\S]*?\n\}/g);
  for (const func of funcMatches || []) {
    const funcLines = func.split('\n').length;
    if (funcLines > 50) {
      const funcName = func.match(/function\s+(\w+)/)?.[1] || 'unknown';
      findings.push({ file, severity: 'warn', message: `函数 ${funcName} 过长 (${funcLines} 行)，建议拆分` });
    }
  }
  return findings;
}

async function analyzeChangedFiles(cwd: string, changedFiles: string[]): Promise<ReviewFinding[]> {
  const findings: ReviewFinding[] = [];
  for (const file of changedFiles) {
    findings.push(...await analyzeChangedFile(cwd, file));
  }
  return findings;
}

function parseChangedLineRanges(diff: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number.parseInt(match[1] || '0', 10);
    const count = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
    if (Number.isFinite(start) && Number.isFinite(count) && count > 0) {
      ranges.push({ start, end: start + count - 1 });
    }
  }
  return ranges;
}

function fileLineCount(cwd: string, file: string): number {
  try {
    return readFileSync(join(cwd, file), 'utf-8').split('\n').length;
  } catch {
    return 0;
  }
}

function resolveTaskBaseRef(cwd: string, startedAt?: string): string | null {
  if (!startedAt?.trim()) return null;
  try {
    const commits = parseNameList(runGit(cwd, ['rev-list', '--reverse', `--since=${startedAt}`, 'HEAD']));
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

function diffForFile(cwd: string, file: string, scope: ReviewScope, current?: Awaited<ReturnType<typeof readCurrentState>>): string {
  try {
    if (scope === 'staged') return runGit(cwd, ['diff', '--unified=0', '--cached', '--', file]);
    if (scope === 'last_commit') return runGit(cwd, ['diff', '--unified=0', 'HEAD~1..HEAD', '--', file]);
    if (scope === 'task') {
      const baseRef = resolveTaskBaseRef(cwd, current?.started_at);
      return [
        baseRef ? runGit(cwd, ['diff', '--unified=0', `${baseRef}..HEAD`, '--', file]) : '',
        runGit(cwd, ['diff', '--unified=0', '--', file]),
        runGit(cwd, ['diff', '--unified=0', '--cached', '--', file]),
      ].join('\n');
    }
    return [
      runGit(cwd, ['diff', '--unified=0', '--', file]),
      runGit(cwd, ['diff', '--unified=0', '--cached', '--', file]),
    ].join('\n');
  } catch {
    return '';
  }
}

function collectDiffLineRanges(cwd: string, changedFiles: string[], scope: ReviewScope, current?: Awaited<ReturnType<typeof readCurrentState>>): Map<string, Array<{ start: number; end: number }>> {
  const rangesByFile = new Map<string, Array<{ start: number; end: number }>>();
  for (const file of changedFiles) {
    const ranges = parseChangedLineRanges(diffForFile(cwd, file, scope, current));
    if (ranges.length === 0) {
      try {
        const status = runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all', '--', file]);
        if (/^\?\?/.test(status.trim())) {
          const lines = fileLineCount(cwd, file);
          if (lines > 0) ranges.push({ start: 1, end: lines });
        }
      } catch {
        // No git status available; leave the file as baseline/whole-file.
      }
    }
    rangesByFile.set(file, ranges);
  }
  return rangesByFile;
}

function classifyFindings(
  findings: ReviewFinding[],
  rangesByFile: Map<string, Array<{ start: number; end: number }>>,
): ReviewFinding[] {
  return findings.map((finding) => {
    const ranges = rangesByFile.get(finding.file) || [];
    const onCurrentDiff = typeof finding.line === 'number' &&
      ranges.some((range) => finding.line! >= range.start && finding.line! <= range.end);
    return {
      ...finding,
      finding_scope: onCurrentDiff ? 'current_diff' : 'baseline_or_whole_file',
    };
  });
}

function emptyFindingCounts(): FindingScopeCounts {
  return {
    current_diff: { errors: 0, warnings: 0, infos: 0 },
    baseline_or_whole_file: { errors: 0, warnings: 0, infos: 0 },
  };
}

function countFindingScopes(findings: ReviewFinding[]): FindingScopeCounts {
  const counts = emptyFindingCounts();
  for (const finding of findings) {
    const scope = finding.finding_scope || 'baseline_or_whole_file';
    if (finding.severity === 'error') counts[scope].errors += 1;
    if (finding.severity === 'warn') counts[scope].warnings += 1;
    if (finding.severity === 'info') counts[scope].infos += 1;
  }
  return counts;
}

function groupFindings(findings: ReviewFinding[]): FindingGroups {
  return {
    errors: findings.filter(f => f.severity === 'error'),
    warns: findings.filter(f => f.severity === 'warn'),
    infos: findings.filter(f => f.severity === 'info'),
  };
}

function printFindingScopeSummary(counts: FindingScopeCounts): void {
  console.log(
    `    current_diff: ${counts.current_diff.errors} 错误, ${counts.current_diff.warnings} 警告, ${counts.current_diff.infos} 提示`,
  );
  console.log(
    `    baseline_or_whole_file: ${counts.baseline_or_whole_file.errors} 错误, ${counts.baseline_or_whole_file.warnings} 警告, ${counts.baseline_or_whole_file.infos} 提示`,
  );
}

function printFindings({ errors, warns, infos }: FindingGroups): void {
  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} 个错误:`);
    errors.forEach(f => console.log(`  [${f.file}] ${f.message}${f.finding_scope ? ` (${f.finding_scope})` : ''}`));
  }
  if (warns.length > 0) {
    console.log(`\n⚠️  ${warns.length} 个警告:`);
    warns.forEach(f => console.log(`  [${f.file}] ${f.message}${f.finding_scope ? ` (${f.finding_scope})` : ''}`));
  }
  if (infos.length > 0) {
    console.log(`\n💡 ${infos.length} 个提示:`);
    infos.forEach(f => console.log(`  [${f.file}] ${f.message}${f.finding_scope ? ` (${f.finding_scope})` : ''}`));
  }
}

async function alreadyReviewed(cwd: string): Promise<boolean> {
  const workflowState = await readCurrentState(cwd);
  return (
    (workflowState?.phase === 'reviewing' && workflowState?.gate === 'review_pass')
    || workflowState?.phase === 'completed'
  );
}

function printReviewSkillGate(gate: ReviewSkillGate): void {
  console.log(`\nreview_skill_gate: ${gate.status}`);
  console.log(`    scope: ${gate.scope}`);
  if (gate.status === 'disabled') {
    console.log('    disabled: review_skill_gate.enabled=false');
    return;
  }
  if (gate.requirements.length === 0) {
    console.log('    requirements: 0');
    return;
  }
  console.log(`    requirements: ${gate.requirements.length}`);
  for (const requirement of gate.requirements) {
    console.log(`    - skill: ${requirement.skill}`);
    console.log(`      language: ${requirement.language}`);
    console.log(`      role: ${requirement.role}`);
    console.log(`      files: ${requirement.files.join(', ')}`);
    console.log(`      diff_fingerprint: ${requirement.diff_fingerprint}`);
    console.log(`      skill_source_path: ${requirement.skill_source_path}`);
    console.log(`      write_command: ${requirement.write_command}`);
    if (requirement.skill_missing) console.log('      skill_missing: true');
  }
  if (gate.missing_evidence.length > 0) {
    console.log(`    missing_evidence: ${gate.missing_evidence.join(', ')}`);
  }
  if (gate.invalid_evidence.length > 0) {
    console.log('    invalid_evidence:');
    for (const item of gate.invalid_evidence) console.log(`      - ${item.skill}: ${item.reason}`);
  }
  if (gate.skips.length > 0) {
    console.log('    skips:');
    for (const skip of gate.skips) console.log(`      - ${skip.skill}: ${skip.reason}`);
  }
}

function normalizeSkillSkipList(input?: string[]): string[] {
  if (!input) return [];
  return input.flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
}

function buildRequestedSkips(gate: ReviewSkillGate, skillNames: string[], reason?: string): ReviewSkillSkip[] {
  if (skillNames.length === 0) return [];
  if (!reason?.trim()) throw new Error('--skip-skill-review requires --reason');

  const skips: ReviewSkillSkip[] = [];
  for (const skill of skillNames) {
    const requirement = gate.requirements.find((candidate) => candidate.skill === skill);
    if (!requirement) throw new Error(`--skip-skill-review 指向了当前 requirement 不存在的 skill: ${skill}`);
    skips.push(createReviewSkillSkip(requirement, gate.scope, reason.trim()));
  }
  return skips;
}

async function handleApprove(cwd: string, docpathDir: string, taskId: string): Promise<void> {
  console.log('\n✅ 审查已手动批准 (跳过自动检查)');
  await writeBreadcrumb(cwd, { taskId, step: 'review', status: 'done', context: '手动批准' });
  await writeReviewEvidence(docpathDir, {
    schema_version: 1,
    kind: 'review',
    timestamp: new Date().toISOString(),
    files: [],
    findings: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    approved: true,
    manual: true,
  });
  if (!await alreadyReviewed(cwd)) {
    await transitionWorkflow(cwd, 'review.passed', { currentStep: '审查通过，下一步: docpath journal' });
  }
}

async function persistReviewResult(cwd: string, taskId: string, groups: FindingGroups, approved: boolean): Promise<void> {
  const { errors, warns, infos } = groups;
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'review',
    status: approved ? 'done' : 'blocked',
    context: `代码审查: ${errors.length} 错误, ${warns.length} 警告, ${infos.length} 提示`,
  });
  if (approved) {
    if (!await alreadyReviewed(cwd)) {
      await transitionWorkflow(cwd, 'review.passed', { currentStep: '审查通过，下一步: docpath journal' });
    }
  } else {
    await transitionWorkflow(cwd, 'review.failed', { currentStep: `审查失败: ${errors.length} 错误, ${warns.length} 警告` });
  }
}

export async function reviewCommand(opts: ReviewOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(opts.cwd);
  console.log('🔍 代码审查开始...');
  const scope = normalizeReviewScope(opts.scope || 'all');
  const current = await readCurrentState(opts.cwd);
  let effectiveScope = scope;
  let changedFiles = collectChangedFiles(opts.cwd, scope, current);
  if (scope === 'all' && changedFiles.length === 0 && current?.task_id) {
    const taskFiles = collectChangedFiles(opts.cwd, 'task', current);
    if (taskFiles.length > 0) {
      effectiveScope = 'task';
      changedFiles = taskFiles;
      console.log('ℹ️  当前工作树无变更，自动切换为 task 累积 diff 审查');
    }
  }
  if (changedFiles.length === 0) {
    console.log('⚠️  未发现变更文件');
    if (opts.dryRun) console.log('📝  [dry-run] 当前无可审查变更，未写入任何状态或证据文件');
    return;
  }
  console.log(`📋 审查 ${changedFiles.length} 个文件...`);
  const findings = classifyFindings(
    await analyzeChangedFiles(opts.cwd, changedFiles),
    collectDiffLineRanges(opts.cwd, changedFiles, effectiveScope, current),
  );
  console.log(`    scope: ${effectiveScope}; finding_scope: mixed`);
  printFindingScopeSummary(countFindingScopes(findings));
  if (!current?.task_id && !opts.force) {
    console.warn('\n⚠️  当前无活跃 agent 会话 (current.md 无 task_id)');
    console.warn('   审查通常应在 agent 流程内执行 (docpath agent done)');
    console.warn('   如需独立运行，添加 --force 标志\n');
  }
  const groups = groupFindings(findings);
  printFindings(groups);
  const previousReview = await readReviewEvidence(docpathDir);
  const { enabled, requirements } = await buildReviewSkillRequirements(opts.cwd, docpathDir, changedFiles, effectiveScope);
  const previewGate = evaluateReviewSkillGate({
    enabled,
    requirements,
    skillReviews: previousReview?.skill_reviews,
    skillSkips: previousReview?.skill_review_skips,
    scope: effectiveScope,
  });
  const requestedSkips = buildRequestedSkips(
    previewGate,
    normalizeSkillSkipList(opts.skipSkillReview),
    opts.skipSkillReviewReason,
  );
  const skillReviewGate = evaluateReviewSkillGate({
    enabled,
    requirements,
    skillReviews: previousReview?.skill_reviews,
    skillSkips: [...(previousReview?.skill_review_skips || []), ...requestedSkips],
    scope: effectiveScope,
  });
  if (opts.dryRun) {
    printReviewSkillGate(
      enabled && requirements.length > 0 && skillReviewGate.status === 'fail'
        ? { ...skillReviewGate, status: 'required' }
        : skillReviewGate,
    );
    console.log('\n📝  [dry-run] 仅预览审查结果，不写入状态、breadcrumb、review.md 或决策日志');
    return;
  }
  printReviewSkillGate(skillReviewGate);
  const taskId = current?.task_id || 'review';
  if (opts.approve) {
    if (!(skillReviewGate.status === 'pass' || skillReviewGate.status === 'pass_with_skips' || skillReviewGate.status === 'not_required' || skillReviewGate.status === 'disabled')) {
      throw new Error('docpath review --approve cannot bypass Review Skill Gate; use --skip-skill-review <skill> --reason <reason> for explicit skill-level exemption');
    }
    await handleApprove(opts.cwd, docpathDir, taskId);
    await emitNextHint(opts.cwd);
    return;
  }
  const approved = groups.errors.length === 0 && (skillReviewGate.status === 'pass' || skillReviewGate.status === 'pass_with_skips' || skillReviewGate.status === 'not_required' || skillReviewGate.status === 'disabled');
  console.log(`\n${approved ? '✅ 审查通过' : '❌ 需要修改'} (${groups.errors.length} 错误, ${groups.warns.length} 警告)`);
  await persistReviewResult(opts.cwd, taskId, groups, approved);
  const finding_scope_counts = countFindingScopes(findings);
  await writeReviewEvidence(docpathDir, {
    schema_version: 1,
    kind: 'review',
    timestamp: new Date().toISOString(),
    scope: effectiveScope,
    finding_scope: 'mixed',
    finding_scope_counts,
    files: changedFiles,
    findings,
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warn').length,
    infos: findings.filter((finding) => finding.severity === 'info').length,
    approved,
    skill_reviews: previousReview?.skill_reviews || [],
    skill_review_skips: [...(previousReview?.skill_review_skips || []), ...requestedSkips],
    skill_review_gate: skillReviewGate,
  });
  await emitNextHint(opts.cwd);
}
