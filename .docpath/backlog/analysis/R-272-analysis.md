# R-272: WIP note on session resume/handoff

## Fix
- `agent enter` when phase=executing, step in_progress, and dirty worktree → write `.docpath/workspace/wip-note.md`
- `agent handoff` writes the same WIP note (does not mutate plan-linked breadcrumb status)

## AC
- AC-1: handoff writes wip-note.md with task/step
- AC-2: enter records WIP when dirty + in_progress
- AC-3: does not create plan/breadcrumb drift
