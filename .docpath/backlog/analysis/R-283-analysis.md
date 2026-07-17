# R-283 Analysis: Go step release dirty guard on active task files

## Problem Description

Currently, during task execution (active task phase is `executing`), running `docpath go` to start or resume a subsequent step will be blocked by `assertNoNonDocPathChangesForExecutionStart` if there are uncommitted files in the working directory that are outside the task's canonical prefix.
However, since the task is already active, these uncommitted changes are the normal development output of the previous steps of the *same* task. Blocking them makes the developer run `docpath run start --step <step> --note ...` to bypass it, which is tedious and unnecessary.

## Proposed Solution

1. **Active Task Dirty Guard Bypass**:
   - In `assertNoNonDocPathChangesForExecutionStart` in `src/utils/git-dirty-guard.ts`, read the current task state (`state.json`).
   - If the active task ID matches the target task of the `go`/`agent enter` command, and the active task's phase is `'executing'`, we are executing steps of the same task.
   - If so, we bypass/allow dirty files:
     - If we are in a Git worktree, we allow all dirty files in the worktree.
     - If we are not in a worktree, we allow all tracked dirty files, while still blocking untracked files (unless they are task canonical files/evidence).
