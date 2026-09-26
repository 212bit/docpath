/**
 * docpath worktree — Git Worktree 管理共享工具 (Layer 4)
 * (Re-exported from Layer 1 utils/worktree.js and Layer 0 types/worktree.js)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { refreshBacklogIndex } from '../../engine/backlog.js';
import { resolveDocpathDir } from '../../utils/file.js';
import { refreshProjectDocumentIndex } from '../../utils/document-index.js';
import {
  readAutoResolvePaths,
  REBUILDABLE_INDEX_PATHS,
} from '../../utils/worktree.js';
import type { IndexConflictResolution } from '../../types/worktree.js';

export * from '../../types/worktree.js';
export * from '../../utils/worktree.js';

const execFileAsync = promisify(execFile);

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
    await execFileAsync('git', ['checkout', '--theirs', '--', file], { cwd });
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

  await execFileAsync('git', ['add', '--', ...unmergedFiles], { cwd });
  return { resolved: [...unmergedFiles], rebuilds };
}
