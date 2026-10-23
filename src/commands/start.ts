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
import { createBacklogItem, listBacklogItems, readBacklogItem, refreshBacklogIndex } from '../engine/backlog.js';
import { cleanBacklogTitle } from '../utils/backlog-registry.js';
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
  session?: string;
}

async function resolveBacklogIdForStart(
  cwd: string,
  rawInput: string,
): Promise<{ targetId: string; isNewTitle: boolean }> {
  const input = rawInput.trim();

  // 1. 纯 Backlog ID（如 R-180 / r-180）
  if (/^R-\d+$/i.test(input)) {
    return { targetId: input.toUpperCase(), isNewTitle: false };
  }

  // 2. 标题中包含内嵌 Backlog ID（如 "dead-drop 机密性信封：候选区加密（R-180）" / "[R-180] ..." / "R-180: ..."）
  const embeddedIdMatch = input.match(/(?:[（(【\[]|\b)(R-\d+)(?:[）)】\]]|\b)/i);
  if (embeddedIdMatch) {
    const embeddedId = embeddedIdMatch[1].toUpperCase();
    const existingItem = await readBacklogItem(cwd, embeddedId);
    if (existingItem && existingItem.status !== 'done' && existingItem.status !== 'dropped') {
      console.log(`💡  从标题中识别到既有 Backlog 条目: ${existingItem.id} ("${existingItem.title}")，直接拉起...\n`);
      return { targetId: existingItem.id, isNewTitle: false };
    }
  }

  // 3. 匹配既有活跃 Backlog 标题（同名或归一化匹配）
  const normalizeForMatch = (t: string) => cleanBacklogTitle(t).toLowerCase().replace(/[\s\-_:：,.，。()（）[\]【】]/g, '');
  const inputNormalized = normalizeForMatch(input);
  if (inputNormalized) {
    const activeItems = await listBacklogItems(cwd);
    const matchedItem = activeItems.find((item) => {
      if (item.status === 'done' || item.status === 'dropped') return false;
      return normalizeForMatch(item.title) === inputNormalized;
    });

    if (matchedItem) {
      console.log(`💡  匹配到既有活跃 Backlog 条目: ${matchedItem.id} ("${matchedItem.title}")，直接拉起...\n`);
      return { targetId: matchedItem.id, isNewTitle: false };
    }
  }

  // 4. 确属新标题，自动创建 Backlog 并拉起
  console.log(`💡  检测到任务标题 "${input}"，自动创建 Backlog 并一键拉起...\n`);
  const item = await createBacklogItem(cwd, {
    title: input,
    status: 'proposed',
    priority: 'P2',
    level: 2,
    source: 'docpath start',
    readiness: 'raw',
    evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
    links: { task: null, spec: null },
    created_at: new Date().toISOString().slice(0, 10),
    body: `## 背景\n\n- ${input}\n\n## 验收\n\n- 满足需求并通过门禁`,
  });
  await refreshBacklogIndex(cwd);
  return { targetId: item.id, isNewTitle: true };
}

export async function startCommand(options: StartOptions): Promise<void> {
  const { cwd } = options;
  const rawTarget = options.id?.trim();
  if (!rawTarget) {
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

  // 1.1 活体租约互斥拦截：防止跨会话强行抢占或覆盖正在执行的任务
  if (current?.task_id) {
    const { assertTaskNotLeasedByOtherLiveSession, resolveSessionContext } = await import('../utils/session.js');
    const session = resolveSessionContext((options as any).session);
    await assertTaskNotLeasedByOtherLiveSession(cwd, current.task_id, {
      command: 'docpath start',
      force: options.adopt,
      selfSessionId: session.sessionId,
    });
  }

  // 2. 脏工作区前置拦截：未显式指定 --adopt 时严格禁止在 dirty worktree 上启动新任务
  if (!options.adopt) {
    assertCleanWorktreeForNewTask(cwd, 'docpath start');
  }

  // 3. 智能解析 Backlog ID（ID / 内嵌 ID 提取 / 既有同名匹配 / 全新创建）
  const { targetId, isNewTitle } = await resolveBacklogIdForStart(cwd, rawTarget);

  console.log(`🚀  docpath start: 一键拉起任务并启动执行 (${targetId})\n`);

  // 步骤 1: promote 需求（标题直启默认免 --draft）
  const promoteOptions = {
    cwd,
    action: 'promote' as const,
    id: targetId,
    draft: options.draft ?? (isNewTitle ? true : undefined),
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
    adopt: options.adopt,
  });

  console.log(`\n🎉  任务 ${targetId} 已拉起并启动步骤 ${stepToStart}！`);
}
