/**
 * Wire the sync dirty-worktree guard to the on-gate-blocked hook.
 *
 * utils/git-dirty-guard.ts cannot import the engine. The CLI calls
 * {@link installDirtyGuardBlockHook} once at startup; every later
 * assertCleanWorktreeForNewTask / assertNoNonDocPathChangesForExecutionStart
 * throw then notifies before the original error propagates.
 *
 * hippo-gate is not in this tree. When src/engine/hippo-gate.ts lands, call
 * emitGateBlocked directly — do not go through this dirty-guard listener:
 *
 *   await emitGateBlocked(cwd, { gate: 'hippo-gate', taskId, step, reason });
 */

import { emitGateBlockedSync } from './hook-runner.js';
import { setDirtyGuardBlockListener } from '../utils/git-dirty-guard.js';

export function installDirtyGuardBlockHook(): void {
  setDirtyGuardBlockListener((cwd, info) => {
    emitGateBlockedSync(cwd, {
      gate: info.gate,
      taskId: info.taskId,
      step: info.step,
      reason: info.reason,
      paths: info.paths,
    });
  });
}
