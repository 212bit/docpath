/**
 * docpath backlog — accept / plan / done / drop / archive
 */

import {
  archiveBacklogItem,
  readBacklogItem,
  refreshBacklogIndex,
  setBacklogStatus,
} from '../../engine/backlog.js';
import { assertBacklogReadyForExecution } from './evidence.js';
import { parseIdList } from './ids.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogAdvanceStatus(
  options: BacklogCommandOptions,
  target: 'accepted' | 'planned',
): Promise<void> {
  const ids = parseIdList(options.id);
  if (ids.length === 0) {
    throw new Error(`docpath backlog ${target === 'accepted' ? 'accept' : 'plan'} requires <id>`);
  }

  for (const singleId of ids) {
    const existing = await readBacklogItem(options.cwd, singleId);
    if (!existing) {
      throw new Error(`[docpath] backlog 条目不存在: ${singleId}`);
    }
    assertBacklogReadyForExecution(existing, target === 'accepted' ? 'accept' : 'plan', options.draft, options.cwd);
    const item = await setBacklogStatus(options.cwd, existing.id, target);
    console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
  }
  await refreshBacklogIndex(options.cwd);
}

/**
 * backlog archive（R-352）: 显式把终态条目归档进 archived/。
 *
 * 只接受 done/dropped（引擎 archiveBacklogItem 内校验）。moved=false 即幂等静默收尾，
 * 由撞号安全阀非破坏性暴露给 `backlog groom`。
 */
export async function backlogArchive(options: BacklogCommandOptions): Promise<void> {
  const ids = parseIdList(options.id);
  if (ids.length === 0) {
    throw new Error('docpath backlog archive requires <id>');
  }
  for (const singleId of ids) {
    const result = await archiveBacklogItem(options.cwd, singleId);
    if (result.moved) {
      console.log(`✅  backlog 条目已归档: ${singleId} → ${result.file ?? 'backlog/archived/'}`);
    } else {
      console.log(`ℹ️  backlog 条目无需归档: ${singleId}（已在 archived 里或撞号安全阀拦截，见 backlog groom）`);
    }
  }
}

export async function backlogUpdateTerminalStatus(
  options: BacklogCommandOptions,
  target: 'done' | 'dropped',
): Promise<void> {
  const ids = parseIdList(options.id);
  if (ids.length === 0) {
    throw new Error(`docpath backlog ${target === 'done' ? 'done' : 'drop'} requires <id>`);
  }
  if (options.task?.trim() && target !== 'done') {
    throw new Error('docpath backlog --task 仅适用于 done（drop 不需要任务证据）');
  }

  for (const singleId of ids) {
    const item = await setBacklogStatus(options.cwd, singleId, target, {
      linkTask: options.task?.trim() || undefined,
    });
    console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}${item.links.task ? `（任务 ${item.links.task}）` : ''}`);
  }
  await refreshBacklogIndex(options.cwd);
}
