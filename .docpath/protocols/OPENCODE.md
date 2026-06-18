# DocPath OpenCode Protocol

> This project uses DocPath as the shared workflow engine for OpenCode sessions.
> OpenCode should consume DocPath through CLI summaries by default. JSON/JSONL
> files are machine truth sources; Markdown files are rendered human views or
> narrative task documents.

## First Steps

1. Run `docpath next --agent` for the `agent_view: next` route,
   `recommended_command`, and compact workflow snapshot.
2. Follow the returned `recommended_command`.
3. Use `context_index`, `data_index`, and `current_focus` as indexes before
   reading any files.
4. Use `docpath status --agent` only for explicit status/debug snapshots,
   suspected drift, or confirmation after state-changing commands.
5. Expand only when needed with `docpath reveal --topic <keyword> --level 1-3`
   or `docpath context --max-tokens 5000 --topic <keyword>`.
6. Record progress with `docpath agent step` after each meaningful step.

## Access Model

| Artifact | Role | OpenCode access |
| --- | --- | --- |
| `.docpath/workspace/state.json` | Runtime state truth | Use `docpath next --agent` for start/resume; use `docpath status --agent` for diagnostics. |
| `.docpath/workspace/current.md` | Human rendered state view | Do not read by default. |
| `.docpath/workspace/breadcrumb.jsonl` | Execution event truth | Use CLI summaries; direct tail only for debug. |
| `.docpath/workspace/breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `.docpath/tasks/current/spec.json` | Structured task spec truth | Prefer CLI summaries. |
| `.docpath/tasks/current/spec.md` | Human narrative spec | Read on demand for full requirements. |
| `.docpath/tasks/current/plan.json` | Structured plan truth | Prefer `next`, `go`, and `reveal`. |
| `.docpath/tasks/current/plan.md` | Human plan view | Do not parse manually by default. |
| `.docpath/docs-index.json` | Document index truth | Never read in full; use filtered CLI summaries. |

Direct file reads are allowed only when the route or debugging task requires
them. Keep direct reads scoped to the smallest useful file, topic, task id, or
tail range.

## Command Boundaries

- `docpath brainstorm`, `docpath refine`, `docpath analyze --dry-run`, and
  `docpath plan --dry-run` are prompt emitters for the current OpenCode session;
  they do not call a hidden LLM.
- `docpath write-spec`, `docpath write-plan`, `docpath write-design`, and
  `docpath write-analysis` are artifact sinks for content OpenCode has already
  generated or selected.
- `status`, `next`, `go`, `agent`, `check`, `review`, and `changes` are
  deterministic workflow gates.
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. OpenCode owns semantic recovery decisions:
  whether a drifted spec is a new task, an old task restore, or a user-confirmed
  reset.
- If `next`, `status`, `check`, or `tasks drift` reports task identity drift, do
  not repair it with `agent step`; choose a restore/reset/capture/promote path
  with explicit user intent.
- `docpath next --agent` is read-only and advisory. Use it at session
  start/resume or when state is uncertain; do not treat it as permission, a
  lock, or a required prelude to an explicit deterministic command.
- State-changing commands must re-read workflow state and enforce their own
  preconditions. `docpath go --step <id>` is atomic step control: it
  claims/starts that step only if it is allowed now.
- Treat `--dry-run` output as preview material, not final evidence.

## OpenCode Workflow

### Start or Resume

```bash
docpath next --agent
docpath agent enter  # only when the route points to an executable task
```

### Execute a Step

```bash
docpath go --step S1
# make the scoped change
docpath agent step --step "S1" --status done
```

### Complete the Task

```bash
docpath check
docpath agent done --step "<task>"
```

### Handoff

```bash
docpath agent handoff
```

## Rules

- Do not act from memory alone.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Do not default-read `current.md`, `breadcrumb.md`, `plan.md`, or
  `docs-index.json`.
- Clarify ambiguous product/UI requests before implementation.
- For major architecture, data, workflow, permission, or long-term maintenance
  changes, run brainstorm/refine and record a Decision Brief before coding.
- Run `docpath check` before claiming completion.
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.
- Use `docpath agent handoff` when another session may resume the task.

## Config

Config: `.docpath/config.yaml`
