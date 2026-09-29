/**
 * docpath start — 任务一键拉起并认领启动（冷启动聚合）
 *
 * 聚合 backlog promote -> plan -> go --step S1：
 * 1. 从 backlog promote 活跃任务（创建 spec 等）
 * 2. 自动生成/同步执行计划（plan.md / plan.json）
 * 3. 认领并启动第一步（默认 go --step S1）
 *
 * 减少冷启动阶段 3 次工具调用往返。
 */

import { backlogCommand } from './backlog.js';
import { planCommand } from './plan.js';
import { goCommand } from './go.js';
import { readCurrentState } from '../utils/workspace.js';
import { createBacklogItem, refreshBacklogIndex } from '../engine/backlog.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readActiveTaskFile } from '../utils/task-files.js';
import { parsePlanSteps } from '../utils/doc-parser.js';

export interface StartOptions {
  cwd: string;
  id?: string;
  step?: string;
  draft?: boolean;
  agent?: boolean;
  adopt?: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const { cwd } = options;
  let targetId = options.id?.trim();
  if (!targetId) {
    throw new Error('docpath start 需要提供 Backlog 条目 ID 或任务标题，例如: docpath start R-101 或 docpath start "优化生命周期"');
  }

  // 1. 活跃任务冲突前置拦截：已有进行中任务时禁止重复 start 覆盖
  const current = await readCurrentState(cwd);
  if (current && current.phase !== 'idle' && current.phase !== 'completed' && !options.adopt) {
    throw new Error(
      `docpath start: 当前已有活跃任务 ${current.task_id}（phase=${current.phase}），禁止重复启动。\n` +
      `   如需结束当前任务请先运行 docpath done，或运行 docpath task reset/abort。\n` +
      `   若需并发进行多任务开发，请创建隔离工作区: docpath worktree create <name>`
    );
  }

  // 2. 脏工作区前置拦截：未显式指定 --adopt 时严格禁止在 dirty worktree 上启动新任务
  if (!options.adopt) {
    assertCleanWorktreeForNewTask(cwd, 'docpath start');
  }

  let isTitle = false;
  // 如果传入的不是 R-xxx 格式，则判定为按标题一键拉起新任务（自动捕获 Backlog）
  if (!/^R-\d+$/i.test(targetId)) {
    isTitle = true;
    const title = targetId;
    console.log(`💡  检测到任务标题 "${title}"，自动创建 Backlog 并一键拉起...\n`);
    const item = await createBacklogItem(cwd, {
      title,
      status: 'proposed',
      priority: 'P2',
      level: 2,
      source: 'docpath start',
      readiness: 'raw',
      evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
      links: { task: null, spec: null },
      created_at: new Date().toISOString().slice(0, 10),
      body: `## 背景\n\n- ${title}\n\n## 验收\n\n- 满足需求并通过门禁`,
    });
    await refreshBacklogIndex(cwd);
    targetId = item.id;
  }

  console.log(`🚀  docpath start: 一键拉起任务并启动执行 (${targetId})\n`);

  // 步骤 1: promote 需求（标题直启默认免 --draft）
  const promoteOptions = {
    cwd,
    action: 'promote' as const,
    id: targetId,
    draft: options.draft ?? (isTitle ? true : undefined),
    agent: options.agent,
    adopt: options.adopt,
  };
  await backlogCommand(promoteOptions);
  const effectiveCwd = promoteOptions.cwd;

  // 步骤 2: plan（如果仍处于 drafting 或 planning 阶段）
  const stateAfterPromote = await readCurrentState(effectiveCwd);
  if (stateAfterPromote?.phase === 'drafting' || stateAfterPromote?.phase === 'planning') {
    await planCommand({ cwd: effectiveCwd });
  }

  // 步骤 3: 认领并启动第一步（默认 S1）
  const stepToStart = options.step || 'S1';

  // 多步骤启动全景展示 (S1)
  try {
    const docpathDir = await resolveDocpathDir(effectiveCwd);
    const activeTaskId = (await readCurrentState(effectiveCwd))?.task_id || targetId;
    const planContent = await readActiveTaskFile(docpathDir, activeTaskId, 'plan.md');
    if (planContent.trim()) {
      const planSteps = parsePlanSteps(planContent);
      if (planSteps && planSteps.length > 1) {
        console.log(`\n📋  执行计划已生成 (共 ${planSteps.length} 步):`);
        for (const s of planSteps) {
          if (s.id.toLowerCase() === stepToStart.toLowerCase()) {
            console.log(`   👉 ${s.id}: ${s.name || s.description} (当前认领)`);
          } else {
            console.log(`      ${s.id}: ${s.name || s.description}`);
          }
        }
        console.log('💡  提示: 当前步骤完成后运行 docpath step-pass 自动接力推进下一步。\n');
      }
    }
  } catch {
    // 容错
  }

  await goCommand({
    cwd: effectiveCwd,
    step: stepToStart,
    acceptDirty: options.adopt ? 'start --adopt: claim workspace edits' : undefined,
  });

  console.log(`\n🎉  任务 ${targetId} 已拉起并启动步骤 ${stepToStart}！`);
}
