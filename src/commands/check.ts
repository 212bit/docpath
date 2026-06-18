/**
 * docpath:check — 质量门禁 + 工作流护栏检查
 *
 * 执行编译/测试/lint 检查 + harness 规则检查，输出验证报告。
 * Level 2+ 自动写入 breadcrumb。
 *
 * 新增：--harness 检查 harness.md 中的 pre-flight/boundary/pattern 规则
 */

import { existsSync } from 'fs';
import { readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync, execFileSync } from 'child_process';
import { isCancel, select } from '@clack/prompts';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, syncCurrentDocument, parsePlanTasks } from '../utils/workspace.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { detectPlanBreadcrumbDrift } from '../utils/plan-sync.js';
import { validatePlanContent, validateSpecContent } from '../utils/doc-parser.js';
import { detectActiveTaskFileDrift, detectActiveTaskIdentityDrift, formatTaskIdentityDrift, readActiveTaskFile, syncActiveTaskFiles, type TaskFileDrift } from '../utils/task-files.js';
import { validateDeliverables } from '../utils/deliverables.js';
import { resolveUiDesignRequirement, approvalState, hasUiImplementationIntent } from '../utils/ui-gate.js';
import { resolveMajorChangeGateStatus } from '../utils/major-change.js';
import { emitNextHint } from '../utils/next-hint.js';
import { CHECK_HISTORY_MAX_ENTRIES } from '../utils/workspace-cleanup.js';
import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  documentIndexStats,
  isProjectDocumentIndexStale,
  readProjectDocumentIndex,
} from '../utils/document-index.js';
import { resolveRulePaths, type RuleName } from '../utils/rules.js';
import { writeLastCheckEvidence as writeLastCheckEvidenceFiles, type CheckEvidenceItem } from '../utils/workspace-evidence.js';
import { reviewCommand } from './review.js';

interface CheckOptions {
  cwd: string;
  /** 跳过测试，只检查编译 */
  skipTests?: boolean;
  /** 跳过 lint */
  skipLint?: boolean;
  /** 启用 harness 规则检查 */
  harness?: boolean;
  /** 只检查 pre-flight 规则 */
  preflight?: boolean;
  /** 只检查 boundary 规则 */
  boundary?: boolean;
  /** 只检查 pattern 规则 */
  pattern?: boolean;
  /** 只运行 harness 检查，跳过编译/测试/lint */
  onlyHarness?: boolean;
  /** 强制执行，即使不在 agent 会话中 */
  force?: boolean;
  /** 检测到 active task 文件漂移时按指定来源自动同步 */
  fixDrift?: 'canonical' | 'current';
  /** 显示所有检查项（包括成功项） */
  verbose?: boolean;
  /** 检查后自动运行 review */
  withReview?: boolean;
}

interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: 'compile' | 'test' | 'lint' | 'plan' | 'analysis' | 'context' | 'preflight' | 'boundary' | 'pattern';
  severity?: 'error' | 'warning';
}

interface GitBaseline {
  ref: string;
  branch: string;
  worktreeDirty: boolean;
}

function formatValidationIssue(issue: { message: string; line?: number; section?: string; field?: string }): string {
  const details = [
    issue.line ? `line ${issue.line}` : '',
    issue.section ? `section ${issue.section}` : '',
    issue.field ? `field ${issue.field}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${issue.message} (${details.join(', ')})` : issue.message;
}

function formatValidationFailure(filePath: string, issues: Array<{ message: string; line?: number; section?: string; field?: string }>): string {
  return [
    `检查文件: ${filePath}`,
    ...issues.map((issue) => `  - ${formatValidationIssue(issue)}`),
  ].join('\n');
}

function formatTaskFileDrift(drifts: TaskFileDrift[]): string {
  const reasonLabel: Record<TaskFileDrift['reason'], string> = {
    'missing-current': 'current 缺失',
    'missing-canonical': 'canonical 缺失',
    'content-mismatch': '内容不一致',
  };
  return [
    'TASK FILE DRIFT DETECTED:',
    ...drifts.flatMap((drift) => {
      const lines = [
        `  [${drift.file}] ${reasonLabel[drift.reason]}`,
        `    current: ${drift.currentPath}`,
        `    canonical: ${drift.canonicalPath}`,
      ];
      if (drift.detail) {
        lines.push(...drift.detail.split('\n').map((line) => `    ${line}`));
      }
      return lines;
    }),
    '修复建议:',
    '  - 以任务目录为准同步 current: docpath tasks sync --from canonical',
    '  - 以 current 为准回写任务目录: docpath tasks sync --from current',
  ].join('\n');
}

function formatSyncedTaskFiles(synced: Array<{ file: string; fromPath: string; toPath: string }>): string {
  return [
    '已自动同步 active task 文件:',
    ...synced.flatMap((item) => [
      `  [${item.file}]`,
      `    from: ${item.fromPath}`,
      `    to: ${item.toPath}`,
    ]),
  ].join('\n');
}

async function promptTaskFileDriftFix(): Promise<'canonical' | 'current' | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;

  const choice = await select({
    message: '检测到 active task 文件漂移，选择修复方式',
    options: [
      { value: 'canonical', label: '使用任务目录覆盖 current' },
      { value: 'current', label: '使用 current 回写任务目录' },
      { value: 'skip', label: '暂不修复，仅报告失败' },
    ],
  });

  if (isCancel(choice) || choice === 'skip') return undefined;
  return choice;
}

function errorOutput(err: unknown): string {
  if (err && typeof err === 'object') {
    const record = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
    for (const value of [record.stderr, record.stdout, record.message]) {
      if (typeof value === 'string' && value) return value;
      if (Buffer.isBuffer(value)) return value.toString('utf-8');
    }
  }
  return err instanceof Error ? err.message : '';
}

/** 默认检查超时；测试/构建等重命令通过 timeoutMs 单独放宽。 */
const DEFAULT_CHECK_TIMEOUT_MS = 60000;

/** execSync 因超时杀子进程时，错误带 killed=true / signal=SIGTERM；据此区分超时与真失败。 */
function isTimeoutKill(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as { killed?: boolean; signal?: string };
  return record.killed === true || record.signal === 'SIGTERM' || record.signal === 'SIGKILL';
}

function checkCommandEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DOCPATH_SESSION;
  return env;
}

function runCheck(
  name: string,
  cmd: string,
  cwd: string,
  category?: CheckResult['category'],
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): CheckResult {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      env: checkCommandEnv(),
    });
    return { name, passed: true, output: output.slice(0, 500), category };
  } catch (err: unknown) {
    // 超时被杀 ≠ 检查失败：给出明确归因，避免被截断的 `Command failed` 误导成代码错误。
    if (isTimeoutKill(err)) {
      const seconds = Math.round(timeoutMs / 1000);
      return {
        name,
        passed: false,
        output: `命令超时（>${seconds}s）被终止，并非检查失败。命令: ${cmd}\n` +
          `若该命令本身耗时较长，请提高其超时上限或拆分检查。`,
        category,
      };
    }
    return { name, passed: false, output: errorOutput(err).slice(0, 500), category };
  }
}

function runGitOptional(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function readGitBaseline(cwd: string): GitBaseline | null {
  const ref = runGitOptional(cwd, ['rev-parse', 'HEAD']);
  if (!ref) return null;
  return {
    ref,
    branch: runGitOptional(cwd, ['branch', '--show-current']) || 'HEAD',
    worktreeDirty: (runGitOptional(cwd, ['status', '--porcelain=v1', '--untracked-files=all']) || '').length > 0,
  };
}

async function checkMajorDecisionGate(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const state = await readCurrentState(cwd);
  if ((state?.level || 0) < 2) return [];
  const gate = await resolveMajorChangeGateStatus(cwd, docpathDir, state?.task_id);
  if (gate.signals.length === 0) return [];
  return [{
    name: '重大决策确认检查',
    passed: gate.confirmed,
    output: gate.output,
    category: 'plan',
  }];
}

// ─── Harness 规则解析 ───

interface HarnessRule {
  id: string;
  trigger: string;
  level: 'WARN' | 'MUST' | 'INFO';
  description: string;
  enforced?: string;
}

function parseHarnessRules(content: string): HarnessRule[] {
  const rules: HarnessRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // 检测 section 标题
    if (line.startsWith('## ')) {
      continue;
    }

    // 解析表格行: | id | trigger | level | description | enforced? |
    const match = line.match(/^\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(WARN|MUST|INFO)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/);
    if (match) {
      rules.push({
        id: match[1],
        trigger: match[2].trim(),
        level: match[3] as HarnessRule['level'],
        description: match[4].trim(),
        enforced: match[5]?.trim() || undefined,
      });
    }

  }

  return rules;
}

// ─── Harness 规则检查 ───

interface HarnessEvaluation {
  passed: boolean;
  output: string;
}

function harnessRuleCategory(ruleId: string): CheckResult['category'] {
  if (ruleId.startsWith('pre_')) return 'preflight';
  if (ruleId.startsWith('bound_')) return 'boundary';
  return 'pattern';
}

function shouldRunHarnessRule(rule: HarnessRule, options: CheckOptions): boolean {
  if (options.preflight && !rule.id.startsWith('pre_')) return false;
  if (options.boundary && !rule.id.startsWith('bound_')) return false;
  if (options.pattern && !rule.id.startsWith('post_')) return false;
  return true;
}

function missingHarnessResult(): CheckResult {
  return {
    name: 'Harness 规则',
    passed: false,
    output: '未找到 .docpath/harness.md，请先创建 harness 文件',
    category: 'preflight',
  };
}

function noMatchingHarnessRulesResult(): CheckResult {
  return {
    name: 'Harness 规则',
    passed: true,
    output: '未找到匹配的规则',
    category: 'preflight',
  };
}

async function evaluatePreflightRule(ruleId: string, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  switch (ruleId) {
    case 'pre_project_setup': {
      const currentMd = join(docpathDir, 'workspace', 'current.md');
      const specDir = join(docpathDir, 'spec');
      const passed = existsSync(docpathDir) && existsSync(currentMd) && existsSync(specDir);
      return { passed, output: passed ? '项目结构完整' : '缺少 .docpath/ 目录或必要文件' };
    }

    case 'pre_file_structure': {
      const docsMd = join(docpathDir, 'docs.md');
      const passed = existsSync(docsMd);
      return { passed, output: passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`' };
    }

    case 'pre_task_ready': {
      try {
        const current = await readCurrentState(cwd);
        const passed = current?.state === 'ready' || current?.state === 'in_progress';
        return { passed, output: passed ? `任务状态: ${current?.state}` : `任务未就绪: ${current?.state || 'unknown'}` };
      } catch {
        return { passed: false, output: '无法读取任务状态' };
      }
    }

    case 'pre_dependencies': {
      const pkgPath = join(cwd, 'package.json');
      if (!existsSync(pkgPath)) return { passed: true, output: '无 package.json，跳过依赖检查' };
      const nodeModules = join(cwd, 'node_modules');
      const passed = existsSync(nodeModules);
      return { passed, output: passed ? '依赖已安装' : '请运行 npm install' };
    }

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

async function evaluateBoundaryRule(ruleId: string, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  switch (ruleId) {
    case 'bound_time_box': {
      const timeLimit = 60;
      return { passed: true, output: `时间限制: ${timeLimit} 分钟（WARN 级别）` };
    }

    case 'bound_scope': {
      try {
        const state = await readCurrentState(cwd);
        const planContent = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
        if (!planContent.trim()) return { passed: true, output: '无 plan.md，跳过范围检查' };
        const taskCount = (planContent.match(/- \[[ x]\]/gi) || []).length;
        const passed = taskCount <= 20;
        return { passed, output: passed ? `任务数量: ${taskCount}` : `任务数量过多: ${taskCount}，建议拆分` };
      } catch {
        return { passed: true, output: '无法检查范围' };
      }
    }

    case 'bound_tool_permission':
      return { passed: true, output: '工具权限检查（WARN 级别）' };

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

function evaluatePatternRule(ruleId: string, docpathDir: string): HarnessEvaluation {
  switch (ruleId) {
    case 'post_shell_command':
      return { passed: true, output: 'Shell 命令安全性检查（WARN 级别）' };

    case 'post_file_write':
      return { passed: true, output: '文件写入检查（WARN 级别）' };

    case 'post_external_tool':
      return { passed: true, output: '外部工具使用检查（WARN 级别）' };

    case 'post_spec_ref': {
      const docsMd = join(docpathDir, 'docs.md');
      const passed = existsSync(docsMd);
      return { passed, output: passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`' };
    }

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

async function evaluateHarnessRule(rule: HarnessRule, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  const category = harnessRuleCategory(rule.id);
  if (category === 'preflight') return evaluatePreflightRule(rule.id, cwd, docpathDir);
  if (category === 'boundary') return evaluateBoundaryRule(rule.id, cwd, docpathDir);
  return evaluatePatternRule(rule.id, docpathDir);
}

async function runSingleHarnessRule(rule: HarnessRule, cwd: string, docpathDir: string): Promise<CheckResult> {
  const category = harnessRuleCategory(rule.id);
  const evaluation = await evaluateHarnessRule(rule, cwd, docpathDir);
  const shouldBlock = rule.level === 'MUST' && !evaluation.passed;

  return {
    name: `[${rule.level}] ${rule.description}`,
    passed: shouldBlock ? false : true,
    output: evaluation.output,
    category,
  };
}

async function runHarnessChecks(cwd: string, options: CheckOptions): Promise<CheckResult[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const harnessPath = join(docpathDir, 'harness.md');
  if (!existsSync(harnessPath)) return [missingHarnessResult()];

  const content = await readFile(harnessPath, 'utf-8');
  const rules = parseHarnessRules(content);
  const filteredRules = rules.filter(rule => shouldRunHarnessRule(rule, options));
  if (filteredRules.length === 0) return [noMatchingHarnessRulesResult()];

  return Promise.all(filteredRules.map(rule => runSingleHarnessRule(rule, cwd, docpathDir)));
}

interface NodeCommandConfig {
  pkgRunner: string;
  runCmd: string;
}

interface PackageManifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TaskPlanProgress {
  planDoneCount: number;
  planTotalCount: number;
}

function isTerminalVerificationTask(task: { id: string; title: string; done: boolean }): boolean {
  return /验证门禁|质量门禁|check\/review\/journal|docpath check\/review\/journal/i.test(task.title);
}

function effectivePlanProgress(planTasks: Array<{ id: string; title: string; done: boolean }>): {
  doneCount: number;
  totalCount: number;
  waivedTerminalVerification: string[];
} {
  const unfinished = planTasks.filter((task) => !task.done);
  const firstUnfinishedIndex = planTasks.findIndex((task) => !task.done);
  const canWaiveTerminalVerification =
    unfinished.length > 0 &&
    firstUnfinishedIndex >= 0 &&
    firstUnfinishedIndex === planTasks.length - unfinished.length &&
    unfinished.every(isTerminalVerificationTask);
  const waivedTerminalVerification = canWaiveTerminalVerification ? unfinished.map((task) => task.id) : [];
  return {
    doneCount: planTasks.filter((task) => task.done).length + waivedTerminalVerification.length,
    totalCount: planTasks.length,
    waivedTerminalVerification,
  };
}

function normalizeHarnessOptions(options: CheckOptions): void {
  if (options.onlyHarness) {
    options.harness = true;
  }

  if ((options.preflight || options.boundary) && !options.harness) {
    options.harness = true;
  }
}

function warnWhenOutsideAgentSession(current: Awaited<ReturnType<typeof readCurrentState>>, options: CheckOptions): void {
  if (current?.task_id || options.force) return;
  console.warn('⚠️  当前无活跃 agent 会话 (current.md 无 task_id)');
  console.warn('   这些检查通常应在 agent 流程内执行 (docpath agent done)');
  console.warn('   如需独立运行，添加 --force 标志');
  console.warn('');
}

function detectNodeCommandConfig(cwd: string): NodeCommandConfig {
  const hasPnpmLock = existsSync(join(cwd, 'pnpm-lock.yaml'));
  const hasYarnLock = existsSync(join(cwd, 'yarn.lock'));
  return {
    pkgRunner: hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm',
    runCmd: hasPnpmLock ? 'pnpm run' : hasYarnLock ? 'yarn' : 'npm run',
  };
}

async function readPackageManifest(pkgPath: string): Promise<PackageManifest | null> {
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(await readFile(pkgPath, 'utf-8')) as PackageManifest;
  } catch {
    return null;
  }
}

async function runCompileChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig): Promise<CheckResult[]> {
  const tsconfigPath = join(cwd, 'tsconfig.json');
  const cargoPath = join(cwd, 'Cargo.toml');
  const goModPath = join(cwd, 'go.mod');

  if (existsSync(tsconfigPath)) {
    const pkg = await readPackageManifest(pkgPath);
    const scripts = pkg?.scripts || {};
    let typecheckCmd = 'npx tsc --noEmit 2>&1';
    if (scripts.typecheck) {
      typecheckCmd = `${nodeCommands.runCmd} typecheck 2>&1`;
    } else if (scripts['type-check']) {
      typecheckCmd = `${nodeCommands.runCmd} type-check 2>&1`;
    }
    return [runCheck('TypeScript 编译', typecheckCmd, cwd, 'compile')];
  }

  if (existsSync(cargoPath)) return [runCheck('Rust 编译', 'cargo check 2>&1', cwd)];
  if (existsSync(goModPath)) return [runCheck('Go 编译', 'go build ./... 2>&1', cwd)];
  return [];
}

async function runPackageScriptChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig, options: CheckOptions): Promise<CheckResult[]> {
  const pkg = await readPackageManifest(pkgPath);
  if (!pkg?.scripts) return [];

  const results: CheckResult[] = [];
  // 构建/测试是重命令：build 会重编译，test 还串行跑整个套件（本仓库单独跑就 ~33s）。
  // 默认 60s 余量不足会被误杀成假阳性，这里单独放宽到 5 分钟。
  const HEAVY_CHECK_TIMEOUT_MS = 300000;
  if (pkg.scripts.build) {
    results.push(runCheck('构建', `${nodeCommands.runCmd} build 2>&1`, cwd, 'compile', HEAVY_CHECK_TIMEOUT_MS));
  }
  if (!options.skipTests && pkg.scripts.test) {
    results.push(runCheck('测试', `${nodeCommands.pkgRunner} test 2>&1`, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
  } else if (!options.skipTests) {
    // 自动检测测试框架
    const testFramework = detectTestFramework(pkg);
    if (testFramework) {
      const testCmd = `${nodeCommands.pkgRunner} exec ${testFramework} 2>&1`;
      results.push(runCheck('测试', testCmd, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  }
  if (!options.skipLint && pkg.scripts.lint) {
    results.push(runCheck('Lint', `${nodeCommands.runCmd} lint 2>&1`, cwd, 'lint'));
  }
  return results;
}

function detectTestFramework(pkg: PackageManifest): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // 优先级顺序：vitest > jest > mocha
  if (deps.vitest) return 'vitest run';
  if (deps.jest || deps['@jest/core']) return 'jest';
  if (deps.mocha) return 'mocha';

  return null;
}

async function runProjectChecks(cwd: string, options: CheckOptions): Promise<CheckResult[]> {
  const pkgPath = join(cwd, 'package.json');
  const nodeCommands = detectNodeCommandConfig(cwd);
  return [
    ...await runCompileChecks(cwd, pkgPath, nodeCommands),
    ...await runPackageScriptChecks(cwd, pkgPath, nodeCommands, options),
  ];
}

async function checkTaskFileDrift(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  if ((workflowState?.level || 0) < 2 || !workflowState?.task_id) return [];

  const identityDrifts = await detectActiveTaskIdentityDrift(docpathDir, workflowState.task_id);
  if (identityDrifts.length > 0) {
    return [{
      name: '任务身份一致性检查',
      passed: false,
      output: formatTaskIdentityDrift(identityDrifts),
      category: 'plan',
    }];
  }

  let drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);
  let driftOutput = drifts.length === 0 ? 'current 与 canonical 任务文件一致' : formatTaskFileDrift(drifts);
  const fixSource = drifts.length > 0
    ? options.fixDrift ?? await promptTaskFileDriftFix()
    : undefined;
  if (drifts.length > 0 && fixSource) {
    const synced = await syncActiveTaskFiles(docpathDir, workflowState.task_id, fixSource);
    await syncCurrentDocument(cwd);
    const mode = options.fixDrift ? '自动同步' : '交互式同步';
    console.log(`🔧  已${mode} active task 文件 (${fixSource}): ${synced.map((item) => item.file).join(', ')}`);
    drifts = await detectActiveTaskFileDrift(docpathDir, workflowState.task_id);
    driftOutput = drifts.length === 0
      ? formatSyncedTaskFiles(synced)
      : `${formatSyncedTaskFiles(synced)}\n${formatTaskFileDrift(drifts)}`;
  }

  return [{
    name: '任务文件 current/canonical 漂移检查',
    passed: drifts.length === 0,
    output: driftOutput,
    category: 'plan',
  }];
}

async function validateTaskDocuments(cwd: string, docpathDir: string): Promise<{ results: CheckResult[]; progress: TaskPlanProgress }> {
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const workflowState = await readCurrentState(cwd);
  const shouldValidateTaskDocs = (workflowState?.level || 0) >= 2;
  const results: CheckResult[] = [];
  const progress: TaskPlanProgress = { planDoneCount: 0, planTotalCount: 0 };

  if (shouldValidateTaskDocs && existsSync(specPath)) {
    const specContent = await readActiveTaskFile(docpathDir, workflowState?.task_id, 'spec.md');
    const validation = validateSpecContent(specContent);
    results.push({
      name: 'spec.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${specPath}` : formatValidationFailure(specPath, validation.issues),
      category: 'plan',
    });
  }

  results.push(...await checkMajorDecisionGate(cwd, docpathDir));

  const planContent = await readActiveTaskFile(docpathDir, workflowState?.task_id, 'plan.md');
  if (!planContent.trim()) return { results, progress };

  if (shouldValidateTaskDocs) {
    const validation = validatePlanContent(planContent);
    results.push({
      name: 'plan.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${planPath}` : formatValidationFailure(planPath, validation.issues),
      category: 'plan',
    });
  }

  const planTasks = parsePlanTasks(planContent);
  const effectiveProgress = effectivePlanProgress(planTasks);
  progress.planDoneCount = effectiveProgress.doneCount;
  progress.planTotalCount = effectiveProgress.totalCount;
  if (progress.planTotalCount > 0) {
    const passed = progress.planDoneCount === progress.planTotalCount;
    results.push({
      name: `子任务完成度 (${progress.planDoneCount}/${progress.planTotalCount})`,
      passed,
      output: passed
        ? effectiveProgress.waivedTerminalVerification.length > 0
          ? `terminal verification step 由 check/review/journal 生命周期门禁覆盖: ${effectiveProgress.waivedTerminalVerification.join(', ')}`
          : '所有子任务已完成'
        : `还有 ${progress.planTotalCount - progress.planDoneCount} 个子任务未完成`,
      category: 'plan',
    });
  }

  return { results, progress };
}

async function syncCurrentChecklistView(cwd: string): Promise<CheckResult[]> {
  await syncCurrentDocument(cwd);
  // current.md 是渲染视图，不是任务完成真源；真源一致性由 plan.md 与 breadcrumb.md 检查负责。
  return [];
}

function productUiChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.split('\n')
      .map((line) => line.trim().slice(3).trim())
      .filter(Boolean)
      .filter((file) => {
        if (/^(templates|\.codex|\.docpath)\//.test(file)) return false;
        return /\.(tsx|jsx|css|scss)$/.test(file);
      });
  } catch {
    return [];
  }
}

async function checkUiUxDesignGate(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  const taskId = workflowState?.task_id;
  const title = `${workflowState?.task_title || ''} ${taskId || ''}`;

  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const analysisPath = join(docpathDir, 'tasks', 'current', 'analysis.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const haystack = [title];
  if (existsSync(specPath)) haystack.push(await readActiveTaskFile(docpathDir, taskId, 'spec.md'));
  if (existsSync(planPath)) haystack.push(await readActiveTaskFile(docpathDir, taskId, 'plan.md'));
  for (const file of [analysisPath]) {
    if (existsSync(file)) {
      try { haystack.push(await readFile(file, 'utf-8')); } catch { /* ignore */ }
    }
  }

  const text = haystack.join('\n');
  // 判定优先级：spec 4.1 显式框 > 关键词回退（与 go 前置门禁共用 ui-gate.ts）。
  const requirement = await resolveUiDesignRequirement(cwd);
  if (requirement !== 'required') return [];

  const uiBriefPath = join(docpathDir, 'tasks', 'current', 'ui-brief.md');
  const handoffPath = join(docpathDir, 'tasks', 'current', 'external-design-handoff.md');
  const approvalPath = join(docpathDir, 'tasks', 'current', 'design-approval.md');
  const previewPath = join(docpathDir, 'tasks', 'current', 'design-preview.md');
  const acceptancePath = join(docpathDir, 'tasks', 'current', 'visual-acceptance.md');
  const missing: string[] = [];
  const weak: string[] = [];

  if (!existsSync(previewPath)) missing.push('design-preview.md');
  else {
    const preview = (await readFile(previewPath, 'utf-8')).trim();
    if (preview.length < 500 || !/信息架构|布局|状态|交互|移动|响应式|参考|不做|边界|snapshot|HTML/i.test(preview)) {
      weak.push('design-preview.md 缺少足够的视觉意图、布局/状态/响应式/边界描述');
    }
  }

  if (!existsSync(acceptancePath)) missing.push('visual-acceptance.md');
  else {
    const acceptance = (await readFile(acceptancePath, 'utf-8')).trim();
    if (acceptance.length < 300 || !/验收|必须|不得|snapshot|HTML|截图|review|对比|可读|导航/i.test(acceptance)) {
      weak.push('visual-acceptance.md 缺少可执行的视觉验收标准');
    }
  }

  const results: CheckResult[] = [];
  const previewGatePassed = missing.length === 0 && weak.length === 0;
  results.push({
    name: 'UI/UX Design Preview Gate',
    passed: previewGatePassed,
    output: previewGatePassed
      ? 'UI/UX 任务已提供 design-preview.md 与 visual-acceptance.md，视觉意图和验收标准可追踪'
      : [
          missing.length ? `缺少文件: ${missing.join(', ')}` : '',
          ...weak,
          '修复建议:',
          '  - 在写 UI 代码前运行: docpath write-design --kind preview --stdin',
          '  - 写入布局、信息架构、核心状态、响应式边界、参考/反参考与 HTML snapshot 要求',
          '  - 再运行: docpath write-design --kind acceptance --stdin',
          '  - 写入可执行的视觉验收项、禁止项、review 方式与 snapshot/screenshot 要求',
        ].filter(Boolean).join('\n'),
    category: 'analysis',
  });

  const changedUiFiles = productUiChangedFiles(cwd);
  // 顶层已确认 requirement === 'required'；approval gate 是否触发取决于是否进入实现阶段。
  const approvalRequired = hasUiImplementationIntent(text) || changedUiFiles.length > 0;
  if (!approvalRequired) return results;

  const approvalMissing: string[] = [];
  const approvalWeak: string[] = [];
  if (!existsSync(uiBriefPath)) approvalMissing.push('ui-brief.md');
  else {
    const brief = (await readFile(uiBriefPath, 'utf-8')).trim();
    for (const signal of ['Product Context', 'Design North Star', 'Visual Direction', 'Anti-goals', 'Design Tokens', 'Shared Components']) {
      if (!brief.includes(signal)) approvalWeak.push(`ui-brief.md 缺少 ${signal}`);
    }
  }

  if (!existsSync(handoffPath)) approvalMissing.push('external-design-handoff.md');
  else {
    const handoff = (await readFile(handoffPath, 'utf-8')).trim();
    for (const signal of ['Stitch', 'Figma', 'v0', 'Framer', 'prompt', 'output', 'selected', 'rejected', 'constraints']) {
      if (new RegExp(signal, 'i').test(handoff)) continue;
      approvalWeak.push(`external-design-handoff.md 缺少 ${signal}`);
    }
  }

  if (!existsSync(approvalPath)) approvalMissing.push('design-approval.md');
  else {
    const approval = (await readFile(approvalPath, 'utf-8')).trim();
    const state = approvalState(approval);
    if (state !== 'approved') approvalWeak.push(`design-approval.md 状态不是 approved（当前: ${state}）`);
    if (!/approved[_ -]?at|批准时间|Approved at/i.test(approval)) approvalWeak.push('design-approval.md 缺少批准时间');
    if (!/source|批准来源|Approval source/i.test(approval)) approvalWeak.push('design-approval.md 缺少批准来源');
    if (!/forbidden|禁止方向|Forbidden Directions/i.test(approval)) approvalWeak.push('design-approval.md 缺少禁止方向');
  }

  const approvalPassed = approvalMissing.length === 0 && approvalWeak.length === 0 && previewGatePassed;
  results.push({
    name: 'UI/UX Design Approval Gate',
    passed: approvalPassed,
    output: approvalPassed
      ? 'UI/UX 实现已具备 ui-brief、external-design-handoff、design-preview、visual-acceptance 与 approved design-approval'
      : [
          changedUiFiles.length ? `检测到产品 UI 改动: ${changedUiFiles.slice(0, 8).join(', ')}${changedUiFiles.length > 8 ? ` ... +${changedUiFiles.length - 8}` : ''}` : '',
          hasUiImplementationIntent(text) ? '检测到计划或规约包含 UI implementation / 实现意图' : '',
          approvalMissing.length ? `缺少文件: ${approvalMissing.join(', ')}` : '',
          ...approvalWeak,
          '修复建议:',
          '  - 先运行: docpath write-design --kind brief --stdin',
          '  - 记录外部设计工具交接: docpath write-design --kind handoff --stdin',
          '  - 确认具体视觉方案后运行: docpath write-design --kind approval --stdin',
          '  - design-approval.md frontmatter 必须包含 approval.state: approved',
          '  - 用户同意采用流程不等于批准具体设计方案。',
        ].filter(Boolean).join('\n'),
    category: 'analysis',
  });

  return results;
}

async function checkPlanBreadcrumbDrift(cwd: string): Promise<CheckResult[]> {
  const drift = await detectPlanBreadcrumbDrift(cwd);
  if (drift.planDoneWithoutBreadcrumb.length === 0 && drift.breadcrumbDoneWithoutPlan.length === 0) return [];

  const driftLines = [
    'DRIFT DETECTED:',
    ...drift.planDoneWithoutBreadcrumb.map((step) =>
      `  [plan-done-no-breadcrumb] ${step} marked done in plan.md but no breadcrumb evidence`,
    ),
    ...drift.breadcrumbDoneWithoutPlan.map((step) =>
      `  [breadcrumb-done-no-plan] ${step} done in breadcrumb but plan.md still unchecked`,
    ),
    '修复建议:',
    ...drift.planDoneWithoutBreadcrumb.map((step) =>
      `  - 若步骤尚未真正完成，运行: docpath go --step ${step}`,
    ),
    ...drift.breadcrumbDoneWithoutPlan.map((step) =>
      `  - 若步骤已完成但 plan 未同步，运行: docpath agent step --step ${step} --status done`,
    ),
  ];

  return [{
    name: 'Plan/Breadcrumb 漂移检查',
    passed: false,
    output: driftLines.join('\n'),
    category: 'plan',
  }];
}

async function checkDeliverablesIndex(cwd: string): Promise<CheckResult[]> {
  const issues = await validateDeliverables(cwd);
  if (issues.length === 0) return [];
  return [{
    name: 'Deliverables 必填章节校验',
    passed: false,
    output: [
      '以下 deliverables 缺少必填章节:',
      ...issues.map((issue) => `  - ${issue.path} (${issue.template}): ${issue.missing_sections.join(', ')}`),
    ].join('\n'),
    category: 'plan',
  }];
}

function warningResult(name: string, output: string): CheckResult {
  return {
    name,
    passed: true,
    output,
    category: 'context',
    severity: 'warning',
  };
}

function contextFailureResult(name: string, output: string): CheckResult {
  return {
    name,
    passed: false,
    output,
    category: 'context',
    severity: 'error',
  };
}

async function checkContextIndexHealth(docpathDir: string, currentTaskId: string | undefined): Promise<CheckResult[]> {
  const indexPath = join(docpathDir, 'docs-index.json');
  if (!existsSync(indexPath)) {
    return [warningResult(
      'docs-index 缺失',
      '未找到 .docpath/docs-index.json。修复建议: 运行 `docpath docs scan` 生成索引，避免 Agent 回退为全量文档搜索。',
    )];
  }

  try {
    const index = await readProjectDocumentIndex(docpathDir, currentTaskId);
    if (!index) {
      return [warningResult('docs-index 缺失', '未找到可读取的 docs-index。修复建议: 运行 `docpath docs scan`。')];
    }

    const stats = documentIndexStats(index.entries, { currentTaskId });
    const results: CheckResult[] = [{
      name: '上下文预算估算',
      passed: true,
      output: `default_read 估算: ~${stats.defaultReadTokens} / ${DEFAULT_CONTEXT_TOKEN_BUDGET} tokens；索引总量: ${stats.total} docs / ~${stats.estimatedTokens} tokens`,
      category: 'context',
    }];

    if (stats.defaultReadTokens > DEFAULT_CONTEXT_TOKEN_BUDGET) {
      results.push(warningResult(
        '默认上下文预算超限',
        [
          `default_read 估算 ~${stats.defaultReadTokens} tokens，超过 MVP 预算 ${DEFAULT_CONTEXT_TOKEN_BUDGET}。`,
          '修复建议:',
          '  - 运行 `docpath docs scan` 刷新索引字段',
          '  - 将归档、模板、大日志标记为 default_read=false',
          '  - 将规则沉淀到 .docpath/rules/* 并清理低信号经验',
        ].join('\n'),
      ));
    }

    if (await isProjectDocumentIndexStale(docpathDir, index.generated_at)) {
      results.push(warningResult(
        'docs-index 可能陈旧',
        '检测到 .docpath 下存在比 docs-index 更新的 Markdown。修复建议: 运行 `docpath docs scan`。',
      ));
    }

    return results;
  } catch (err) {
    return [contextFailureResult(
      'docs-index 结构损坏',
      `无法解析 .docpath/docs-index.json。修复建议: 运行 \`docpath docs scan\` 重新生成。\n${err instanceof Error ? err.message : String(err)}`,
    )];
  }
}

async function checkCurrentTaskContextFiles(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const required = [
    join(docpathDir, 'tasks', 'current', 'spec.md'),
    join(docpathDir, 'tasks', 'current', 'plan.md'),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length === 0) {
    return [{
      name: '当前任务上下文文件完整性',
      passed: true,
      output: 'tasks/current/spec.md 与 tasks/current/plan.md 均存在',
      category: 'context',
    }];
  }

  const workflowState = await readCurrentState(cwd);
  const archivedRequired = workflowState?.task_id ? [
    join(docpathDir, 'tasks', 'done', workflowState.task_id, 'spec.md'),
    join(docpathDir, 'tasks', 'done', workflowState.task_id, 'plan.md'),
  ] : [];
  const archivedComplete = archivedRequired.length > 0 && archivedRequired.every((path) => existsSync(path));
  if (workflowState?.phase === 'completed' && workflowState.gate === 'review_pass' && archivedComplete) {
    return [{
      name: '当前任务上下文文件完整性',
      passed: true,
      output: `任务已归档，使用 tasks/done/${workflowState.task_id}/spec.md 与 plan.md 作为完成态上下文`,
      category: 'context',
    }];
  }

  return [contextFailureResult(
    '当前任务上下文文件缺失',
    [
      '缺少当前任务必要文件:',
      ...missing.map((path) => `  - ${path}`),
      '修复建议: 回到 drafting/planning 阶段补齐 spec/plan，或运行 active task 文件同步命令修复漂移。',
    ].join('\n'),
  )];
}

async function checkRuleTruthSources(docpathDir: string): Promise<CheckResult[]> {
  const paths = resolveRulePaths(docpathDir);
  const results: CheckResult[] = [];

  for (const name of ['style', 'architecture'] as RuleName[]) {
    const preferredPath = join(paths.rulesDir, `${name}.md`);
    const legacyPath = join(paths.legacySpecDir, `${name}.md`);
    const hasPreferred = existsSync(preferredPath);
    const hasLegacy = existsSync(legacyPath);
    if (!hasPreferred || !hasLegacy) continue;

    const [preferredContent, legacyContent, preferredStat, legacyStat] = await Promise.all([
      readFile(preferredPath, 'utf-8').catch(() => ''),
      readFile(legacyPath, 'utf-8').catch(() => ''),
      stat(preferredPath).catch(() => null),
      stat(legacyPath).catch(() => null),
    ]);

    if (!preferredContent.trim() && legacyContent.trim()) {
      results.push(contextFailureResult(
        `规则真源冲突: ${name}`,
        `.docpath/rules/${name}.md 为空但 legacy .docpath/spec/${name}.md 仍有内容。修复建议: 迁移高信号规则到 .docpath/rules/${name}.md，legacy 只作兼容回退。`,
      ));
      continue;
    }

    if (preferredStat && legacyStat && legacyStat.mtimeMs > preferredStat.mtimeMs + 1000) {
      results.push(contextFailureResult(
        `规则真源冲突: ${name}`,
        `.docpath/spec/${name}.md 比 preferred .docpath/rules/${name}.md 更新，存在双真源风险。修复建议: 将有效变更迁移到 .docpath/rules/${name}.md，避免继续写 legacy 规则。`,
      ));
      continue;
    }

    results.push({
      name: `规则真源: ${name}`,
      passed: true,
      output: `.docpath/rules/${name}.md 为 preferred；legacy .docpath/spec/${name}.md 仅作兼容回退`,
      category: 'context',
    });
  }

  return results;
}

async function checkContextHealth(cwd: string, docpathDir: string): Promise<CheckResult[]> {
  const workflowState = await readCurrentState(cwd);
  if ((workflowState?.level || 0) < 2) return [];
  return [
    ...await checkCurrentTaskContextFiles(cwd, docpathDir),
    ...await checkContextIndexHealth(docpathDir, workflowState?.task_id),
    ...await checkRuleTruthSources(docpathDir),
  ];
}

async function runTaskDocumentChecks(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const driftResults = await checkTaskFileDrift(cwd, docpathDir, options);
  results.push(...driftResults);
  if (driftResults.some((result) => !result.passed)) return results;
  const { results: documentResults } = await validateTaskDocuments(cwd, docpathDir);
  results.push(...documentResults);
  results.push(...await checkUiUxDesignGate(cwd, docpathDir));
  results.push(...await syncCurrentChecklistView(cwd));
  results.push(...await checkPlanBreadcrumbDrift(cwd));
  results.push(...await checkDeliverablesIndex(cwd));
  results.push(...await checkContextHealth(cwd, docpathDir));
  return results;
}

function formatFailedOutput(output: string): string[] {
  const lines = output.split('\n');
  if (lines.length <= 1) return [`     └─ ${output.slice(0, 200)}`];
  const limit = output.includes('修复建议:') ? 14 : 8;
  return lines.slice(0, limit).map((line, index) => index === 0 ? `     └─ ${line}` : `        ${line}`);
}

function shouldPersistPassedOutput(result: CheckResult): boolean {
  return result.passed && /terminal verification step/i.test(result.output);
}

function groupCheckResults(results: CheckResult[]): Record<string, CheckResult[]> {
  const categories: Record<string, CheckResult[]> = {};
  for (const result of results) {
    const category = result.category || 'other';
    if (!categories[category]) categories[category] = [];
    categories[category].push(result);
  }
  return categories;
}

function printCheckReport(results: CheckResult[], allPassed: boolean, verbose = false): void {
  const categoryNames: Record<string, string> = {
    compile: '📝 编译检查',
    test: '🧪 测试检查',
    lint: '🔍 Lint 检查',
    plan: '📋 计划检查',
    analysis: '🧭 分析检查',
    context: '📚 上下文健康检查',
    preflight: '🚀 Pre-flight 检查',
    boundary: '🛡️  Boundary 检查',
    pattern: '📊 Pattern 检查',
    other: '📦 其他检查',
  };

  for (const [category, categoryResults] of Object.entries(groupCheckResults(results))) {
    // 非 verbose 模式：统计成功项
    const passed = categoryResults.filter(r => r.passed && !r.severity);
    const failed = categoryResults.filter(r => !r.passed);
    const warnings = categoryResults.filter(r => r.severity === 'warning');

    if (!verbose && failed.length === 0 && warnings.length === 0) {
      // 只显示汇总
      console.log(`\n${categoryNames[category] || category}:`);
      console.log(`  ✅  ${passed.length} 项通过`);
      continue;
    }

    console.log(`\n${categoryNames[category] || category}:`);
    for (const result of categoryResults) {
      // verbose 模式显示所有项，否则只显示失败和警告
      if (verbose || !result.passed || result.severity === 'warning') {
        const icon = result.severity === 'warning' ? '⚠️' : result.passed ? '✅' : '❌';
        console.log(`  ${icon}  ${result.name}`);
        if ((!result.passed || result.severity === 'warning') && result.output) {
          for (const line of formatFailedOutput(result.output)) {
            console.log(line);
          }
        }
      }
    }
  }

  if (results.length === 0) {
    console.log('⚠️  未检测到可执行的检查项（无 tsconfig/package.json/Cargo.toml/go.mod）');
  }

  console.log(`\n${allPassed ? '✅  全部通过' : '❌  存在失败项'}\n`);
}

async function updateCheckWorkflowState(cwd: string, allPassed: boolean, results: CheckResult[]): Promise<void> {
  const workflowState = await readCurrentState(cwd);
  const alreadyPastCheck = allPassed && (
    (workflowState?.phase === 'reviewing' && workflowState?.gate === 'review_pass')
    || workflowState?.phase === 'completed'
  );
  if (alreadyPastCheck) return;
  const phase = workflowState?.phase || 'idle';
  const eventAllowed = allPassed
    ? ['executing', 'checking', 'completed'].includes(phase)
    : ['executing', 'checking', 'reviewing', 'completed'].includes(phase);
  if (!eventAllowed) return;

  await transitionWorkflow(cwd, allPassed ? 'check.passed' : 'check.failed', {
    currentStep: allPassed
      ? `质量检查通过 (${results.length} 项)，下一步: docpath review`
      : `质量检查失败: ${results.filter(result => !result.passed).map(result => result.name).join(', ')}`,
  });
}

async function writeLastCheckEvidence(cwd: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const gitBaseline = readGitBaseline(cwd);
  const checks: CheckEvidenceItem[] = results.map((result) => ({
    name: result.name,
    passed: result.passed,
    output: shouldPersistPassedOutput(result) ? result.output : '',
    ...(result.category ? { category: result.category } : {}),
    ...(result.severity ? { severity: result.severity } : {}),
  }));
  await writeLastCheckEvidenceFiles(docpathDir, {
    schema_version: 1,
    kind: 'last-check',
    timestamp: new Date().toISOString(),
    passed: allPassed,
    check_count: results.length,
    ...(gitBaseline ? {
      git: {
        ref: gitBaseline.ref,
        branch: gitBaseline.branch,
        worktree_dirty: gitBaseline.worktreeDirty,
      },
    } : {}),
    checks,
  });
}

async function writeCheckBreadcrumb(cwd: string, taskId: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'check',
    status: allPassed ? 'done' : 'blocked',
    context: allPassed
      ? `质量检查通过 (${results.length} 项)`
      : `质量检查失败: ${results.filter(result => !result.passed).map(result => result.name).join(', ')}`,
  });
}

async function updateCheckHistory(cwd: string, docpathDir: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  const regressionPath = join(docpathDir, 'workspace', 'check-history.json');
  type CheckHistoryEntry = { timestamp: string; passed: boolean; failedChecks: string[]; gitRef?: string; branch?: string; worktreeDirty?: boolean };
  let history: CheckHistoryEntry[] = [];
  if (existsSync(regressionPath)) {
    try { history = JSON.parse(await readFile(regressionPath, 'utf-8')) as CheckHistoryEntry[]; } catch { history = []; }
  }

  const currentFailed = results.filter(result => !result.passed).map(result => result.name);
  const gitBaseline = readGitBaseline(cwd);
  history.push({
    timestamp: new Date().toISOString(),
    passed: allPassed,
    failedChecks: currentFailed,
    gitRef: gitBaseline?.ref,
    branch: gitBaseline?.branch,
    worktreeDirty: gitBaseline?.worktreeDirty,
  });
  if (history.length > CHECK_HISTORY_MAX_ENTRIES) history = history.slice(-CHECK_HISTORY_MAX_ENTRIES);
  await writeFile(regressionPath, JSON.stringify(history, null, 2), 'utf-8');

  if (history.length < 2) return;
  const prev = history[history.length - 2];
  if (!prev.passed || allPassed) return;

  const newFailures = currentFailed.filter(failure => !prev.failedChecks.includes(failure));
  if (newFailures.length > 0) {
    console.log(`\n🚨 回归检测: ${newFailures.length} 项新增失败!`);
    newFailures.forEach(failure => console.log(`  ↩️  ${failure}`));
  }
}

async function persistCheckEvidence(cwd: string, docpathDir: string, taskId: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  await updateCheckWorkflowState(cwd, allPassed, results);
  await writeLastCheckEvidence(cwd, results, allPassed);
  await writeCheckBreadcrumb(cwd, taskId, results, allPassed);
  await syncCurrentDocument(cwd);
  await updateCheckHistory(cwd, docpathDir, results, allPassed);
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  const { cwd, skipTests, skipLint } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  const current = await readCurrentState(cwd);

  warnWhenOutsideAgentSession(current, options);

  console.log('\n🔍  质量检查...\n');
  const results: CheckResult[] = [];
  normalizeHarnessOptions(options);

  // 1-5. 常规检查（--only-harness 时跳过）
  if (!options.onlyHarness) {
    results.push(...await runProjectChecks(cwd, { ...options, skipTests, skipLint }));
    results.push(...await runTaskDocumentChecks(cwd, docpathDir, options));
  }

  // 6. Harness 规则检查 (--harness 选项)
  if (options.harness) {
    console.log('\n🔍  检查工作流护栏...\n');
    const harnessResults = await runHarnessChecks(cwd, options);
    results.push(...harnessResults);
  }

  const allPassed = results.every(r => r.passed);
  printCheckReport(results, allPassed, options.verbose);
  await persistCheckEvidence(cwd, docpathDir, current?.task_id || 'unknown', results, allPassed);

  if (!allPassed) {
    console.log('请修复失败项后重新运行 `docpath check`\n');
    throw new Error(`docpath check failed: ${results.filter(r => !r.passed).map(r => r.name).join(', ')}`);
  } else {
    if (options.withReview) {
      console.log('\n🔄  自动执行 review...\n');
      await reviewCommand({ cwd, force: options.force });
    } else {
      console.log('下一步: `docpath review` 进行代码审查');
      await emitNextHint(cwd);
    }
  }
}
