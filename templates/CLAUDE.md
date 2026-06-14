# DocPath Claude Code Protocol

> This project uses DocPath as the workflow state machine for Claude Code.
> Claude should use DocPath CLI routes and slash commands as the default
> interface. JSON/JSONL files are machine truth sources; Markdown files are
> rendered human views or narrative task documents.

## First Steps

1. Run `/docpath-status` or `docpath status --agent`.
2. Run `/docpath-next` or `docpath next --agent`.
3. Follow the returned `recommended_command`.
4. Use `context_index`, `data_index`, and `current_focus` before reading files.
5. Use `/docpath-reveal` or `docpath reveal --topic <keyword> --level 1-3`
   when more detail is needed.
6. Use `/docpath-context` or `docpath context --max-tokens 5000 --topic <keyword>`
   for a budgeted context package.

Do not default-read `.docpath/workspace/current.md`,
`.docpath/workspace/breadcrumb.md`, `.docpath/tasks/current/plan.md`, or
`.docpath/docs-index.json`.

## Slash Commands

Prefer the installed slash commands over long pasted prompts:

```text
/docpath-status
/docpath-next
/docpath-agent-enter
/docpath-agent-step S1
/docpath-agent-done task
/docpath-agent-handoff
/docpath-check
/docpath-review
/docpath-brainstorm
/docpath-plan
/docpath-go
/docpath-journal
/docpath-continue
/docpath-compact
/docpath-refine
/docpath-reveal
/docpath-context
```

All commands must point at the same `.docpath/` state. Do not create a parallel
Claude-only state file.

## JSON-First Access Model

| Artifact | Role | Claude access |
| --- | --- | --- |
| `state.json` | Runtime state truth | Use `/docpath-status` or `docpath status --agent`. |
| `current.md` | Human rendered state view | Do not read by default. |
| `breadcrumb.jsonl` | Execution event truth | Use CLI summaries; direct tail only for debug. |
| `breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `spec.json` | Structured task spec truth | Prefer CLI summaries and schema-aware routes. |
| `spec.md` | Human narrative spec | Read on demand for full requirements. |
| `plan.json` | Structured plan truth | Prefer `/docpath-next`, `/docpath-go`, and reveal. |
| `plan.md` | Human plan view | Do not parse manually by default. |
| `docs-index.json` | Document index truth | Never read in full; use filtered CLI summaries. |

Direct file reads are allowed only when the CLI route, debugging need, or user
request requires them. Keep the read scoped by topic, task id, exact path, or
tail range.

## Lifecycle

```bash
docpath agent enter
docpath go --step S1
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
docpath agent handoff
```

Workflow:

1. Enter with `docpath agent enter` before code or protocol edits.
2. Load the active step with `docpath go --step <id>`.
3. Make the scoped change.
4. Record completion with `docpath agent step --step "<id>" --status done`.
5. Run `docpath check` and `docpath agent done` before claiming completion.
6. Use `docpath agent handoff` when another session may resume the work.

## Required Gates

- Do not skip status and next route checks.
- Do not act from memory alone.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Product/UI work must clarify target user, entry point, data scope, and
  interaction model before implementation.
- Major changes to architecture, data contracts, UI information architecture,
  workflow behavior, permission boundaries, task scope, existing capabilities,
  or long-term maintenance cost require brainstorm/refine plus a Decision Brief
  and explicit user confirmation before implementation.
- Run `docpath check` before marking work complete.

## Decision Log Aging

- `workspace/decisions.md` keeps recent ADR entries only.
- `docpath journal` rotates older entries into `workspace/decisions-YYYY-MM.md`.
- Read historical monthly archives explicitly instead of loading all decisions.
- Write decisions only for reusable architecture, workflow, or behavior choices
  with context, impact, boundaries, and alternatives.
