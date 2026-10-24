/**
 * docpath:review — 结构化代码审查流程
 *
 * 借鉴 Superpowers 的 code-review:
 * 1. collect — 收集变更文件
 * 2. analyze — 逐文件分析 (复杂度/安全/性能)
 * 3. approve/request-changes — 结论
 */

import { existsSync, readFileSync } from 'fs';
import { gitSync } from '../utils/git-run.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { readCurrentState } from '../utils/workspace.js';
import { transitionWorkflow, assertWorkflowEventLegal } from '../engine/transitions.js';
import { emitNextHint } from '../engine/next-hint.js';
import { writeReviewEvidence, readReviewEvidence } from '../utils/workspace-evidence.js';
import { healStructuredMarkdownDrift } from '../utils/structured-heal.js';
import {
  buildReviewSkillRequirements,
  createReviewSkillSkip,
  evaluateReviewSkillGate,
  resolveTaskBaseRef,
  resolveTaskStartedAt,
  type ReviewSkillGate,
  type ReviewSkillSkip,
} from '../utils/review-skill-router.js';
import { checkArchitectureLayers } from '../engine/arch-guard.js';

interface ReviewOptions {
  cwd: string;
  output?: string;
  scope?: ReviewScope | string;
  approve?: boolean;
  dryRun?: boolean;
  /** 强制执行，即使不在 agent 会话中 */
  force?: boolean;
  skipSkillReview?: unknown[];
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

// R-287 方案 A：漂移不再阻塞评审，改为在门禁入口自愈收敛（json 真源回写勾选态 + 吸收 md 内容）。
// 仅自愈自身 IO/身份漂移失败时 fail-loud。
async function healActiveTaskStructuredMarkdownDrift(docpathDir: string, taskId?: string): Promise<void> {
  if (!taskId) return;
  for (const file of ['spec.md', 'plan.md'] as const) {
    const result = await healStructuredMarkdownDrift(docpathDir, taskId, file);
    if (result.healed) {
      console.log(`🩹  ${file} 机器真理源漂移已自愈: ${result.reason}`);
    }
  }
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
  const norm = file.replace(/\\/g, '/');
  // 排除整个 .docpath 簿记与归档目录（含 tasks/current, tasks/done, workspace, backlog, journal 等）
  if (/^\.docpath\//.test(norm)) return false;
  // 排除第三方依赖与构建输出
  if (/^(?:node_modules|dist)\//.test(norm)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(norm);
}

function runGit(cwd: string, args: string[]): string {
  return gitSync(cwd, args);
}

/** R-276: 证据记录审查时的 HEAD, 供 done 复用判定感知 review 后的新提交。 */
function currentGitHead(cwd: string): string | undefined {
  try {
    return runGit(cwd, ['rev-parse', 'HEAD']).trim() || undefined;
  } catch {
    return undefined;
  }
}

function collectStatusChangedFiles(cwd: string): string[] {
  return parsePorcelainPaths(runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']));
}

function taskCommitFiles(cwd: string, startedAt?: string): string[] {
  if (!startedAt?.trim()) return [];
  try {
    return parseNameList(runGit(cwd, ['log', '--name-only', '--format=', `--since=${startedAt}`, 'HEAD']));
  } catch {
    // 空仓/无提交 (bad revision HEAD) 时降级为空, 让 task 口径仍覆盖工作区变更。
    return [];
  }
}

function collectTaskChangedFiles(cwd: string, taskStartedAt?: string): string[] {
  try {
    return [...new Set([...taskCommitFiles(cwd, taskStartedAt), ...collectStatusChangedFiles(cwd)])].filter(isReviewableFile);
  } catch {
    return [];
  }
}

function collectChangedFiles(cwd: string, scope: ReviewScope = 'all', taskStartedAt?: string): string[] {
  try {
    const files = scope === 'staged'
      ? parseNameList(runGit(cwd, ['diff', '--name-only', '--cached']))
      : scope === 'last_commit'
        ? parseNameList(runGit(cwd, ['show', '--name-only', '--format=', 'HEAD']))
        : scope === 'task'
          ? collectTaskChangedFiles(cwd, taskStartedAt)
          : collectStatusChangedFiles(cwd);
    return [...new Set(files)].filter(isReviewableFile);
  } catch {
    // 可能没有 git 仓库，或仓库尚无提交。
    return [];
  }
}

async function analyzeChangedFile(cwd: string, file: string): Promise<ReviewFinding[]> {
  const norm = file.replace(/\\/g, '/');
  if (/^\.docpath\//.test(norm) || /^(?:node_modules|dist)\//.test(norm)) return [];

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
    // 硬编码路径（与 console.log 规则同口径：测试/命令文件豁免，避免误伤 join(sep,...) 等可移植写法）
    if (/['"]\/(Users|home|tmp)\//.test(line) && !file.includes('test') && !file.includes('src/commands/')) {
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

  // 架构分层防腐与循环依赖检查 (Architecture Drift & Circular Dependency Guard)
  try {
    const archReport = await checkArchitectureLayers(cwd);
    const changedSet = new Set(changedFiles.map((f) => f.replace(/\\/g, '/')));
    for (const v of archReport.violations) {
      const normFile = v.file.replace(/\\/g, '/');
      const normTarget = v.target.replace(/\\/g, '/');
      if (changedSet.has(normFile) || changedSet.has(normTarget)) {
        findings.push({
          file: normFile,
          severity: v.severity === 'error' ? 'error' : 'warn',
          message: `[架构防腐] ${v.message} (${v.rule})`,
        });
      }
    }
  } catch {
    // 容错处理
  }

  // 文档防腐与代码同步检查 (Docs Sync Guard)
  const hasDocsDir = existsSync(join(cwd, 'docs'));
  if (hasDocsDir) {
    const normFiles = changedFiles.map((f) => f.replace(/\\/g, '/'));
    const hasCoreCode = normFiles.some((f) => /^(?:src|lib)\//.test(f));
    const hasDocChanges = normFiles.some((f) => /^docs\//.test(f));
    if (hasCoreCode && !hasDocChanges) {
      findings.push({
        file: 'docs/',
        severity: 'info',
        finding_scope: 'current_diff',
        message: '[docs-sync] 检测到核心代码修改但未变动 docs/，请确认是否需同步更新相关活文档 (AGENTS.md 规范)',
      });
    }
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

function diffForFile(cwd: string, file: string, scope: ReviewScope, taskStartedAt?: string): string {
  try {
    if (scope === 'staged') return runGit(cwd, ['diff', '--unified=0', '--cached', '--', file]);
    if (scope === 'last_commit') return runGit(cwd, ['diff', '--unified=0', 'HEAD~1..HEAD', '--', file]);
    if (scope === 'task') {
      const baseRef = resolveTaskBaseRef(cwd, taskStartedAt);
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

function collectDiffLineRanges(cwd: string, changedFiles: string[], scope: ReviewScope, taskStartedAt?: string): Map<string, Array<{ start: number; end: number }>> {
  const rangesByFile = new Map<string, Array<{ start: number; end: number }>>();
  for (const file of changedFiles) {
    const ranges = parseChangedLineRanges(diffForFile(cwd, file, scope, taskStartedAt));
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
    if (finding.finding_scope) {
      return finding;
    }
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
  if ((gate.evidence_warnings || []).length > 0) {
    console.log('    evidence_warnings:');
    for (const item of gate.evidence_warnings || []) {
      console.log(`      - ${item.skill}: ${item.reason}`);
      console.log(`        fix: ${item.fix_command}`);
    }
  }
  if (gate.skips.length > 0) {
    console.log('    skips:');
    for (const skip of gate.skips) console.log(`      - ${skip.skill}: ${skip.reason}`);
  }
}

function normalizeSkillSkipList(input?: unknown[]): string[] {
  if (!input) return [];
  const normalized: string[] = [];
  const visit = (item: unknown): void => {
    if (item === undefined || item === null || item === false) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item !== 'string') {
      throw new Error('--skip-skill-review requires a skill name');
    }
    normalized.push(...item.split(',').map((part) => part.trim()).filter(Boolean));
  };
  input.forEach(visit);
  return normalized;
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
    head: currentGitHead(cwd),
    files: [],
    findings: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    approved: true,
    manual: true,
  });
  if (!await alreadyReviewed(cwd)) {
    // R-349: 写入前先校验 FSM 合法性——gate 未过 check 时不撞裸 Illegal transition。
    await assertWorkflowEventLegal(cwd, 'review.passed');
    await transitionWorkflow(cwd, 'review.passed', { currentStep: '审查通过，下一步: docpath journal' });
  }
}

async function notifyReviewBlocked(
  cwd: string,
  taskId: string | undefined,
  step: string | undefined,
  reason: string,
): Promise<void> {
  try {
    const { emitGateBlocked } = await import('../engine/hook-runner.js');
    await emitGateBlocked(cwd, { gate: 'review', taskId, step, reason });
  } catch (error) {
    console.warn(`⚠️  on-gate-blocked hook failed (${error instanceof Error ? error.message : String(error)}). Gate outcome unchanged.`);
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
      // R-349: 检查未过（gate=check_fail/none）时 review.passed 不合法，先给出可操作诊断。
      await assertWorkflowEventLegal(cwd, 'review.passed');
      await transitionWorkflow(cwd, 'review.passed', { currentStep: '审查通过，下一步: docpath journal' });
    }
  } else {
    // R-349: 同理，review.failed 在 gate=check_fail 下也不合法；若直接 transition 会抛
    // Illegal workflow transition 并掩盖上面的审查结论（错误数 / skill 证据缺失）。
    await assertWorkflowEventLegal(cwd, 'review.failed');
    await transitionWorkflow(cwd, 'review.failed', { currentStep: `审查失败: ${errors.length} 错误, ${warns.length} 警告` });
  }
}

export async function reviewCommand(opts: ReviewOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(opts.cwd);
  console.log('🔍 代码审查开始...');
  const current = await readCurrentState(opts.cwd);

  // ── 执行 pre-review 生命周期 Hook ──
  try {
    const { executeLifecycleHook } = await import('../engine/hook-runner.js');
    await executeLifecycleHook(opts.cwd, 'pre-review', { taskId: current?.task_id });
  } catch {
    // fail-safe
  }
  // R-276: 任务锚点用 canonical breadcrumb 首条时间 (state.started_at 是 phase 开始时间,
  // 会被 phase 转移刷新, 直接用会静默缩小任务累计 diff)。
  const taskStartedAt = resolveTaskStartedAt(docpathDir, current?.task_id, current?.started_at);
  // R-276: 未显式指定 scope 时, 活跃任务默认审任务累计 diff (提交∪工作区), 与提交时序解耦。
  const scope = opts.scope
    ? normalizeReviewScope(String(opts.scope))
    : current?.task_id && taskStartedAt ? 'task' : 'all';
  if (!opts.scope && scope === 'task') {
    console.log('ℹ️  活跃任务默认走 task 累计 diff 审查 (显式 --scope all 可覆盖)');
  }
  await healActiveTaskStructuredMarkdownDrift(docpathDir, current?.task_id);
  let effectiveScope = scope;
  let changedFiles = collectChangedFiles(opts.cwd, scope, taskStartedAt);
  if (scope === 'all' && changedFiles.length === 0 && current?.task_id) {
    const taskFiles = collectChangedFiles(opts.cwd, 'task', taskStartedAt);
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
    collectDiffLineRanges(opts.cwd, changedFiles, effectiveScope, taskStartedAt),
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
  const taskBaseRef = effectiveScope === 'task' ? resolveTaskBaseRef(opts.cwd, taskStartedAt) : undefined;
  const { enabled, requirements, exempted } = await buildReviewSkillRequirements(opts.cwd, docpathDir, changedFiles, effectiveScope, { taskBaseRef });
  if (exempted) {
    console.log(`⚡  review skill 证据豁免（R-307 小 diff）: 累计 diff ${exempted.total_diff_lines} 行 < 阈值 ${exempted.min_diff_lines}（语言级审查仍建议自查，仅豁免证据仪式）`);
  }
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
  // R-337 R2: current_diff 零错误零警告且「该 skill 完全没有历史证据」时，
  // 自动 pass_with_skips——盖章仪式的价值在有 finding 时留痕；干净 diff 的
  // boilerplate 盖章是纯仪式（R-307 同族）。已有证据的 skill 一律走原校验：
  // stale/fail/file-set-mismatch 照常 fail-loud，不被干净 diff 静默跳过。
  const currentDiffFindings = findings.filter((finding) => finding.finding_scope === 'current_diff');
  const currentDiffClean = !currentDiffFindings.some((finding) => finding.severity === 'error' || finding.severity === 'warn');
  const knownEvidenceSkills = new Set((previousReview?.skill_reviews || []).map((review) => review.skill));
  const autoSkips = currentDiffClean && enabled && previewGate.invalid_evidence.length === 0
    ? previewGate.requirements
        .filter((requirement) =>
          !knownEvidenceSkills.has(requirement.skill)
          && requestedSkips.every((skip) => skip.skill !== requirement.skill))
        .map((requirement) => createReviewSkillSkip(requirement, effectiveScope, 'R-337: current_diff 无错误无警告，干净 diff 自动跳过语言级 skill 盖章'))
    : [];
  const skillReviewGate = evaluateReviewSkillGate({
    enabled,
    requirements,
    skillReviews: previousReview?.skill_reviews,
    skillSkips: [...(previousReview?.skill_review_skips || []), ...requestedSkips, ...autoSkips],
    scope: effectiveScope,
  });
  if (autoSkips.length > 0) {
    console.log('⚡  R-337: current_diff 无错误无警告，语言级 skill 证据自动跳过（pass_with_skips）');
  }
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
      const reason = 'docpath review --approve cannot bypass Review Skill Gate; use --skip-skill-review <skill> --reason <reason> for explicit skill-level exemption';
      await notifyReviewBlocked(opts.cwd, current?.task_id, current?.current_step, reason);
      throw new Error(reason);
    }
    await handleApprove(opts.cwd, docpathDir, taskId);
    await emitNextHint(opts.cwd);
    return;
  }
  const approved = groups.errors.length === 0 && (skillReviewGate.status === 'pass' || skillReviewGate.status === 'pass_with_skips' || skillReviewGate.status === 'not_required' || skillReviewGate.status === 'disabled');
  // R-337 R3: 消息纠偏 —— 警告不阻塞审批（approved 只看 errors+gate），旧消息把
  // baseline 风格警告当 headline 误导 agent（实测: "❌ 需要修改 (0 错误, 13 警告)"
  // 真实阻塞是 skill gate 缺证据）。
  if (approved) {
    console.log(`\n✅ 审查通过 (${groups.errors.length} 错误, ${groups.warns.length} 警告)`);
  } else {
    const blockers: string[] = [];
    if (groups.errors.length > 0) blockers.push(`${groups.errors.length} 个错误`);
    if (!(skillReviewGate.status === 'pass' || skillReviewGate.status === 'pass_with_skips' || skillReviewGate.status === 'not_required' || skillReviewGate.status === 'disabled')) {
      blockers.push(`review skill gate ${skillReviewGate.status}${skillReviewGate.missing_evidence.length > 0 ? `（缺证据: ${skillReviewGate.missing_evidence.join(', ')}）` : ''}`);
    }
    const reason = blockers.join('；') || '未知';
    console.log(`\n❌ 需要修改 — 阻塞原因: ${reason}`);
    if (groups.errors.length === 0 && groups.warns.length > 0) {
      console.log(`   （${groups.warns.length} 项警告不阻塞审批，多为 baseline 整文件风格提示；修复后重跑 docpath review）`);
    }
    await notifyReviewBlocked(opts.cwd, current?.task_id, current?.current_step, reason);
  }
  await persistReviewResult(opts.cwd, taskId, groups, approved);
  const finding_scope_counts = countFindingScopes(findings);
  await writeReviewEvidence(docpathDir, {
    schema_version: 1,
    kind: 'review',
    timestamp: new Date().toISOString(),
    head: currentGitHead(opts.cwd),
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

  // ── 执行 post-review 生命周期 Hook ──
  try {
    const { executeLifecycleHook } = await import('../engine/hook-runner.js');
    await executeLifecycleHook(opts.cwd, 'post-review', { taskId });
  } catch {
    // fail-safe
  }

  await emitNextHint(opts.cwd);
}
