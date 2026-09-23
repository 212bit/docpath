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
import { detectDirtyWorktree } from '../utils/git-dirty-guard.js';

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

  // 智能认领已有工作区改动：如果没有活跃任务且用户未显式指定 adopt，且检测到 dirty 文件，则自动启用 adopt
  let adopt = options.adopt;
  const currentState = await readCurrentState(cwd);
  const activeTaskExists = Boolean(currentState && currentState.phase !== 'completed');
  if (!activeTaskExists && adopt === undefined) {
    const dirtyReport = detectDirtyWorktree(cwd);
    if (dirtyReport.isGitRepo && dirtyReport.dirty) {
      adopt = true;
      console.log(`💡  检测到当前工作区存在未提交改动，已自动认领纳入当前任务 (--adopt)\n`);
    }
  }

  // 如果传入的不是 R-xxx 格式，则判定为按标题一键拉起新任务（自动捕获 Backlog）
  if (!/^R-\d+$/i.test(targetId)) {
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

  // 步骤 1: promote 需求
  const promoteOptions = {
    cwd,
    action: 'promote' as const,
    id: targetId,
    draft: options.draft,
    agent: options.agent,
    adopt,
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
  await goCommand({
    cwd: effectiveCwd,
    step: stepToStart,
    acceptDirty: adopt ? 'start --adopt: claim workspace edits' : undefined,
  });

  console.log(`\n🎉  任务 ${targetId} 已拉起并启动步骤 ${stepToStart}！`);
}
