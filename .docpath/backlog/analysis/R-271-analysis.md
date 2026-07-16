# R-271 Analysis: worktree backlog live-shared

## Problem

`worktree create` treats tracked `.docpath/backlog` as merge-mediated **copy**. After create, main backlog updates (status/done) do not appear in worktrees → stale decisions / duplicate promote. Concurrent `nextBacklogId` scans only local dir → id collision risk.

## Design

Option C residual: backlog must be **live-shared symlink** to main checkout.

1. **create**: always symlink `.docpath/backlog` → main (even when tracked). Skip per-item copy when already symlink.
2. **doctor**: backlog uses live-shared check; non-symlink directory is **FAIL** (not warn/pass).
3. **repair**: convert backlog tracked copy → symlink.
4. **id allocation**: symlink makes `nextBacklogId`/`createBacklogItem` naturally shared; keep `wx` exclusive create.

Non-goals: untrack backlog in main git (large migration); change rules/templates sharing policy.

## Acceptance

- AC-1: worktree create makes backlog a symlink to main
- AC-2: doctor fails when backlog is a plain directory copy
- AC-3: target --backlog works when live-shared (no redundant copy)
- AC-4: tests cover create symlink + doctor fail on copy
