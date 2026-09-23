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

export interface StartOptions {
  cwd: string;
  id?: string;
  step?: string;
  draft?: boolean;
  agent?: boolean;
  adopt?: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const { cwd, id } = options;
  if (!id) {
    throw new Error('docpath start 需要提供 Backlog 条目 ID，例如: docpath start R-101');
  }

  console.log(`🚀  docpath start: 一键拉起任务并启动执行 (${id})\n`);

  // 步骤 1: promote 需求
  await backlogCommand({
    cwd,
    action: 'promote',
    id,
    draft: options.draft,
    agent: options.agent,
    adopt: options.adopt,
  });

  // 步骤 2: plan（如果仍处于 drafting 或 planning 阶段）
  const stateAfterPromote = await readCurrentState(cwd);
  if (stateAfterPromote?.phase === 'drafting' || stateAfterPromote?.phase === 'planning') {
    await planCommand({ cwd });
  }

  // 步骤 3: 认领并启动第一步（默认 S1）
  const stepToStart = options.step || 'S1';
  await goCommand({
    cwd,
    step: stepToStart,
    acceptDirty: options.adopt ? 'start --adopt: claim workspace edits' : undefined,
  });

  console.log(`\n🎉  任务 ${id} 已拉起并启动步骤 ${stepToStart}！`);
}
