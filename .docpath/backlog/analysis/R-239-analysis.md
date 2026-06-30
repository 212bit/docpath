# Backlog Analysis: R-239 (Support worktree auto merge closeout flow)

## Background
Currently, to close out a task in a git worktree requires a series of manual Git operations:
1. Stage and commit uncommitted changes.
2. Fetch origin/main.
3. Merge origin/main into the worktree branch.
4. Resolve conflicts if any.
5. Checkout main.
6. Merge worktree branch back to main.

Integrating this into DocPath as a CLI command `docpath worktree merge` will make the process safe, deterministic, and verify that quality gates are passed before merging.

## Proposed Strategy
Add a new command `docpath worktree merge [branch]`:
1. Check worktree and git common dir.
2. Verify task status (completed phase in state.json).
3. Commit unstaged changes in worktree.
4. Merge target branch (default `origin/main`).
5. Output merge conflict locations if conflicts occur.
6. Merge back to local main branch (or CODE_MERGE_TARGET) via `--no-ff`.
