# DocPath OpenCode Protocol

> This file is a thin proxy. Prefer `AGENTS.md`, which is the authoritative
> single source of truth for DocPath agent protocols.

## Protocol Reference

See @AGENTS.md for the full access model, lifecycle commands, token budget,
gate (check / review / journal) rules, and worktree concurrency model.

## OpenCode Instructions

- Read and follow all instructions in @AGENTS.md. It is the single source of
  truth; do not maintain a duplicate protocol copy here to avoid drift.
- Use `docpath next --agent` as the read-only advisory router at session
  start/resume, then trust each command's trailing `next_hint` (R-460) instead
  of re-running `next` after every command.
- Use `docpath go --step <id>` to claim and execute a step; use
  `docpath step-pass --commit` / `docpath done --commit` / `docpath quick-done --commit`
  for compound closeout.
- OpenCode has no `/docpath-*` slash commands; invoke docpath as the `docpath`
  CLI directly.
- Project config is `.docpath/config.yaml`.

## Worktree Concurrent Development

OpenCode sessions commonly use Git Worktrees for parallel development. Follow
the worktree concurrency model in @AGENTS.md; this block is inlined here
because OpenCode relies on worktree isolation.

<!-- docpath:block worktree-isolation -->
Resources are split by sharing model (R-238 Option B, reaffirmed by R-273 —
do NOT symlink tracked directories: git records the swap as mass deletion and
merging it back deletes main's files):

**Merge-mediated** (tracked copy — shared via branch merges, not live):
- `.docpath/backlog/` - requirement pool; tracked in main, each worktree gets a
  snapshot copy. Snapshots can go stale (known limitation; merge reconciles).
  Backlog id allocation is single-pool at the CLI layer: `capture`/`add` inside
  a worktree also scans the main checkout's backlog to avoid id collisions.
- `.docpath/rules/` - rules; tracked, each worktree gets a snapshot, reconciled on merge
- `.docpath/tasks/done/` - completed-task archives; tracked, reconciled on merge

**Isolated** (independent per worktree — gitignored runtime):
- `.docpath/workspace/` - each worktree has its own state.json
- `.docpath/tasks/current/` - each worktree has its own active task runtime
- `.docpath/journal/` - independent archives

**Result**: Each worktree runs as an independent DocPath workspace; backlog,
rules, and completed tasks reconcile at merge. `docpath worktree doctor`
reports each resource against its expected model (merge-mediated / isolated)
and fails a symlinked backlog over tracked files (repair with
`docpath worktree repair`).

**Dependencies are NOT isolated** (R-467): `worktree create` symlinks
`node_modules` to the main checkout, so an install inside a worktree writes
through to main; when the worktree is removed, main's `test` breaks with
`ERR_MODULE_NOT_FOUND` *after* an apparently successful merge. `node_modules`
is gitignored, so drift is invisible to merge status — run
`docpath worktree doctor` (dependency isolation / drift checks) before
merging, and always commit `package.json` + lockfile changes on the branch.
<!-- /docpath:block -->