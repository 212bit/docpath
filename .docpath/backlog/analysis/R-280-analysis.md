# R-280 Analysis: Fail-loud on completed tasks for go and agent step

## Requirements

R-280 ensures that executing `docpath go` and `docpath agent step` (or its wrapper `docpath step`) on a task that has already reached the `completed` phase/state will fail-loud and reject execution. It must not perform any writes or transition states, avoiding polluting the canonical breadcrumb or workspace state. It should output a clear error message guiding the user to start a new task using `docpath next` or `docpath backlog promote`.

Required behavior:
- Read current task state from `state.json`.
- If the current task `phase` is `'completed'`, running `docpath go` or `docpath agent step` must throw an error with exit code 1.
- No breadcrumb entry should be written (e.g. `writeBreadcrumb`).
- No lease should be touched or acquired.
- The error message should suggest: "Please run `docpath next --agent` or `docpath backlog promote <id>`."

## Product / Workflow Impact

This targets workflow reliability. When a task has been completed and archived, its state should be frozen. Accidental calls to step transition commands (e.g. by an agent running in an old context or loop) must be loud and clean, preserving task history sanity.

## Technical Analysis

1. `src/commands/go.ts`:
   In `goCommand`, read the current task state (`await readCurrentState(cwd)`). If `current?.phase === 'completed'`, throw an Error prior to executing start/finalize steps.
   ```typescript
   if (current?.phase === 'completed') {
     throw new Error(
       `docpath go: 当前任务已处于 completed 状态，无法使用 go 推进或修改子任务。\n` +
       `    如果是新工作，请运行 docpath next --agent 或 docpath backlog promote <id> 推进新任务。`
     );
   }
   ```

2. `src/commands/agent.ts`:
   In `handleAgentStep`, read the current task state. If `current?.phase === 'completed'`, throw an Error prior to running command or leasing steps.
   ```typescript
   const current = await readCurrentState(cwd);
   if (current?.phase === 'completed') {
     throw new Error(
       `docpath agent step: 当前任务已处于 completed 状态，无法修改子任务状态。\n` +
       `    如果是新工作，请运行 docpath next --agent 或 docpath backlog promote <id> 推进新任务。`
     );
   }
   ```

## Risks

No significant risk. This is a purely defensive fail-loud mechanism preventing state mutation when the task lifecycle is already terminal (`completed`).

## Acceptance Evidence To Add

- A test case in `tests/go.test.mjs` verifying that executing `docpath go` when the task is completed fails with the correct error message and code.
- A test case in `tests/agent.test.mjs` (or similar) verifying that executing `docpath agent step` when the task is completed fails with the correct error message and code.
