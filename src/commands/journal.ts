/**
 * docpath:journal — 知识归档 + 渐进式记忆固化
 *
 * 从完成的任务中提炼结构化知识，更新 spec.md 的架构决策记录。
 * 核心价值：让每一次开发都成为知识积累，而非一次性消耗。
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd, updateCurrentState, readWorkspaceMeta } from '../utils/workspace.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { emitPrompt } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';

interface JournalOptions {
  cwd: string;
  skipAi?: boolean;
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
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n📚  知识归档...\n');

  // ─── P0: verification 门禁 ───
  // 必须先运行 docpath:check 且状态为 check_pass 才允许归档
  const { readCurrentState: readStateForGate } = await import('../utils/workspace.js');
  const gateState = await readStateForGate(cwd);
  if (!gateState || (gateState.state !== 'check_pass' && gateState.state !== 'completed')) {
    console.error('❌  归档门禁未通过：当前状态为', gateState?.state || 'null');
    console.error('   请先运行 `docpath:check` 通过质量门禁，再执行归档。');
    process.exit(1);
  }

  const current = await readCurrentMd(cwd);
  const meta = await readWorkspaceMeta(cwd);
  const breadcrumb = await readBreadcrumb(cwd);
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const spec = existsSync(specPath) ? await readFile(specPath, 'utf-8') : '';
  const plan = existsSync(planPath) ? await readFile(planPath, 'utf-8') : '';

  const taskId = current?.task_id || 'unknown';
  const totalSteps = breadcrumb.entries.filter(e => e.taskId === taskId).length;
  const completedSteps = breadcrumb.entries.filter(e => e.taskId === taskId && e.status === 'done').length;
  const blockedSteps = breadcrumb.entries.filter(e => e.taskId === taskId && e.status === 'blocked').length;

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

  // 归档任务：将 tasks/current 移至 tasks/done/T-xxx
  const { renameSync, mkdirSync } = await import('fs');
  const currentTaskDir = join(docpathDir, 'tasks', 'current');
  const doneDir = join(docpathDir, 'tasks', 'done');
  const archiveDir = join(doneDir, taskId || 'unknown');
  try {
    if (!existsSync(doneDir)) mkdirSync(doneDir, { recursive: true });
    if (existsSync(currentTaskDir) && !existsSync(archiveDir)) {
      renameSync(currentTaskDir, archiveDir);
      console.log(`📦 任务已归档: tasks/done/${taskId || 'unknown'}`);
    }
  } catch (e) {
    console.warn('⚠️  归档失败（非致命）:', (e as Error).message);
  }

  await updateCurrentState(cwd, 'completed', { phase: 'archived' });

  await writeBreadcrumb(cwd, {
    taskId,
    step: 'journal',
    status: 'done',
    context: `知识归档完成 (${summary.completedSteps}/${summary.totalSteps} 步)`,
  });

  // 更新 workspace meta 计数
  if (meta) {
    meta.lastActive = new Date().toISOString();
    const metaPath = join(docpathDir, 'workspace.json');
    const { writeFile: wf } = await import('fs/promises');
    await wf(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  // ─── P1: 决策日志写入 ───
  // 归档时自动将本次任务的关键决策追加到 workspace/decisions.md
  try {
    const decisionsPath = join(docpathDir, 'workspace', 'decisions.md');
    const now = new Date().toISOString();
    const decisionLines = [
      ``,
      `## ${taskId} — ${now}`,
      '',
      `**任务统计**:`,
      `- 完成: ${summary.completedSteps}/${summary.totalSteps} 步`,
    ];
    if (summary.blockedSteps > 0) decisionLines.push(`- 阻塞: ${summary.blockedSteps} 步`);
    decisionLines.push('', '**关键决策**:');
    for (const d of summary.keyDecisions) {
      if (d.trim()) decisionLines.push(`- ${d}`);
    }
    decisionLines.push('', '---', '');

    const decisionsContent = decisionLines.join('\n');

    if (existsSync(decisionsPath)) {
      const { appendFile } = await import('fs/promises');
      await appendFile(decisionsPath, decisionsContent, 'utf-8');
    } else {
      const header = '# 决策日志 — DocPath 自动归档\n\n> 每次 journal 归档时自动追加任务的关键决策记录。\n\n---\n';
      await writeFile(decisionsPath, header + decisionsContent, 'utf-8');
    }
    console.log('📝  决策日志已更新: workspace/decisions.md');
  } catch (e) {
    console.warn('⚠️  决策日志写入失败（非致命）:', (e as Error).message);
  }

  console.log('─── 完成 ───');
  console.log('所有步骤已归档。运行 `docpath:init` 开始新任务。\n');
}
