/**
 * docpath:continue — 断线重连 + 子任务推进
 *
 * 核心流程：
 *   1. 读取 breadcrumb.md 最后一条记录，恢复上下文
 *   2. 读取 current.md 状态，判断下一步动作
 *   3. 如果有未完成的子任务 → 继续执行
 *   4. 如果所有子任务完成 → 触发 check 命令
 *   5. 自动判断是否需要升级 level
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { getLatestEntry } from '../engine/breadcrumb.js';
import { evaluateEscalation } from '../engine/escalation.js';

interface ContinueOptions {
  cwd: string;
  verbose?: boolean;
}

/**
 * 从断点恢复上下文
 */
async function resumeContext(cwd: string): Promise<void> {
  const breadcrumbPath = join(cwd, '.docpath', 'workspace', 'breadcrumb.md');

  console.log('🔄  恢复断点上下文...\n');

  // 读取 breadcrumb 最后一条
  if (existsSync(breadcrumbPath)) {
    const breadcrumbContent = await readFile(breadcrumbPath, 'utf-8');
    const entries = parseBreadcrumbEntries(breadcrumbContent);
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      console.log(`📍  最新面包屑: ${latest.taskId}`);
      console.log(`   状态: ${latest.status}`);
      console.log(`   上下文: ${latest.context}\n`);
    }
  }

  // 读取 current.md 状态
  const current = await readCurrentMd(cwd);
  if (current) {
    console.log(`📌  当前状态: ${current.state}`);
    console.log(`   任务: ${current.task_title} (${current.task_id})`);
    console.log(`   阶段: ${current.phase}\n`);

    // 根据状态给出下一步建议
    const nextAction = getNextAction(current.state);
    console.log(`👉  建议下一步: ${nextAction}\n`);
  }
}

/**
 * 状态 → 下一步动作映射
 */
function getNextAction(state: string): string {
  const actions: Record<string, string> = {
    'idle': '运行 `docpath:brainstorm` 开始新任务',
    'brainstorming': '继续回答 AI 的需求提问',
    'spec_written': '运行 `docpath:plan` 生成执行计划',
    'planning_done': '开始执行第一个子任务',
    'executing': '继续执行当前子任务',
    'build_pass': '运行 `docpath:check` 进行质量审查',
    'review_pass': '运行 `docpath:check` 最终验收',
  };
  return actions[state] || '查看 .docpath/workspace/current.md 确认当前状态';
}

/**
 * 解析 breadcrumb 条目
 */
function parseBreadcrumbEntries(content: string): Array<{
  taskId: string;
  status: string;
  context: string;
}> {
  const entries: Array<{ taskId: string; status: string; context: string }> = [];
  const blocks = content.split(/^### /m).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    const header = lines[0];
    const taskIdMatch = header.match(/\[([^\]]+)\]/);
    if (!taskIdMatch) continue;

    const taskId = taskIdMatch[1];
    let status = 'unknown';
    let context = '';

    for (const line of lines.slice(1)) {
      const clean = line.replace(/^[-*]\s*/, '').trim();
      if (clean.startsWith('**状态**:')) status = clean.split(':')[1].trim();
      if (clean.startsWith('**上下文**:')) context = clean.split(':').slice(1).join(':').trim();
    }

    entries.push({ taskId, status, context });
  }

  return entries;
}

export async function continueCommand(options: ContinueOptions): Promise<void> {
  const { cwd, verbose } = options;
  const docpathDir = join(cwd, '.docpath');

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  // 1. 恢复上下文
  await resumeContext(cwd);

  // 2. 检查是否需要升级
  const current = await readCurrentMd(cwd);
  if (current) {
    const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');

    let specContent: string | undefined;
    let planContent: string | undefined;
    try { specContent = await readFile(specPath, 'utf-8'); } catch { /* no spec yet */ }
    try { planContent = await readFile(planPath, 'utf-8'); } catch { /* no plan yet */ }

    const taskDescription = [specContent, planContent].filter(Boolean).join('\n\n') || 'unknown task';
    const escalation = evaluateEscalation(
      taskDescription,
      current.level as any,
      current.state,
      current.started_at,
    );

    if (escalation.action !== 'no_change') {
      console.log(`🚀  建议升级: Level ${escalation.finalLevel}`);
      console.log(`   原因: ${escalation.reason}\n`);

      // 自动升级
      await updateCurrentState(cwd, current.state, {
        level: String(escalation.finalLevel),
      });
      console.log(`✅  已升级到 Level ${escalation.finalLevel}\n`);
    }
  }

  // 3. 提示下一步
  console.log('─── 下一步操作 ───');
  if (current?.state === 'planning_done' || current?.state === 'executing') {
    console.log('执行当前子任务，完成后运行:');
    console.log('  docpath:continue   （推进到下一个子任务）');
    console.log('  docpath:check      （执行质量检查）');
  }
  if (current?.state === 'build_pass' || current?.state === 'review_pass') {
    console.log('运行质量审查:');
    console.log('  docpath:check      （执行 check）');
  }
}
