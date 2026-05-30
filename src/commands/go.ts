/**
 * docpath:go — 按 plan.md 逐个执行子任务
 *
 * 读取 .docpath/tasks/current/plan.md，解析子任务列表，
 * 找到下一个未完成的子任务，输出执行上下文供 Claude Code Agent 消费。
 *
 * Level 0-1: 直接输出子任务描述 + 验收条件
 * Level 2+: 输出结构化上下文 (含 breadcrumb 历史 + 依赖图)
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { readBreadcrumb, writeBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';

interface GoOptions {
  cwd: string;
  /** 指定子任务编号 (e.g. S1)，不指定则自动找下一个 */
  step?: string;
  /** 仅输出上下文，不更新状态 */
  dryRun?: boolean;
}

/**
 * 解析 plan.md 中的子任务列表
 * 支持格式: ### S1: 名称 / - [ ] 任务 / - [x] 已完成
 */
function parseSubTasks(planContent: string): Array<{
  id: string;
  name: string;
  description: string;
  acceptance: string;
  dependencies: string;
  done: boolean;
}> {
  const tasks: Array<{
    id: string;
    name: string;
    description: string;
    acceptance: string;
    dependencies: string;
    done: boolean;
  }> = [];

  // 匹配 ### S1: 名称 格式
  const sectionRegex = /^###\s+(S\d+(?:\.\d+)?)[：:]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  const sections: Array<{ index: number; id: string; name: string }> = [];

  while ((match = sectionRegex.exec(planContent)) !== null) {
    sections.push({ index: match.index, id: match[1], name: match[2].trim() });
  }

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const blockEnd = i + 1 < sections.length ? sections[i + 1].index : planContent.length;
    const block = planContent.slice(sec.index, blockEnd);

    const descMatch = block.match(/- \*\*描述\*\*[:：]\s*(.+)/);
    const accMatch = block.match(/- \*\*验收条件\*\*[:：]\s*(.+)/);
    const depMatch = block.match(/- \*\*依赖\*\*[:：]\s*(.+)/);
    const doneMatch = block.match(/- \[x\]/i);

    tasks.push({
      id: sec.id,
      name: sec.name,
      description: descMatch?.[1]?.trim() || '',
      acceptance: accMatch?.[1]?.trim() || '',
      dependencies: depMatch?.[1]?.trim() || '无',
      done: !!doneMatch,
    });
  }

  // Fallback: 匹配 - [ ] / - [x] 格式
  if (tasks.length === 0) {
    const checkboxRegex = /^- \[([ x])\]\s*(?:\*\*(S\d+(?:\.\d+)?)\*\*[:：]?\s*)?(.+)$/gmi;
    while ((match = checkboxRegex.exec(planContent)) !== null) {
      tasks.push({
        id: match[2] || `T${tasks.length + 1}`,
        name: match[3].trim(),
        description: match[3].trim(),
        acceptance: '',
        dependencies: '无',
        done: match[1].toLowerCase() === 'x',
      });
    }
  }

  return tasks;
}


// ── Verification Gate: 防止跳过 check 直接标记完成 ──

async function verifyBeforeCompletion(cwd: string, docpathDir: string): Promise<{ allowed: boolean; reason: string }> {
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (!existsSync(statePath)) return { allowed: true, reason: '无 state.json' };

  const state = JSON.parse(await readFile(statePath, 'utf-8'));

  // 如果上次 check 是 fail，阻止完成
  if (state.state === 'check_fail') {
    return { allowed: false, reason: '上次 check 失败，请先修复并重新运行 docpath check' };
  }

  // 检查 last-check.md 是否存在且是 pass
  const lastCheckPath = join(docpathDir, 'workspace', 'last-check.md');
  if (existsSync(lastCheckPath)) {
    const checkContent = await readFile(lastCheckPath, 'utf-8');
    if (checkContent.includes('❌ FAIL')) {
      return { allowed: false, reason: 'last-check.md 记录了失败项，请先修复' };
    }
  }

  return { allowed: true, reason: 'check_pass' };
}

export async function goCommand(options: GoOptions): Promise<void> {
  const { cwd, step, dryRun } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const tasksDir = join(docpathDir, 'tasks', 'current');
  const planPath = join(tasksDir, 'plan.md');
  const specPath = join(tasksDir, 'spec.md');

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (!existsSync(planPath)) {
    console.error('❌  未找到 plan.md。请先运行 `docpath:plan` 生成计划。');
    process.exit(1);
  }

  // 从 spec.md 提取 task_id 和 task_title，同步到 current.md
  const extraFields: Record<string, string> = {};
  if (existsSync(specPath)) {
    const specContent = await readFile(specPath, 'utf-8');
    const idMatch = specContent.match(/^#\s+(T-\S+)/m);
    if (idMatch) {
      extraFields.task_id = idMatch[1];
    }
    const titleMatch = specContent.match(/^#\s+T-\S+\s*[-—:]\s*(.+)/m);
    if (titleMatch) {
      extraFields.task_title = titleMatch[1].trim();
    }
  }

  const planContent = await readFile(planPath, 'utf-8');
  const tasks = parseSubTasks(planContent);

  if (tasks.length === 0) {
    console.error('❌  plan.md 中未找到子任务。格式须为 `### S1: 名称` 或 `- [ ] 任务`');
    process.exit(1);
  }

  // 找到目标子任务
  let target = step
    ? tasks.find(t => t.id.toLowerCase() === step.toLowerCase())
    : tasks.find(t => !t.done);

  if (!target) {
    if (tasks.every(t => t.done)) {
      console.log('🎉  所有子任务已完成！运行 `docpath:check` 进行质量检查。\n');
      return;
    }
    console.error(`❌  未找到子任务: ${step}`);
    process.exit(1);
  }

  const current = await readCurrentMd(cwd);
  const level = current?.level || 0;

  // Level 0-1: 简单输出
  // Level 2+: 结构化上下文 + breadcrumb 历史
  console.log('\n🚀  执行子任务\n');
  console.log(`📌  子任务: ${target.id} — ${target.name}`);
  console.log(`📋  描述: ${target.description}`);
  console.log(`✅  验收: ${target.acceptance}`);
  console.log(`🔗  依赖: ${target.dependencies}`);
  console.log(`📊  当前级别: Level ${level}\n`);

  if (level >= 2) {
    // 输出 breadcrumb 历史摘要
    const breadcrumb = await readBreadcrumb(cwd);
    if (breadcrumb.entries.length > 0) {
      console.log('─── 执行历史 ───');
      for (const entry of breadcrumb.entries.slice(-5)) {
        const emoji = entry.status === 'done' ? '✅' : entry.status === 'in_progress' ? '🔄' : '🚫';
        console.log(`  ${emoji} ${entry.step}: ${entry.context}`);
      }
      console.log('');
    }

    // 输出剩余任务概览
    const remaining = tasks.filter(t => !t.done);
    console.log(`─── 进度: ${tasks.length - remaining.length}/${tasks.length} 完成 ───`);
    for (const t of tasks) {
      const mark = t.done ? '✅' : t.id === target.id ? '👉' : '⬜';
      console.log(`  ${mark} ${t.id}: ${t.name}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('📝  [dry-run] 仅预览，不更新状态\n');
    return;
  }

  // 更新 breadcrumb
  await writeBreadcrumb(cwd, {
    taskId: current?.task_id || 'unknown',
    step: target.id,
    status: 'in_progress',
    context: `开始执行: ${target.name}`,
  });

  // 更新 current.md：phase 表示工作流阶段，current_step 表示正在执行的子任务
  await updateCurrentState(cwd, 'executing', {
    phase: 'executing',
    current_step: target.id,
    started_at: new Date().toISOString(),
    ...extraFields,
  });

  console.log('─── Claude Code 指令 ───');
  console.log('请执行子任务 ' + target.id + '，完成后运行 `docpath:agent step --step ' + target.id + ' --auto-next` 自动标记完成并加载下一个任务。');

  console.log('');
}
