/**
 * docpath:journal — 知识归档 + 渐进式记忆固化
 *
 * 从完成的任务中提炼结构化知识，更新 spec.md 的架构决策记录。
 * 核心价值：让每一次开发都成为知识积累，而非一次性消耗。
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd, readWorkspaceMeta, readOptionalFile, parsePlanTasks } from '../utils/workspace.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { emitPrompt } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { evaluateCompletionPolicy } from '../engine/policy.js';
import { appendDecision } from '../governance/decisions.js';

interface JournalOptions {
  cwd: string;
  skipAi?: boolean;
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

export async function journalCommand(options: JournalOptions): Promise<void> {
  const { cwd, skipAi } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n📚  知识归档...\n');

  // ─── P0: verification 门禁 ───
  const gateVerdict = await evaluateCompletionPolicy(cwd);
  if (!gateVerdict.allowed) {
    console.error('❌  归档门禁未通过');
    for (const reason of gateVerdict.reasons) console.error(`   - ${reason}`);
    process.exit(1);
  }

  const current = await readCurrentMd(cwd);
  const taskId = current?.task_id || 'unknown';
  const taskDirName = taskId !== 'unknown' ? taskId : 'current';
  const taskDir = existsSync(join(docpathDir, 'tasks', taskDirName))
    ? join(docpathDir, 'tasks', taskDirName)
    : join(docpathDir, 'tasks', 'current');
  const specPath = join(taskDir, 'spec.md');
  const planPath = join(taskDir, 'plan.md');
  const meta = await readWorkspaceMeta(cwd);
  const breadcrumb = await readBreadcrumb(cwd);
  const spec = existsSync(specPath) ? await readFile(specPath, 'utf-8') : '';
  const plan = existsSync(planPath) ? await readFile(planPath, 'utf-8') : '';

  // 步骤统计：优先使用 plan checklist；若 checklist 尚未维护，则回退到当前任务每个 step 的最新 breadcrumb 状态
  const planContent = await readOptionalFile(planPath);
  const planTasks = planContent ? parsePlanTasks(planContent) : [];
  const latestByStep = new Map<string, (typeof breadcrumb.entries)[number]>();
  for (const entry of breadcrumb.entries.filter(e => e.taskId === taskId)) {
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

  const summary: TaskSummary = {
    taskId,
    totalSteps,
    completedSteps,
    blockedSteps,
    keyDecisions: breadcrumb.entries.filter(e => e.taskId === taskId).map(e => e.context),
    duration: totalSteps > 0 ? `${totalSteps} 步` : 'N/A',
  };

  console.log(`📌  任务: ${summary.taskId}`);
  console.log(`📊  步骤: ${summary.completedSteps}/${summary.totalSteps} 完成, ${summary.blockedSteps} 阻塞`);
  console.log(`⏱️  耗时: ${summary.duration}\n`);

  // [Agent Mode] 输出归档 prompt，由宿主 Agent 填充知识记录后写入 spec.md
  emitPrompt({
    task: 'journal',
    system: '你是知识管理专家。请从以下开发任务中提炼结构化知识记录。',
    context: {
      '原始规约': spec.slice(0, 3000),
      '执行计划': plan.slice(0, 2000),
      '面包屑历史': breadcrumb.entries
        .filter(e => e.taskId === taskId)
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

  console.log('📌 完成后运行: docpath write-journal\n');

  // ── 可选归档（借鉴 GSD archive-before-new） ──
  const archiveMode = options.archiveMode || 'always';
  const { renameSync, mkdirSync } = await import('fs');
  const currentTaskDir = taskDir;
  const doneDir = join(docpathDir, 'tasks', 'done');
  const archiveDir = join(doneDir, taskId || 'unknown');

  if (archiveMode === 'skip') {
    console.log('⏭️  归档已跳过 (--optional-archive=skip)');
  } else {
    if (archiveMode === 'dry-run') {
      console.log(`🔍  [dry-run] 将归档: ${currentTaskDir} → ${archiveDir}`);
    }
    try {
      if (!existsSync(doneDir)) mkdirSync(doneDir, { recursive: true });
      if (existsSync(currentTaskDir) && !existsSync(archiveDir)) {
        if (archiveMode !== 'dry-run') {
          renameSync(currentTaskDir, archiveDir);
          console.log(`📦 任务已归档: tasks/done/${taskId || 'unknown'}`);
        }
      } else if (existsSync(archiveDir)) {
        console.log(`⚠️  归档目标已存在: ${archiveDir}，跳过`);
      }
    } catch (e) {
      console.warn('⚠️  归档失败（非致命）:', (e as Error).message);
    }
  }

  if (archiveMode === 'dry-run') {
    console.log('🔍  [dry-run] 不写入状态、breadcrumb 或决策日志');
    console.log('─── 完成 ───');
    console.log('dry-run 完成，未修改任务状态。\n');
    return;
  }

  await transitionWorkflow(cwd, 'journal.archived', { currentStep: '知识归档完成' });

  await writeBreadcrumb(cwd, {
    taskId,
    step: 'journal',
    status: 'done',
    context: `知识归档完成 (${summary.completedSteps}/${summary.totalSteps} 步)`,
  });

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

  // 更新 workspace meta 计数
  if (meta) {
    meta.lastActive = new Date().toISOString();
    const metaPath = join(docpathDir, 'workspace.json');
    const { writeFile: wf } = await import('fs/promises');
    await wf(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  // ─── P2.1: 决策日志写入 ───
  // 归档时自动将本次任务摘要追加为结构化 ADR decision。
  try {
    await appendDecision(cwd, 'journal.archive', `归档任务 ${taskId}`, `完成 ${summary.completedSteps}/${summary.totalSteps} 步，阻塞 ${summary.blockedSteps} 步`, {
      taskId,
      context: summary.keyDecisions.filter((d) => d.trim()).join('\n') || '任务完成后由 journal 自动归档。',
      impact: `任务进入归档状态；完成 ${summary.completedSteps}/${summary.totalSteps} 步，阻塞 ${summary.blockedSteps} 步。`,
      alternatives: ['继续保留在 tasks/current 中', '只写 breadcrumb 不生成长期 decision'],
      relatedFiles: [
        '.docpath/workspace/breadcrumb.md',
        '.docpath/workspace/last-check.md',
        `.docpath/tasks/${taskDirName}/spec.md`,
        `.docpath/tasks/${taskDirName}/plan.md`,
      ],
    });
    console.log('📝  决策日志已更新: workspace/decisions.md');
  } catch (e) {
    console.warn('⚠️  决策日志写入失败（非致命）:', (e as Error).message);
  }

  console.log('─── 完成 ───');
  console.log('所有步骤已归档。运行 `docpath:init` 开始新任务。\n');
}
