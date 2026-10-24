/**
 * docpath backlog — 需求条目管理
 *
 * 子命令实现位于 ./backlog/。本文件保留公共入口与动作注册表。
 */

import { backlogAdd, backlogCapture } from './backlog/add.js';
import { backlogEdit } from './backlog/edit.js';
import { backlogGraph } from './backlog/graph.js';
import { backlogGroom } from './backlog/groom.js';
import { backlogExport, backlogImport } from './backlog/io.js';
import { backlogList, backlogRefresh } from './backlog/list.js';
import { backlogMerge } from './backlog/merge.js';
import { backlogPick } from './backlog/pick.js';
import { backlogPromote } from './backlog/promote.js';
import { backlogSearch } from './backlog/search.js';
import { backlogShape } from './backlog/shape.js';
import { backlogShow } from './backlog/show.js';
import { backlogDashboard, backlogStats } from './backlog/stats.js';
import { backlogAdvanceStatus, backlogArchive, backlogUpdateTerminalStatus } from './backlog/status.js';
import type { BacklogCommandOptions } from './backlog/types.js';

export type { BacklogCommandOptions } from './backlog/types.js';
export {
  extractFunctionalRequirements,
  getMarkdownSection,
  parseMultilineListItems,
  replaceMarkdownSection,
  splitCompoundRequirements,
} from './backlog/markdown.js';

/**
 * FR-4 动作单一真源：backlog 动作 → 处理器映射。帮助文案 / 校验 / 报错全部由
 * BACKLOG_ACTIONS 派生，扩展一个动作只改这里一处的映射项，其余（roster、usage、报错）自动跟随。
 */
const backlogActions = {
  add: backlogAdd,
  capture: backlogCapture,
  shape: backlogShape,
  edit: backlogEdit,
  show: backlogShow,
  get: backlogShow,
  view: backlogShow,
  stats: backlogStats,
  metrics: backlogStats,
  dashboard: backlogDashboard,
  overview: backlogDashboard,
  pick: backlogPick,
  next: backlogPick,
  list: backlogList,
  search: backlogSearch,
  find: backlogSearch,
  graph: backlogGraph,
  tree: backlogGraph,
  deps: backlogGraph,
  import: backlogImport,
  export: backlogExport,
  groom: backlogGroom,
  merge: backlogMerge,
  combine: backlogMerge,
  refresh: backlogRefresh,
  promote: backlogPromote,
  accept: (o: BacklogCommandOptions) => backlogAdvanceStatus(o, 'accepted'),
  plan: (o: BacklogCommandOptions) => backlogAdvanceStatus(o, 'planned'),
  done: (o: BacklogCommandOptions) => backlogUpdateTerminalStatus(o, 'done'),
  drop: (o: BacklogCommandOptions) => backlogUpdateTerminalStatus(o, 'dropped'),
  archive: backlogArchive,
} as const satisfies Record<string, (o: BacklogCommandOptions) => Promise<void>>;

export type BacklogActionName = keyof typeof backlogActions;
/** 全部 backlog 动作名（单一真源，序保证帮助/报错可读性）。 */
export const BACKLOG_ACTIONS = Object.keys(backlogActions) as unknown as readonly BacklogActionName[];
/** 派生 usage 字符串（`a|b|c`），供无 action / 非法 action 报错复用。 */
function backlogActionUsage(): string {
  return BACKLOG_ACTIONS.join('|');
}

export async function backlogCommand(options: BacklogCommandOptions): Promise<void> {
  const raw = options.action?.trim().toLowerCase() ?? '';
  if (!raw) {
    await backlogDashboard(options);
    return;
  }
  const handler = backlogActions[raw as BacklogActionName];
  if (!handler) {
    throw new Error(`docpath backlog: unsupported action ${raw}（允许: ${backlogActionUsage()}）`);
  }
  await handler(options);
}
