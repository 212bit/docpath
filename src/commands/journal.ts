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
import { callLLM } from '../llm/client.js';
import { resolveDocpathDir } from '../utils/file.js';

interface JournalOptions {
  cwd: string;
  /** 跳过 LLM，直接写入模板 */
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

  let journalEntry = '';

  if (!skipAi) {
    try {
      const result = await callLLM({
        system: '你是知识管理专家。请从以下开发任务中提炼结构化知识记录。',
        messages: [{
          role: 'user',
          content: `## 原始规约
${spec.slice(0, 3000)}

## 执行计划
${plan.slice(0, 2000)}

## 面包屑历史 (全部)
${breadcrumb.entries.map(e => `- [${e.status}] ${e.step}: ${e.context}`).join('\n')}

## 任务统计
- 总步数: ${summary.totalSteps}
- 完成: ${summary.completedSteps}
- 阻塞: ${summary.blockedSteps}

请输出：

### 📝 任务摘要
(一句话)

### 🏗️ 架构决策
- 决策1: 原因
- 决策2: 原因

### 💡 经验教训
- 教训1
- 教训2

### 🔮 后续改进
- 改进1
- 改进2`
        }],
        maxTokens: 1500,
      });

      journalEntry = result.content;
      console.log('─── 知识记录 ───\n');
      console.log(journalEntry);
    } catch (err: any) {
      console.warn(`⚠️  LLM 归档失败: ${err.message}，使用模板归档`);
    }
  }

  // Fallback: 模板
  if (!journalEntry) {
    journalEntry = `### 📝 任务摘要
任务 ${summary.taskId} 完成 ${summary.completedSteps}/${summary.totalSteps} 步。

### 🏗️ 架构决策
(待补充)

### 💡 经验教训
(待补充)

### 🔮 后续改进
(待补充)`;
  }

  // 写入 spec.md
  if (existsSync(specPath)) {
    const timestamp = new Date().toISOString().slice(0, 16);
    const record = `\n\n## 开发记录: ${summary.taskId} (${timestamp})\n\n${journalEntry}\n`;
    let updatedSpec = spec;
    if (!updatedSpec.includes('## 项目概述')) {
      updatedSpec = `# 项目架构规范\n\n## 项目概述\n\n(自动生成)\n\n${record}`;
    } else {
      updatedSpec += record;
    }
    await writeFile(specPath, updatedSpec, 'utf-8');
    console.log('✅  知识已归档到 spec.md\n');
  } else {
    console.log('⚠️  spec.md 不存在，跳过归档\n');
  }

  await updateCurrentState(cwd, 'complete');

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

  console.log('─── 完成 ───');
  console.log('所有步骤已归档。运行 `docpath:init` 开始新任务。\n');
}
