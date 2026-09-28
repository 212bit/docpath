/**
 * docpath:journal — 知识归档 + 渐进式记忆固化
 *
 * 从完成的任务中提炼结构化知识，更新 spec.md 的架构决策记录。
 * 核心价值：让每一次开发都成为知识积累，而非一次性消耗。
 */

import { existsSync } from 'fs';
import { readFile, writeFile, rename, readdir, stat, rm } from 'fs/promises';
import { join } from 'path';
import { readCurrentState, readWorkspaceMeta, parsePlanTasks, type CurrentState } from '../utils/workspace.js';
import { MAX_ENTRIES, readBreadcrumb, truncateBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';

import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow, assertWorkflowEventLegal } from '../engine/transitions.js';
import { evaluateCompletionPolicy } from '../engine/policy.js';
import { isQuickProfile } from '../engine/workflow-profile.js';
import { appendDecision, gcDecisions, splitArchiveIfBloated } from '../governance/decisions.js';
import { listBacklogItems, transitionBacklog, writeBacklogItem, refreshBacklogIndex } from '../engine/backlog.js';
import {
  archivedTaskDir,
  canonicalTaskDir,
  canonicalTaskRelativePath,
  clearCurrentTaskAlias,
  readActiveStructuredSpecDocument,
  readActiveTaskFile,
  resolveActiveTaskDocPath,
} from '../utils/task-files.js';
import type { StructuredSpecDocument } from '../utils/structured-docs.js';
import { emitNextHint } from '../engine/next-hint.js';
import { gitSync } from '../utils/git-run.js';
import { collectTaskMetrics, persistTaskMetrics } from '../utils/task-metrics.js';

interface JournalOptions {
  cwd: string;
  skipDecisionGc?: boolean;
  /** Use compact closeout wording when journal runs as an automatic closeout sub-step. */
  quietPrompt?: boolean;
  /** 归档模式: 'always' = 物理归档 | 'skip' = 跳过归档 | 'dry-run' = legacy 归档预览 */
  archiveMode?: 'always' | 'skip' | 'dry-run';
  dryRun?: boolean;
}

interface TaskSummary {
  taskId: string;
  totalSteps: number;
  completedSteps: number;
  blockedSteps: number;
  keyDecisions: string[];
  duration: string;
}

interface JournalContext {
  docpathDir: string;
  current: CurrentState | null;
  taskId: string;
  taskDirName: string;
  taskDir: string;
  planPath: string;
  spec: string;
  plan: string;
  structuredSpec: StructuredSpecDocument | null;
  breadcrumb: Awaited<ReturnType<typeof readBreadcrumb>>;
  meta: Record<string, unknown> | null;
}

interface ArchiveResult {
  currentTaskDir: string;
  archivedTaskDir: string;
  taskDirName: string;
}

function extractArchitectureDecisionCandidates(lines: string[]): Array<{
  title: string;
  decision: string;
  context: string;
}> {
  const candidates: Array<{ title: string; decision: string; context: string }> = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isLowSignalJournalLine(line)) continue;

    const looksArchitectural = /架构|architecture|边界|模块|接口|数据模型|状态机/i.test(line);
    const looksDecision = /决策|采用|改为|统一|使用|保留|拆分/i.test(line);
    if (!looksArchitectural || !looksDecision) continue;

    const title = line
      .replace(/^[\-\*\d\.\s]+/, '')
      .replace(/^[✅🏗️📌]+\s*/, '')
      .slice(0, 48)
      .trim() || '架构决策';
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      title,
      decision: line,
      context: rawLine,
    });
  }

  return candidates;
}

function isLowSignalJournalLine(line: string): boolean {
  return [
    /^完成\s*\d+\s*\/\s*\d+\s*步/,
    /^知识归档完成\s*\(\s*\d+\s*\/\s*\d+\s*步\s*\)/,
    /^质量检查(?:通过|失败)/,
    /^代码审查[:：]/,
    /^agent-step[:：]/,
    /^开始执行[:：]/,
  ].some((pattern) => pattern.test(line));
}

interface AdrCandidate {
  title: string;
  decision: string;
  context: string;
}

/**
 * 解析 Decision Brief 文本：优先 structured spec.json，回退到 spec.md 的
 * 「### Decision Brief」段落。两者都不存在则返回 null。
 */
function resolveDecisionBrief(context: JournalContext): string | null {
  const structuredObj = context.structuredSpec?.decision_brief;
  if (structuredObj && typeof structuredObj === 'object' && 'problem' in structuredObj) {
    return [
      `- 当前问题: ${structuredObj.problem}`,
      `- 可选方案:`,
      ...(structuredObj.options || []).map(o => `  - ${o}`),
      `- 推荐方案: ${structuredObj.chosen}`,
      `- 决策理由: ${structuredObj.rationale}`,
    ].join('\n');
  }
  const structured = context.structuredSpec?.major_change_gate?.decision_brief_markdown?.trim();
  if (structured) return structured;
  const md = context.spec || '';
  const marker = '### Decision Brief';
  const idx = md.indexOf(marker);
  if (idx < 0) return null;
  const rest = md.slice(idx + marker.length);
  const next = rest.search(/\n##\s/);
  const block = next >= 0 ? rest.slice(0, next) : rest;
  return block.trim() || null;
}

/**
 * 从 Decision Brief 提取 ADR 候选（最高信号来源）。
 * brief 来自 spec.json 的 decision_brief_markdown 或 spec.md 的对应段落，
 * 比 breadcrumb 关键词匹配更可靠。
 */
function extractAdrFromDecisionBrief(
  brief: string | null,
  fallbackTitle: string,
): AdrCandidate[] {
  if (!brief) return [];
  const recommended = extractBriefField(brief, '推荐方案')
    || extractBriefField(brief, '推荐')
    || extractBriefField(brief, '目标');
  const title = (recommended || fallbackTitle || 'Decision Brief').slice(0, 80).trim();
  return [{
    title: title || 'Decision Brief',
    decision: (recommended || brief.split('\n')[0] || title).trim(),
    context: brief,
  }];
}

function extractBriefField(brief: string, field: string): string | null {
  const m = brief.match(new RegExp(`(?:^|\\n)[\\-*]?\\s*${field}[:：]\\s*([^\\n]+)`));
  return m ? m[1].trim() : null;
}

/**
 * 从 spec.md「## 4. 关键决策」表提取 ADR 候选（次优先）。
 * 表格式: | # | 决策 | 选项 | 结论 | 理由 |
 */
function extractAdrFromKeyDecisionsTable(specMarkdown: string): AdrCandidate[] {
  const section = extractMarkdownSection(specMarkdown, '## 4. 关键决策')
    || extractMarkdownSection(specMarkdown, '## 4.关键决策');
  if (!section) return [];
  const candidates: AdrCandidate[] = [];
  const rows = section.split('\n').filter((l) => l.trim().startsWith('|'));
  for (const row of rows.slice(1)) {
    if (row.includes('---')) continue;
    const cells = row.split('|').map((c) => c.trim()).filter((_, i, arr) => !(arr.length && _ === '' && (i === 0 || i === arr.length - 1)));
    if (cells.length < 4) continue;
    // [# , 决策, 选项, 结论, 理由]
    const decision = cells[1];
    const conclusion = cells[3] || decision;
    if (!decision || /^决策$/i.test(decision)) continue;
    candidates.push({
      title: decision.slice(0, 48).trim(),
      decision: conclusion.trim(),
      context: row.trim(),
    });
  }
  return candidates;
}

function isLowSignalAdrCandidate(candidate: AdrCandidate): boolean {
  const normalized = [candidate.title, candidate.decision, candidate.context]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  return [
    /spec\.json\s*渲染/i,
    /backlog promote seed spec/i,
    /JSON\s*\/\s*Markdown/i,
    /保留 backlog 作为来源/u,
    /机器真源重建视图/u,
    /便于后续 plan\/go 接续/u,
    /^方案\s*[A-Z]$/iu,
    /方案\s*A\s*[:：]?\s*方案\s*A/iu,
    /risk\.escalation/i,
    /env\.exemption/i,
    /gate\.(?:pass|fail|skip)/i,
    /runner\s*event/i,
    /health\s*check/i,
  ].some((pattern) => pattern.test(normalized));
}

export async function journalCommand(options: JournalOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (!options.quietPrompt) {
    console.log('\n📚  知识归档...\n');
  }

  await assertJournalGate(cwd);

  const context = await loadJournalContext(cwd, docpathDir);
  const summary = await buildTaskSummary(context);

  if (!options.quietPrompt) {
    console.log(`📌  任务: ${summary.taskId}`);
    console.log(`📊  步骤: ${summary.completedSteps}/${summary.totalSteps} 完成, ${summary.blockedSteps} 阻塞`);
    console.log(`⏱️  耗时: ${summary.duration}\n`);
  }

  if (options.quietPrompt) {
    console.log(`📝  知识自动归档: ${summary.completedSteps}/${summary.totalSteps} 步完成`);
    printAiNativeJournalPrompt(context, summary);
  } else {
    console.log('\n📋  知识记录待写入 spec.md');
    console.log('    journal 在 docpath agent done 流程中会自动完成知识提取与写入。');
    console.log('    如需手动操作，运行: docpath write-journal\n');
    printAiNativeJournalPrompt(context, summary);
  }

  const dryRun = options.dryRun === true || options.archiveMode === 'dry-run';
  const archiveMode = options.archiveMode === 'dry-run' ? 'always' : (options.archiveMode || 'skip');
  const archive = await archiveCurrentTask(docpathDir, context.taskId, context.taskDir, archiveMode, !!options.quietPrompt, dryRun);
  if (dryRun) {
    printJournalDryRunComplete();
    return;
  }

  await finalizeJournal(cwd, context, archive, summary, !!options.skipDecisionGc, !!options.quietPrompt);
}

function printAiNativeJournalPrompt(context: JournalContext, summary: TaskSummary): void {
  const decisionBrief = resolveDecisionBrief(context);
  const blockedSteps = context.breadcrumb.entries
    .filter((entry) => entry.taskId === context.taskId && entry.status === 'blocked')
    .map((entry) => `${entry.step}: ${entry.context}`);
  const decisions = collectAdrCandidates(context, summary)
    .slice(0, 5)
    .map((candidate) => `${candidate.title}: ${candidate.decision}`);

  console.log('🤖  AI-native journal prompt contract');
  console.log('    目标: 由当前 Agent 语义判断本任务是否产生可复用经验；CLI 只负责结构化落盘，不调用隐藏 LLM。');
  console.log('    经验类型: design-decision, project-convention, pattern, anti-pattern, common-mistake, specification, gotcha');
  console.log('    决策树:');
  console.log('      1. 这是否会在未来任务中重复出现？否则跳过。');
  console.log('      2. 是否有明确触发条件、期望行为和边界？否则跳过。');
  console.log('      3. 应写到哪里: decisions / rules/style / rules/architecture / spec。');
  console.log('      4. 是否避免了一次性实现细节、完成步数、普通 check/review 统计？否则跳过。');
  console.log('    写入命令: docpath write-journal --structured --stdin');
  console.log('    JSON schema: {"entries":[{"type":"pattern","target":"rules/style","summary":"...","rationale":"...","content":"...","evidence":["..."]}]}');
  if (decisionBrief) console.log(`    decision_brief: ${decisionBrief.split('\n')[0].slice(0, 140)}`);
  if (decisions.length > 0) console.log(`    decision_candidates: ${decisions.join(' | ').slice(0, 240)}`);
  if (blockedSteps.length > 0) console.log(`    blocked_steps: ${blockedSteps.join(' | ').slice(0, 240)}`);
  console.log('');
}

async function assertJournalGate(cwd: string): Promise<void> {
  const gateVerdict = await evaluateCompletionPolicy(cwd);
  if (!gateVerdict.allowed) {
    console.error('❌  归档门禁未通过');
    for (const reason of gateVerdict.reasons) console.error(`   - ${reason}`);
    process.exit(1);
  }
}

async function loadJournalContext(cwd: string, docpathDir: string): Promise<JournalContext> {
  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || 'unknown';
  const taskDirName = taskId !== 'unknown' ? taskId : 'current';
  const planPath = resolveActiveTaskDocPath(docpathDir, current?.task_id, 'plan.md');
  return {
    docpathDir,
    current,
    taskId,
    taskDirName,
    taskDir: canonicalTaskDir(docpathDir, taskDirName),
    planPath,
    spec: await readActiveTaskFile(docpathDir, current?.task_id, 'spec.md'),
    plan: await readActiveTaskFile(docpathDir, current?.task_id, 'plan.md'),
    structuredSpec: await readActiveStructuredSpecDocument(docpathDir, current?.task_id),
    breadcrumb: await readBreadcrumb(cwd),
    meta: await readWorkspaceMeta(cwd),
  };
}

async function buildTaskSummary(context: JournalContext): Promise<TaskSummary> {
  const planTasks = context.plan ? parsePlanTasks(context.plan) : [];
  const latestByStep = new Map<string, (typeof context.breadcrumb.entries)[number]>();
  for (const entry of context.breadcrumb.entries.filter(e => e.taskId === context.taskId)) {
    latestByStep.set(entry.step, entry);
  }
  const latestEntries = Array.from(latestByStep.values());
  const planDoneCount = planTasks.filter(t => t.done).length;
  const usePlanChecklist = planTasks.length > 0 && planDoneCount > 0;
  const totalSteps = usePlanChecklist ? planTasks.length : (latestEntries.length || planTasks.length || 1);
  const completedSteps = usePlanChecklist
    ? planDoneCount
    : latestEntries.filter(e => e.status === 'done').length;
  const blockedSteps = latestEntries.filter(e => e.status === 'blocked').length;
  return {
    taskId: context.taskId,
    totalSteps,
    completedSteps,
    blockedSteps,
    keyDecisions: context.breadcrumb.entries.filter(e => e.taskId === context.taskId).map(e => e.context),
    duration: totalSteps > 0 ? `${totalSteps} 步` : 'N/A',
  };
}

function printJournalDryRunComplete(): void {
  console.log('🔍  [dry-run] 不写入状态、breadcrumb 或决策日志');
  console.log('─── 完成 ───');
  console.log('dry-run 完成，未修改任务状态。\n');
}

async function finalizeJournal(
  cwd: string,
  context: JournalContext,
  archive: ArchiveResult,
  summary: TaskSummary,
  skipDecisionGc: boolean,
  quiet: boolean = false,
): Promise<void> {
  if (context.current?.gate === 'check_pass' && isQuickProfile(context.current.workflow_profile)) {
    // R-349: 与 agent/review 同源——写 review 类事件前做一次 FSM 合法性校验，
    // 避免 phase/gate 组合意外时抛裸 Illegal transition。
    await assertWorkflowEventLegal(cwd, 'review.skipped');
    await transitionWorkflow(cwd, 'review.skipped', {
      currentStep: 'review skipped by quick profile',
    });
  }
  await transitionWorkflow(cwd, 'journal.archived', { currentStep: '知识归档完成' });
  // R-274/FR-1: 任务已 completed, WIP note 生命周期随之终结, 防陈旧误导下个会话。
  // 删除失败不阻断 journal 主流程。
  try {
    await rm(join(context.docpathDir, 'workspace', 'wip-note.md'), { force: true });
  } catch { /* 清理失败不阻断归档 */ }
  checkLivingDocSync(cwd);
  await completeLinkedBacklog(cwd, context.taskId, context.spec, context.structuredSpec);
  await writeBreadcrumb(cwd, {
    taskId: context.taskId,
    step: 'journal',
    status: 'done',
    context: `知识归档完成 (${summary.completedSteps}/${summary.totalSteps} 步)`,
  });
  await writeLessonCandidate(context, summary);
  await updateWorkspaceMeta(context.docpathDir, context.meta);
  await writeJournalDecisions(cwd, archive.taskDirName, summary, context);
  await gcJournalDecisions(cwd, skipDecisionGc);
  try {
    const metrics = await collectTaskMetrics(cwd, context.taskId);
    await persistTaskMetrics(cwd, metrics);
  } catch {
    // 效能度量采集非致命
  }
  if (!quiet) {
    console.log('─── 完成 ───');
    console.log('所有步骤已归档。运行 `docpath init` 开始新任务。');
  }
  await emitNextHint(cwd);
}

const LIVING_DOC_MAPPINGS: Array<{ pattern: RegExp; doc: string; title: string }> = [
  { pattern: /(?:src|tests)\/.*worktree/i, doc: 'docs/features/worktree-workflow.md', title: 'Worktree 并行机制' },
  { pattern: /(?:src|tests)\/.*(?:agent|context-injection|token-budget)/i, doc: 'docs/design/agent-integration.md', title: 'Agent 集成与上下文协议' },
  { pattern: /(?:src|tests)\/.*(?:session)/i, doc: 'docs/design/session-isolation-mvp.md', title: 'Session 隔离机制' },
  { pattern: /(?:src|tests)\/.*(?:error-codes|error-helpers)/i, doc: 'docs/error-codes.md', title: '错误码字典' },
  { pattern: /(?:src|tests)\/.*(?:transitions|policy|workflow-profile)/i, doc: 'docs/design/state-machine-correctness-analysis.md', title: '状态机与门禁策略' },
  { pattern: /(?:src|tests)\/.*(?:breadcrumb)/i, doc: 'docs/architecture/breadcrumb-task-level-architecture.md', title: 'Breadcrumb 架构' },
];

function checkLivingDocSync(cwd: string): void {
  try {
    const stdout = gitSync(cwd, ['status', '--porcelain']);
    const lines = stdout.split('\n').filter(Boolean);
    const hasDocChanges = lines.some((l: string) => /\s+docs\//.test(l));
    if (hasDocChanges) return;

    const changedFiles = lines
      .map((l: string) => l.slice(3).trim())
      .filter((f: string) => /^(?:src|lib|package\.json)/.test(f));

    if (changedFiles.length === 0) return;

    const suggestedDocs = new Set<string>();
    for (const file of changedFiles) {
      for (const mapping of LIVING_DOC_MAPPINGS) {
        if (mapping.pattern.test(file)) {
          suggestedDocs.add(`- ${mapping.doc} (${mapping.title})`);
        }
      }
    }

    if (suggestedDocs.size > 0) {
      console.log('💡  活文档提示: 本次任务修改了核心模块代码，建议同步更新关联文档:');
      for (const doc of suggestedDocs) {
        console.log(`   ${doc}`);
      }
    } else {
      console.log('💡  活文档提示: 本次任务包含核心代码变更但未修改 docs/，若产生持久契约请及时沉淀至 docs/');
    }
  } catch {
    // 忽略 git 检查异常
  }
}

async function archiveCurrentTask(
  docpathDir: string,
  taskId: string,
  currentTaskDir: string,
  archiveMode: 'always' | 'skip',
  quiet: boolean = false,
  dryRun: boolean = false,
): Promise<ArchiveResult> {
  const doneDir = join(docpathDir, 'tasks', 'done');
  const archiveDir = archivedTaskDir(docpathDir, taskId || 'unknown');
  if (archiveMode === 'skip') {
    if (!quiet) {
      const canonicalPath = `.docpath/tasks/${taskId || 'unknown'}/`;
      if (dryRun) {
        console.log('🔍  [dry-run] archive policy: skip（默认，不实际归档；canonical evidence 保留）');
        console.log(`   canonical evidence 将保留在 ${canonicalPath}，用于 docpath changes --agent / git closeout。`);
        console.log('   若要预览物理归档路径，运行: docpath journal --dry-run --optional-archive always');
      } else {
        console.log('⏭️  物理任务目录归档已延后（journal 默认行为，对齐 agent done）');
        console.log(`   这不是完成失败；逻辑完成与 journal 收尾仍会继续执行。`);
        console.log(`   canonical evidence 保留在 ${canonicalPath}，用于 docpath changes --agent / git closeout。`);
        console.log('   closeout 后可运行 docpath gc --force，将非活跃 canonical 任务目录移动到 .docpath/tasks/done/。');
        console.log('   如需 journal 同次归档（老行为），使用 --optional-archive=always。');
      }
    }
  } else {
    if (dryRun) {
      console.log('🔍  [dry-run] archive policy: always（将物理归档任务目录）');
      console.log(`🔍  [dry-run] 将归档: ${currentTaskDir} → ${archiveDir}`);
    }
    try {
      if (!existsSync(doneDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(doneDir, { recursive: true });
      }
      if (existsSync(currentTaskDir) && !existsSync(archiveDir) && !dryRun) {
        await rename(currentTaskDir, archiveDir);
        await clearCurrentTaskAlias(docpathDir);
        console.log(`📦 任务已归档: tasks/done/${taskId || 'unknown'}`);
      } else if (existsSync(archiveDir)) {
        console.log(`⚠️  归档目标已存在: ${archiveDir}，跳过`);
        if (!dryRun) await clearCurrentTaskAlias(docpathDir);
      }
    } catch (e) {
      console.warn('⚠️  归档失败（非致命）:', (e as Error).message);
    }
  }
  return {
    currentTaskDir,
    archivedTaskDir: archiveDir,
    taskDirName: taskId !== 'unknown' ? taskId : 'current',
  };
}

async function completeLinkedBacklog(
  cwd: string,
  taskId: string,
  specMarkdown: string,
  structuredSpec: StructuredSpecDocument | null,
): Promise<void> {
  try {
    const linkedBacklog = (await listBacklogItems(cwd)).find((item) =>
      item.links.task === taskId
      || (item.links.task === 'current' && item.status === 'active')
    );
    if (linkedBacklog) {
      if (shouldBackfillBacklogBody(linkedBacklog.body)) {
        linkedBacklog.body = renderBacklogBodyFromSpec(specMarkdown, structuredSpec, linkedBacklog.title);
      }
      linkedBacklog.evidence = {
        ...linkedBacklog.evidence,
        spec: linkedBacklog.evidence.spec || linkedBacklog.links.spec,
        decision_brief: linkedBacklog.evidence.decision_brief
          || structuredSpec?.major_change_gate.decision_brief_markdown
          || null,
        user_confirmed: linkedBacklog.evidence.user_confirmed
          || structuredSpec?.major_change_gate.user_confirmed
          || null,
      };
      linkedBacklog.readiness = linkedBacklog.evidence.user_confirmed ? 'confirmed' : 'analyzed';
      if (linkedBacklog.status !== 'done') {
        linkedBacklog.status = transitionBacklog(linkedBacklog.status, 'done');
      }
      await writeBacklogItem(cwd, linkedBacklog);
      // FR-1：写路径解耦后归档在「done」边界显式触发——journal 把条目翻成 done，须显式重建以「即归档」
      await refreshBacklogIndex(cwd);
      console.log(`🔁  backlog 已自动回填完成: ${linkedBacklog.id}`);
    }
  } catch (e) {
    console.warn('⚠️  backlog 自动回填失败（非致命）:', (e as Error).message);
  }
}

function shouldBackfillBacklogBody(body: string): boolean {
  if (!body.trim()) return true;
  const lines = body.split('\n');
  if (lines.some((line) => /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim()))) {
    return true;
  }
  // 如果正文只有极简的默认骨架（行数 <= 8 且没有结构化 FR），也应当回填沉淀真实规约
  return !/FR-\d+/i.test(body) && lines.length <= 8;
}

function renderBacklogBodyFromSpec(
  specMarkdown: string,
  structuredSpec: StructuredSpecDocument | null,
  fallbackTitle: string,
): string {
  const background = extractMarkdownSection(specMarkdown, '## 1. 背景与动机') || fallbackTitle;
  const functionalRequirements = structuredSpec?.functional_requirements ?? [];
  const scopeIncluded = structuredSpec?.scope.included ?? [];
  const scopeExcluded = structuredSpec?.scope.excluded ?? [];
  const acceptance = structuredSpec?.acceptance_criteria ?? [];
  const decisionBrief = structuredSpec?.major_change_gate.decision_brief_markdown?.trim();

  const lines = [
    '## 背景',
    '',
    background.trim(),
  ];

  if (functionalRequirements.length > 0) {
    lines.push(
      '',
      '## 功能要点',
      '',
      ...functionalRequirements.map((item) => `- [x] ${item.id}: ${item.text}`),
    );
  }

  lines.push(
    '',
    '## 范围',
    '',
    '### 包含',
    '',
    ...(scopeIncluded.length > 0 ? scopeIncluded.map((item) => `- ${item}`) : ['- 见 linked spec']),
    '',
    '### 不包含',
    '',
    ...(scopeExcluded.length > 0 ? scopeExcluded.map((item) => `- ${item}`) : ['- 见 linked spec']),
    '',
    '## 验收',
    '',
    ...(acceptance.length > 0
      ? acceptance.map((item) => `- [x] ${item.id}: ${item.text}`)
      : ['- 满足需求并通过全部门禁']),
  );

  if (decisionBrief) {
    lines.push('', '## 决策证据', '', decisionBrief);
  }

  return lines.join('\n');
}

function extractMarkdownSection(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(heading);
  if (start < 0) return null;
  const contentStart = start + heading.length;
  const next = markdown.slice(contentStart).search(/\n##\s+\d+\.\s+/);
  const raw = next >= 0
    ? markdown.slice(contentStart, contentStart + next)
    : markdown.slice(contentStart);
  return raw.trim() || null;
}

async function writeLessonCandidate(
  context: JournalContext,
  summary: TaskSummary,
): Promise<void> {
  // fail-loud guard：没有合法 task_id 的归档不该产生可固化的全局经验。
  // taskId 为 'unknown'/空通常是状态漂移或未绑定任务的征兆（见 docpath-go-taskid-gate）；
  // 容错写入只会在 lesson-candidates.md 留下 `## unknown` 孤儿块，污染后续 learn 固化。
  // 归档本身仍可继续（journal.ts:143 的容错保留），但 lesson 候选在此处显式跳过。
  const { docpathDir, taskId } = context;
  const normalizedTaskId = (taskId || '').trim();
  if (!normalizedTaskId || normalizedTaskId === 'unknown') {
    console.warn(`⚠️  跳过 lesson 候选写入：task_id 缺失或无效（taskId=${taskId || '<empty>'}）。请确认任务已正确绑定后再归档。`);
    return;
  }
  try {
    const lessonsPath = join(docpathDir, 'workspace', 'lesson-candidates.md');
    const now = new Date().toISOString();

    // 真实可固化内容：ADR 摘要 + decision_brief 推荐方案 + blocked 步骤。
    // 没有这些则退化为现状的执行统计模板。
    const adrCandidates = collectAdrCandidates(context, summary);
    const brief = resolveDecisionBrief(context);
    const briefRecommended = brief
      ? (extractBriefField(brief, '推荐方案') || extractBriefField(brief, '推荐'))
      : null;
    const blockedSteps = context.breadcrumb.entries
      .filter((e) => e.taskId === taskId && e.status === 'blocked')
      .map((e) => `- ${e.step}: ${e.context}`);

    // 无实质内容时跳过 lesson 候选写入，避免产生空壳 lesson
    if (!briefRecommended && adrCandidates.length === 0 && blockedSteps.length === 0) {
      console.log('📝  无 ADR/brief/blocked 内容，跳过 lesson 候选写入');
      return;
    }

    const lessonBody: string[] = [];
    if (briefRecommended) {
      lessonBody.push('', `### 推荐方案`, '', briefRecommended);
    }
    if (adrCandidates.length > 0) {
      lessonBody.push('', '### 架构决策摘要', '');
      for (const c of adrCandidates.slice(0, 5)) {
        lessonBody.push(`- ${c.title}: ${c.decision}`);
      }
    }
    if (blockedSteps.length > 0) {
      lessonBody.push('', '### 阻塞步骤（踩坑点）', '', ...blockedSteps);
    }

    const lessonLines = [
      `## ${taskId} — ${now}`,
      '',
      `- task_id: ${taskId}`,
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      `- key: ${taskId}-workflow`,
      '',
      '### Lesson',
      '',
      ...lessonBody,
      '',
      '### Evidence',
      '',
      '- .docpath/workspace/breadcrumb.md',
      '- .docpath/workspace/last-check.md',
      '',
      '---',
      '',
    ];
    const previous = existsSync(lessonsPath) ? await readFile(lessonsPath, 'utf-8') : '# Lesson Candidates\n\n';
    if (!previous.includes(`- key: ${taskId}-workflow`)) {
      await writeFile(lessonsPath, previous.trimEnd() + '\n\n' + lessonLines.join('\n'), 'utf-8');
      console.log('🧠  Lesson 候选已更新: workspace/lesson-candidates.md');
    }
  } catch (e) {
    console.warn('⚠️  Lesson 候选写入失败（非致命）:', (e as Error).message);
  }
}

async function updateWorkspaceMeta(docpathDir: string, meta: Record<string, unknown> | null): Promise<void> {
  if (meta) {
    meta.lastActive = new Date().toISOString();
    const metaPath = join(docpathDir, 'workspace.json');
    const { writeFile: wf } = await import('fs/promises');
    await wf(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}

function collectAdrCandidates(context: JournalContext, summary: TaskSummary): AdrCandidate[] {
  const candidates: AdrCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: AdrCandidate): void => {
    const key = c.title.toLowerCase();
    if (!c.title || seen.has(key) || isLowSignalAdrCandidate(c)) return;
    seen.add(key);
    candidates.push(c);
  };
  // 优先级: structured/markdown decision_brief > spec 关键决策表 > breadcrumb 关键词
  for (const c of extractAdrFromDecisionBrief(resolveDecisionBrief(context), context.current?.task_title || summary.taskId)) push(c);
  for (const c of extractAdrFromKeyDecisionsTable(context.spec)) push(c);
  for (const c of extractArchitectureDecisionCandidates(summary.keyDecisions)) push(c);
  return candidates;
}

async function writeJournalDecisions(
  cwd: string,
  taskDirName: string,
  summary: TaskSummary,
  context: JournalContext,
): Promise<void> {
  try {
    const candidates = collectAdrCandidates(context, summary);

    if (candidates.length === 0) {
      console.log('📝  未发现可复用 ADR，跳过 decisions.md 写入');
      return;
    }

    for (const candidate of candidates) {
      await appendDecision(cwd, 'architecture', candidate.decision, candidate.context, {
        taskId: summary.taskId,
        context: `从 journal 关键决策自动提取:\n${candidate.context}`,
        impact: '该架构取舍会影响后续实现与 review 判断。',
        alternatives: ['继续沿用旧实现', '仅记录到 breadcrumb，不生成 ADR'],
        relatedFiles: [
          '.docpath/workspace/breadcrumb.md',
          `.docpath/${canonicalTaskRelativePath(taskDirName, 'spec.md')}`,
          `.docpath/${canonicalTaskRelativePath(taskDirName, 'plan.md')}`,
        ],
      });
    }
    console.log('📝  决策日志已更新: workspace/decisions.md');
    console.log(`🏗️  已从 journal 提取 ${candidates.length} 条架构决策`);
  } catch (e) {
    console.warn('⚠️  决策日志写入失败（非致命）:', (e as Error).message);
  }
}

async function gcJournalDecisions(cwd: string, skipDecisionGc: boolean): Promise<void> {
  if (skipDecisionGc) {
    console.log('⏭️  decisions.md 老化已跳过 (--skip-gc)');
    return;
  }

  try {
    // Check if immediate gc is needed due to size bloat
    const docpathDir = await resolveDocpathDir(cwd);
    const workspaceDir = join(docpathDir, 'workspace');
    const decisionsPath = join(workspaceDir, 'decisions.md');

    let needsForceGc = false;
    if (existsSync(decisionsPath)) {
      const content = await readFile(decisionsPath, 'utf-8');
      const sizeKb = Buffer.byteLength(content, 'utf-8') / 1024;
      if (sizeKb > 100) {
        console.log(`⚠️  decisions.md 超过 100KB (${Math.round(sizeKb)}KB)，强制执行 gc`);
        needsForceGc = true;
      }
    }

    const files = await readdir(workspaceDir);
    for (const file of files) {
      if (/^decisions-\d{4}-\d{2}\.md$/.test(file)) {
        await splitArchiveIfBloated(workspaceDir, join(workspaceDir, file));
      }
    }

    const result = await gcDecisions(cwd, needsForceGc ? { retentionDays: 14, maxSizeKb: 100, maxRecords: 1000 } : {});
    if (result.archived > 0) {
      console.log(`🧹  decisions.md 已老化: 归档 ${result.archived} 条，保留 ${result.retained} 条`);
    }
  } catch (e) {
    console.warn('⚠️  decisions.md 老化失败（非致命）:', (e as Error).message);
  }

  // R-302: 全局 breadcrumb 窗口裁剪——truncateBreadcrumb 机制自建成起从未被接线，
  // 全局 jsonl 无界增长。任务级 canonical breadcrumb 保存完整历史，全局文件仅为
  // 活跃工作窗口，journal（任务收口）是天然裁剪点。
  try {
    const trimmed = await truncateBreadcrumb(cwd);
    if (trimmed > 0) {
      console.log(`🧹  全局 breadcrumb 已裁剪 ${trimmed} 条（窗口上限 ${MAX_ENTRIES}；任务级历史在 canonical 目录不受影响）`);
    }
  } catch (e) {
    console.warn('⚠️  breadcrumb 裁剪失败（非致命）:', (e as Error).message);
  }
}
