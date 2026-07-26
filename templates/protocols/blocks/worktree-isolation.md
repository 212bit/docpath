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
