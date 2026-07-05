# R-246 Analysis - Completed Next Route Must Ignore Stale In-Progress Steps

## Problem

`docpath next --agent` can emit an impossible route after a task is already `phase=completed` and `gate=review_pass`: it still sees an unfinished or in-progress plan/breadcrumb step and recommends `docpath agent step --step <id> --status done`. The state machine rejects that command from `phase=completed` or `phase=reviewing`, so the agent gets a self-contradictory route.

## Expected Behavior

Completed tasks must route through completed-state closeout and next-work recommendations only: changes, accepted backlog, backlog shaping, learn, gc, or backlog capture. Completed state should not route to `go`, `agent enter`, or `agent step`, even when plan/breadcrumb evidence is stale.

## Scope

- Fix `next --agent` routing order or stale-step filtering.
- Add a regression test with `phase=completed`, `gate=review_pass`, and stale in-progress breadcrumb / open plan step.
- Preserve active executing/checking behavior where an in-progress step should still be completed.

## Risk

If too broad, the fix could hide legitimate in-progress steps during executing tasks. Limit the completed-state guard to `phase=completed` or current state `completed`.
