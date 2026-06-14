# DocPath OpenCode Protocol

> This project uses DocPath as the shared workflow engine for OpenCode sessions.
> OpenCode should consume DocPath through CLI summaries by default. JSON/JSONL
> files are machine truth sources; Markdown files are rendered human views or
> narrative task documents.

## First Steps

1. Run `docpath status --agent`.
2. Run `docpath next --agent`.
3. Follow the returned `recommended_command`.
4. Use `context_index`, `data_index`, and `current_focus` as indexes before
   reading any files.
5. Expand only when needed with `docpath reveal --topic <keyword> --level 1-3`
   or `docpath context --max-tokens 5000 --topic <keyword>`.
6. Record progress with `docpath agent step` after each meaningful step.

## Access Model

| Artifact | Role | OpenCode access |
| --- | --- | --- |
| `.docpath/workspace/state.json` | Runtime state truth | Use `docpath status --agent`; direct read only for debug. |
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

## OpenCode Workflow

### Start or Resume

```bash
docpath agent enter
docpath next --agent
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
- Use `docpath agent handoff` when another session may resume the task.

## Config

Config: `.docpath/config.yaml`
