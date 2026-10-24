/**
 * docpath worktree — Git Worktree 管理共享工具 (Layer 4)
 * (Re-exported from Layer 1 utils/worktree.js and Layer 0 types/worktree.js)
 */

import { refreshBacklogIndex } from '../../engine/backlog.js';
import { runToolOrThrow } from '../../utils/run-tool.js';
import { resolveDocpathDir } from '../../utils/file.js';
import { refreshProjectDocumentIndex } from '../../utils/document-index.js';
import {
  readAutoResolvePaths,
  REBUILDABLE_INDEX_PATHS,
} from '../../utils/worktree.js';
import type { IndexConflictResolution } from '../../types/worktree.js';

export * from '../../types/worktree.js';
export * from '../../utils/worktree.js';

export async function resolveIndexConflicts(
  cwd: string,
  unmergedFiles: string[],
): Promise<IndexConflictResolution> {
  const extraPaths = await readAutoResolvePaths(cwd);
  const resolvable = (file: string): boolean =>
    file in REBUILDABLE_INDEX_PATHS || extraPaths.includes(file);
  if (unmergedFiles.length === 0 || !unmergedFiles.every(resolvable)) {
    return { resolved: [], rebuilds: [] };
  }

  for (const file of unmergedFiles) {
    await runToolOrThrow('git', ['checkout', '--theirs', '--', file], {
      cwd,
      timeoutMs: 30_000,
      stdin: 'ignore',
      offline: false,
    });
  }

  const rebuilds: Array<{ path: string; kind: 'backlog' | 'docs' }> = [];
  for (const file of unmergedFiles) {
    const kind = REBUILDABLE_INDEX_PATHS[file];
    if (kind === 'backlog') {
      await refreshBacklogIndex(cwd);
      rebuilds.push({ path: file, kind });
    } else if (kind === 'docs') {
      const docpathDir = await resolveDocpathDir(cwd);
      await refreshProjectDocumentIndex(docpathDir, cwd);
      rebuilds.push({ path: file, kind });
    }
  }

  await runToolOrThrow('git', ['add', '--', ...unmergedFiles], {
    cwd,
    timeoutMs: 30_000,
    stdin: 'ignore',
    offline: false,
  });
  return { resolved: [...unmergedFiles], rebuilds };
}
