/**
 * docpath:check — 质量门禁 + 工作流护栏检查
 *
 * 执行编译/测试/lint 检查 + harness 规则检查，输出验证报告。
 * Level 2+ 自动写入 breadcrumb。
 *
 * 新增：--harness 检查 harness.md 中的 pre-flight/boundary/pattern 规则
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { isCancel, select } from '@clack/prompts';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentMd, readCurrentState, syncCurrentDocument, readOptionalFile, parsePlanTasks } from '../utils/workspace.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { detectPlanBreadcrumbDrift } from '../utils/plan-sync.js';
import { validatePlanContent, validateSpecContent } from '../utils/doc-parser.js';
import { detectActiveTaskFileDrift, syncActiveTaskFiles, type TaskFileDrift } from '../utils/task-files.js';

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
}

interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: 'compile' | 'test' | 'lint' | 'plan' | 'preflight' | 'boundary' | 'pattern';
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
    ...drifts.flatMap((drift) => [
      `  [${drift.file}] ${reasonLabel[drift.reason]}`,
      `    current: ${drift.currentPath}`,
      `    canonical: ${drift.canonicalPath}`,
    ]),
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

function runCheck(name: string, cmd: string, cwd: string, category?: CheckResult['category']): CheckResult {
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { name, passed: true, output: output.slice(0, 500), category };
  } catch (err: unknown) {
    return { name, passed: false, output: errorOutput(err).slice(0, 500), category };
  }
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
  let currentSection = '';

  for (const line of lines) {
    // 检测 section 标题
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
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
        const current = await readCurrentMd(cwd);
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
        const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
        if (!existsSync(planPath)) return { passed: true, output: '无 plan.md，跳过范围检查' };
        const planContent = await readFile(planPath, 'utf-8');
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
}

interface TaskPlanProgress {
  planDoneCount: number;
  planTotalCount: number;
}

function normalizeHarnessOptions(options: CheckOptions): void {
  if (options.onlyHarness) {
    options.harness = true;
  }

  if ((options.preflight || options.boundary) && !options.harness) {
    options.harness = true;
  }
}

function warnWhenOutsideAgentSession(current: Awaited<ReturnType<typeof readCurrentMd>>, options: CheckOptions): void {
  if (current?.task_id || options.force) return;
  console.warn('⚠️  当前无活跃 agent 会话 (current.md 无 task_id)');
  console.warn('   这些检查通常应在 agent 流程内执行 (docpath:agent done)');
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
  if (pkg.scripts.build) {
    results.push(runCheck('构建', `${nodeCommands.runCmd} build 2>&1`, cwd, 'compile'));
  }
  if (!options.skipTests && pkg.scripts.test) {
    results.push(runCheck('测试', `${nodeCommands.pkgRunner} test 2>&1`, cwd, 'test'));
  }
  if (!options.skipLint && pkg.scripts.lint) {
    results.push(runCheck('Lint', `${nodeCommands.runCmd} lint 2>&1`, cwd, 'lint'));
  }
  return results;
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
    const specContent = await readFile(specPath, 'utf-8');
    const validation = validateSpecContent(specContent);
    results.push({
      name: 'spec.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${specPath}` : formatValidationFailure(specPath, validation.issues),
      category: 'plan',
    });
  }

  if (!existsSync(planPath)) return { results, progress };

  const planContent = await readFile(planPath, 'utf-8');
  if (shouldValidateTaskDocs) {
    const validation = validatePlanContent(planContent);
    results.push({
      name: 'plan.md 结构校验',
      passed: validation.ok,
      output: validation.ok ? `检查文件: ${planPath}` : formatValidationFailure(planPath, validation.issues),
      category: 'plan',
    });
  }

  progress.planDoneCount = (planContent.match(/- \[x\]/gi) || []).length;
  progress.planTotalCount = (planContent.match(/- \[[ x]\]/gi) || []).length;
  if (progress.planTotalCount > 0) {
    const passed = progress.planDoneCount === progress.planTotalCount;
    results.push({
      name: `子任务完成度 (${progress.planDoneCount}/${progress.planTotalCount})`,
      passed,
      output: passed ? '所有子任务已完成' : `还有 ${progress.planTotalCount - progress.planDoneCount} 个子任务未完成`,
      category: 'plan',
    });
  }

  return { results, progress };
}

async function checkCurrentChecklist(cwd: string, docpathDir: string, progress: TaskPlanProgress): Promise<CheckResult[]> {
  await syncCurrentDocument(cwd);

  const currentMdPath = join(docpathDir, 'workspace', 'current.md');
  if (!existsSync(currentMdPath)) return [];

  try {
    const currentContent = await readFile(currentMdPath, 'utf-8');
    const checklistMatch = currentContent.match(/##[^\n]*?执行检查清单\s*\n([\s\S]*?)(?=\n##|\n---|\n```|$)/);
    if (!checklistMatch) return [];

    const checklistBlock = checklistMatch[1];
    const currentDoneCount = (checklistBlock.match(/- \[x\]/gi) || []).length;
    const currentTotalCount = (checklistBlock.match(/- \[[ x]\]/gi) || []).length;
    const planFullyDone = progress.planTotalCount > 0 && progress.planDoneCount === progress.planTotalCount;

    if (currentTotalCount > 0 && planFullyDone && currentDoneCount < currentTotalCount) {
      return [{
        name: `⚠️  Checklist 同步 (${currentDoneCount}/${currentTotalCount})`,
        passed: false,
        output: `plan.md 全部完成但 current.md checklist 仍有 ${currentTotalCount - currentDoneCount} 项未勾选，请同步更新`,
        category: 'plan',
      }];
    }
    if (currentTotalCount > 0) {
      return [{
        name: `Checklist 同步 (${currentDoneCount}/${currentTotalCount})`,
        passed: true,
        output: planFullyDone ? 'current.md checklist 与执行状态一致' : 'checklist 已记录 (plan.md 未全部完成，暂不交叉校验)',
        category: 'plan',
      }];
    }
  } catch { /* skip */ }

  return [];
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

async function runTaskDocumentChecks(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  results.push(...await checkTaskFileDrift(cwd, docpathDir, options));
  const { results: documentResults, progress } = await validateTaskDocuments(cwd, docpathDir);
  results.push(...documentResults);
  results.push(...await checkCurrentChecklist(cwd, docpathDir, progress));
  results.push(...await checkPlanBreadcrumbDrift(cwd));
  return results;
}

function formatFailedOutput(output: string): string[] {
  const lines = output.split('\n');
  if (lines.length <= 1) return [`     └─ ${output.slice(0, 200)}`];
  const limit = output.includes('修复建议:') ? 14 : 8;
  return lines.slice(0, limit).map((line, index) => index === 0 ? `     └─ ${line}` : `        ${line}`);
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

function printCheckReport(results: CheckResult[], allPassed: boolean): void {
  const categoryNames: Record<string, string> = {
    compile: '📝 编译检查',
    test: '🧪 测试检查',
    lint: '🔍 Lint 检查',
    plan: '📋 计划检查',
    preflight: '🚀 Pre-flight 检查',
    boundary: '🛡️  Boundary 检查',
    pattern: '📊 Pattern 检查',
    other: '📦 其他检查',
  };

  for (const [category, categoryResults] of Object.entries(groupCheckResults(results))) {
    console.log(`\n${categoryNames[category] || category}:`);
    for (const result of categoryResults) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`  ${icon}  ${result.name}`);
      if (!result.passed && result.output) {
        for (const line of formatFailedOutput(result.output)) {
          console.log(line);
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

  await transitionWorkflow(cwd, allPassed ? 'check.passed' : 'check.failed', {
    currentStep: allPassed
      ? `质量检查通过 (${results.length} 项)，下一步: docpath review`
      : `质量检查失败: ${results.filter(result => !result.passed).map(result => result.name).join(', ')}`,
  });
}

async function writeLastCheckEvidence(cwd: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  const lastCheckPath = join(cwd, '.docpath', 'workspace', 'last-check.md');
  const checkLines: string[] = ['# Last Check Evidence', ''];
  checkLines.push(`**时间**: ${new Date().toISOString()}`);
  checkLines.push(`**结果**: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
  checkLines.push(`**检查项**: ${results.length}`);
  checkLines.push('');
  for (const result of results) {
    checkLines.push(`- ${result.passed ? '✅' : '❌'} ${result.name}`);
  }
  checkLines.push('');
  await writeFile(lastCheckPath, checkLines.join('\n'), 'utf-8');
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

async function updateCheckHistory(docpathDir: string, results: CheckResult[], allPassed: boolean): Promise<void> {
  const regressionPath = join(docpathDir, 'workspace', 'check-history.json');
  type CheckHistoryEntry = { timestamp: string; passed: boolean; failedChecks: string[] };
  let history: CheckHistoryEntry[] = [];
  if (existsSync(regressionPath)) {
    try { history = JSON.parse(await readFile(regressionPath, 'utf-8')) as CheckHistoryEntry[]; } catch { history = []; }
  }

  const currentFailed = results.filter(result => !result.passed).map(result => result.name);
  history.push({ timestamp: new Date().toISOString(), passed: allPassed, failedChecks: currentFailed });
  if (history.length > 20) history = history.slice(-20);
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
  await updateCheckHistory(docpathDir, results, allPassed);
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  const { cwd, skipTests, skipLint } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  const current = await readCurrentMd(cwd);

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
  printCheckReport(results, allPassed);
  await persistCheckEvidence(cwd, docpathDir, current?.task_id || 'unknown', results, allPassed);

  if (!allPassed) {
    console.log('请修复失败项后重新运行 `docpath:check`\n');
    throw new Error(`docpath check failed: ${results.filter(r => !r.passed).map(r => r.name).join(', ')}`);
  } else {
    console.log('下一步: `docpath:review` 进行代码审查\n');
  }
}
