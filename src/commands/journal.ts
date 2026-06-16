/**
 * docpath:journal — 知识归档 + 渐进式记忆固化
 *
 * 从完成的任务中提炼结构化知识，更新 spec.md 的架构决策记录。
 * 核心价值：让每一次开发都成为知识积累，而非一次性消耗。
 */

import { existsSync } from 'fs';
import { readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { readCurrentState, readWorkspaceMeta, parsePlanTasks, type CurrentState } from '../utils/workspace.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { emitPrompt } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { evaluateCompletionPolicy } from '../engine/policy.js';
import { appendDecision, gcDecisions } from '../governance/decisions.js';
import { listBacklogItems, transitionBacklog, writeBacklogItem } from '../engine/backlog.js';
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
import { emitNextHint } from '../utils/next-hint.js';

interface JournalOptions {
  cwd: string;
  skipAi?: boolean;
  skipDecisionGc?: boolean;
  /** Suppress prompt contract output when journal runs as an automatic closeout sub-step. */
  quietPrompt?: boolean;
  /** 归档模式: 'always' = 默认行为 | 'skip' = 跳过归档 | 'dry-run' = 预览归档 */
  archiveMode?: 'always' | 'skip' | 'dry-run';
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

export async function journalCommand(options: JournalOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n📚  知识归档...\n');

  await assertJournalGate(cwd);

  const context = await loadJournalContext(cwd, docpathDir);
  const summary = await buildTaskSummary(context);

  console.log(`📌  任务: ${summary.taskId}`);
  console.log(`📊  步骤: ${summary.completedSteps}/${summary.totalSteps} 完成, ${summary.blockedSteps} 阻塞`);
  console.log(`⏱️  耗时: ${summary.duration}\n`);

  if (options.quietPrompt) {
    console.log('📝  journal prompt 已收敛（自动 closeout）；任务 evidence、lesson candidates 与 backlog 状态仍会写入。');
    console.log('    如需手动生成完整知识记录，可单独运行: docpath journal\n');
  } else {
    emitJournalPrompt(context, summary);
    console.log('📌 完成后运行: docpath write-journal\n');
  }

  const archiveMode = options.archiveMode || 'always';
  const archive = await archiveCurrentTask(docpathDir, context.taskId, context.taskDir, archiveMode);
  if (archiveMode === 'dry-run') {
    printJournalDryRunComplete();
    return;
  }

  await finalizeJournal(cwd, context, archive, summary, !!options.skipDecisionGc);
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

function emitJournalPrompt(context: JournalContext, summary: TaskSummary): void {
  emitPrompt({
    task: 'journal',
    system: '你是知识管理专家。请从以下开发任务中提炼结构化知识记录。',
    context: {
      '原始规约': context.spec.slice(0, 3000),
      '执行计划': context.plan.slice(0, 2000),
      '面包屑历史': context.breadcrumb.entries
        .filter(e => e.taskId === context.taskId)
        .map(e => `- [${e.status}] ${e.step}: ${e.context}`)
        .join('\n'),
      '任务统计': `总步数: ${summary.totalSteps}, 完成: ${summary.completedSteps}, 阻塞: ${summary.blockedSteps}`,
    },
    instructions: [
      '请输出知识记录：',
      '',
      '### 📝 任务摘要',
      '(一句话)',
      '',
      '### 🏗️ 架构决策',
      '- 决策1: 原因',
      '',
      '### 💡 经验教训',
      '- 教训1',
      '',
      '### 🔮 后续改进',
      '- 改进1',
      '',
      '完成后写入 spec.md: docpath write-journal',
    ],
    output_format: 'knowledge record (markdown)',
  });
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
): Promise<void> {
  await transitionWorkflow(cwd, 'journal.archived', { currentStep: '知识归档完成' });
  await completeLinkedBacklog(cwd, context.taskId, context.spec, context.structuredSpec);
  await writeBreadcrumb(cwd, {
    taskId: context.taskId,
    step: 'journal',
    status: 'done',
    context: `知识归档完成 (${summary.completedSteps}/${summary.totalSteps} 步)`,
  });
  await writeLessonCandidate(context.docpathDir, context.taskId, summary);
  await updateWorkspaceMeta(context.docpathDir, context.meta);
  await writeJournalDecisions(cwd, archive.taskDirName, summary);
  await gcJournalDecisions(cwd, skipDecisionGc);
  console.log('─── 完成 ───');
  console.log('所有步骤已归档。运行 `docpath init` 开始新任务。');
  await emitNextHint(cwd);
}

async function archiveCurrentTask(
  docpathDir: string,
  taskId: string,
  currentTaskDir: string,
  archiveMode: NonNullable<JournalOptions['archiveMode']>,
): Promise<ArchiveResult> {
  const doneDir = join(docpathDir, 'tasks', 'done');
  const archiveDir = archivedTaskDir(docpathDir, taskId || 'unknown');
  if (archiveMode === 'skip') {
    const canonicalPath = `.docpath/tasks/${taskId || 'unknown'}/`;
    console.log('⏭️  物理任务目录归档已延后 (--optional-archive=skip)');
    console.log(`   这不是完成失败；逻辑完成与 journal 收尾仍会继续执行。`);
    console.log(`   canonical evidence 保留在 ${canonicalPath}，用于 docpath changes --agent / git closeout。`);
    console.log('   closeout 后可运行 docpath gc --force，将非活跃 canonical 任务目录移动到 .docpath/tasks/done/。');
  } else {
    if (archiveMode === 'dry-run') console.log(`🔍  [dry-run] 将归档: ${currentTaskDir} → ${archiveDir}`);
    try {
      if (!existsSync(doneDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(doneDir, { recursive: true });
      }
      if (existsSync(currentTaskDir) && !existsSync(archiveDir) && archiveMode !== 'dry-run') {
        await rename(currentTaskDir, archiveDir);
        await clearCurrentTaskAlias(docpathDir);
        console.log(`📦 任务已归档: tasks/done/${taskId || 'unknown'}`);
      } else if (existsSync(archiveDir)) {
        console.log(`⚠️  归档目标已存在: ${archiveDir}，跳过`);
        if (archiveMode !== 'dry-run') await clearCurrentTaskAlias(docpathDir);
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
      console.log(`🔁  backlog 已自动回填完成: ${linkedBacklog.id}`);
    }
  } catch (e) {
    console.warn('⚠️  backlog 自动回填失败（非致命）:', (e as Error).message);
  }
}

function shouldBackfillBacklogBody(body: string): boolean {
  if (!body.trim()) return true;
  return body.split('\n').some((line) =>
    /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
  );
}

function renderBacklogBodyFromSpec(
  specMarkdown: string,
  structuredSpec: StructuredSpecDocument | null,
  fallbackTitle: string,
): string {
  const background = extractMarkdownSection(specMarkdown, '## 1. 背景与动机') || fallbackTitle;
  const scopeIncluded = structuredSpec?.scope.included ?? [];
  const scopeExcluded = structuredSpec?.scope.excluded ?? [];
  const acceptance = structuredSpec?.acceptance_criteria ?? [];
  const decisionBrief = structuredSpec?.major_change_gate.decision_brief_markdown?.trim();
  const lines = [
    '## 背景',
    '',
    background.trim(),
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
      ? acceptance.map((item) => `- ${item.id}: ${item.text}`)
      : ['- 见 linked spec']),
  ];

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

async function writeLessonCandidate(docpathDir: string, taskId: string, summary: TaskSummary): Promise<void> {
  // fail-loud guard：没有合法 task_id 的归档不该产生可固化的全局经验。
  // taskId 为 'unknown'/空通常是状态漂移或未绑定任务的征兆（见 docpath-go-taskid-gate）；
  // 容错写入只会在 lesson-candidates.md 留下 `## unknown` 孤儿块，污染后续 learn 固化。
  // 归档本身仍可继续（journal.ts:143 的容错保留），但 lesson 候选在此处显式跳过。
  const normalizedTaskId = (taskId || '').trim();
  if (!normalizedTaskId || normalizedTaskId === 'unknown') {
    console.warn(`⚠️  跳过 lesson 候选写入：task_id 缺失或无效（taskId=${taskId || '<empty>'}）。请确认任务已正确绑定后再归档。`);
    return;
  }
  try {
    const lessonsPath = join(docpathDir, 'workspace', 'lesson-candidates.md');
    const now = new Date().toISOString();
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
      `✅ 推荐保留本次任务的执行经验：完成 ${summary.completedSteps}/${summary.totalSteps} 步，阻塞 ${summary.blockedSteps} 步。`,
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

async function writeJournalDecisions(cwd: string, taskDirName: string, summary: TaskSummary): Promise<void> {
  try {
    const architectureDecisions = extractArchitectureDecisionCandidates(summary.keyDecisions);
    if (architectureDecisions.length === 0) {
      console.log('📝  未发现可复用 ADR，跳过 decisions.md 写入');
      return;
    }

    for (const candidate of architectureDecisions) {
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
    console.log(`🏗️  已从 journal 提取 ${architectureDecisions.length} 条架构决策`);
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
    const result = await gcDecisions(cwd);
    if (result.archived > 0) {
      console.log(`🧹  decisions.md 已老化: 归档 ${result.archived} 条，保留 ${result.retained} 条`);
    }
  } catch (e) {
    console.warn('⚠️  decisions.md 老化失败（非致命）:', (e as Error).message);
  }
}
