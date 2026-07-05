# DocPath Claude Code Protocol

> This project uses DocPath as the workflow state machine for Claude Code.
> Claude should use DocPath CLI routes and slash commands as the default
> interface. JSON/JSONL files are machine truth sources; Markdown files are
> rendered human views or narrative task documents.

## First Steps

1. Run `/docpath-next` or `docpath next --agent` for the `agent_view: next`
   route, `recommended_command`, and compact workflow snapshot.
2. Follow the returned `recommended_command`.
3. Use `context_index`, `data_index`, and `current_focus` before reading files.
4. Use `/docpath-status` or `docpath status --agent` only for explicit
   status/debug snapshots, suspected drift, or confirmation after state-changing
   commands.
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
/docpath-quick Fix typo in docs
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
| `state.json` | Runtime state truth | Use `/docpath-next` or `docpath next --agent` for start/resume; use `/docpath-status` or `docpath status --agent` for diagnostics. |
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

## Command Boundaries

- `/docpath-brainstorm`, `/docpath-refine`, `docpath analyze --dry-run`, and
  `docpath plan --dry-run` are prompt emitters for the current Claude session;
  they do not call a hidden LLM.
- `/docpath-write-spec`, `/docpath-write-plan`, `/docpath-write-design`, and
  `docpath write-analysis` are artifact sinks for content Claude has already
  generated or selected.
- `status`, `next`, `go`, `agent`, `check`, `review`, and `changes` are
  deterministic workflow gates.
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. Claude owns semantic recovery decisions:
  whether a drifted spec is a new task, an old task restore, or a user-confirmed
  reset.
- If `/docpath-next`, `/docpath-status`, `docpath check`, or `docpath tasks
  drift` reports task identity drift, do not repair it with `agent step`; choose
  a restore/reset/capture/promote path with explicit user intent.
- `/docpath-next` / `docpath next --agent` is read-only and advisory. Use it at
  session start/resume or when state is uncertain; do not treat it as
  permission, a lock, or a required prelude to an explicit deterministic
  command.
- State-changing commands must re-read workflow state and enforce their own
  preconditions. `docpath go --step <id>` is atomic step control: it
  claims/starts that step only if it is allowed now.
- Treat `--dry-run` output as preview material, not final evidence.

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
2. Atomically claim/start the active step with `docpath go --step <id>`.
3. Make the scoped change.
4. Record completion with `docpath agent step --step "<id>" --status done`.
5. Run `docpath check` and `docpath agent done` before claiming completion.
6. Use `docpath agent handoff` when another session may resume the work.

## Required Gates

- Do not skip the next route check at start/resume or when state is uncertain.
  Do not require it before an explicit deterministic command; that command must
  enforce its own gate. Use status only for explicit status/debug snapshots,
  suspected drift, or confirmation after state-changing commands.
- Do not act from memory alone.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Product/UI work must clarify target user, entry point, data scope, and
  interaction model before implementation.
- Brand-new projects or requirement-discussion work that starts from PPT text,
  API docs, meeting notes, intro docs, or a rough requirements file must use the
  project-intake requirements-shaping flow before backlog work:
  `project capture -> project analyze -> gap index/questions/decision cards ->
  project brief with approval gate -> confirmed project backlog guidance`.
  Do not create executable backlog items from unapproved intake materials.
  Before development, the minimum frozen standards package is
  `requirements.md`, `architecture.md`, and `development-checklist.md`.
  `open-questions.md`, `decisions/*.md`, and `style.md` are optional by
  complexity. Do not require `phase-backlog.md`; backlog quality belongs to
  structured backlog items. Do not treat inferred architecture or draft
  standards as approved development rules.
- Major changes to architecture, data contracts, UI information architecture,
  workflow behavior, permission boundaries, task scope, existing capabilities,
  or long-term maintenance cost require brainstorm/refine plus a Decision Brief
  and explicit user confirmation before implementation.
- Run `docpath check` before marking work complete.
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.

## Decision Log Aging

- `workspace/decisions.md` keeps recent ADR entries only.
- `docpath journal` rotates older entries into `workspace/decisions-YYYY-MM.md`.
- Read historical monthly archives explicitly instead of loading all decisions.
- Write decisions only for reusable architecture, workflow, or behavior choices
  with context, impact, boundaries, and alternatives.
