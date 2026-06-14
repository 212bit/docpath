# DocPath Agent Protocol

> This project uses DocPath as the shared workflow engine for Codex, Claude Code,
> OpenCode, and compatible coding agents.
>
> Default rule: agents consume DocPath through CLI summaries. JSON/JSONL files are
> machine truth sources. Markdown files are rendered human views and are not
> default agent inputs.

## First Steps

1. Run `docpath status --agent` to read the `agent_view: status` workflow
   snapshot: state, progress, drift, and install health.
2. Run `docpath next --agent` to read the `agent_view: next` route:
   `next_action`, `recommended_command`, required context, and exit criteria.
3. Follow the `recommended_command` unless the user explicitly changes direction.
4. Use `context_index`, `data_index`, `required_files`, and `current_focus` as an
   index. Do not expand files just because they are mentioned.
5. When details are needed, prefer `docpath reveal --topic <keyword> --level 1-3`
   or `docpath context --max-tokens 5000 --topic <keyword>`.
6. Record progress with DocPath lifecycle commands after each meaningful step.

## Access Model

DocPath is JSON-first internally and CLI-first for agents.

| Artifact | Role | Agent access |
| --- | --- | --- |
| `.docpath/workspace/state.json` | Runtime state truth | Use `docpath status --agent`; direct read only for debug. |
| `.docpath/workspace/current.md` | Human rendered state view | Do not read by default. |
| `.docpath/workspace/breadcrumb.jsonl` | Execution event truth | Use `status`, `next`, `reveal`, or `context`; direct tail only for debug. |
| `.docpath/workspace/breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `.docpath/tasks/current/spec.json` | Structured task spec truth | Prefer CLI summaries; direct read only when schema detail is needed. |
| `.docpath/tasks/current/spec.md` | Human spec view | Read on demand for full narrative requirements. |
| `.docpath/tasks/current/plan.json` | Structured task plan truth | Prefer `next`, `go`, and `reveal`. |
| `.docpath/tasks/current/plan.md` | Human plan view | Do not parse manually by default. |
| `.docpath/docs-index.json` | Document index truth | Never read in full; use CLI filtered summaries. |

Direct file reads are acceptable only when the CLI route or the debugging task
requires them. Keep direct reads scoped to the smallest file, topic, task id, or
tail range that answers the question.

## Command Boundaries

- Prompt emitters such as `brainstorm`, `refine`, `analyze --dry-run`, and
  `plan --dry-run` output structured prompt contracts or payload previews for the
  current agent session. They do not call a hidden LLM and do not replace
  current-session reasoning.
- Artifact sinks such as `write-spec`, `write-plan`, `write-design`, and
  `write-analysis` persist content already generated or selected by the current
  agent session.
- Workflow gates such as `status`, `next`, `go`, `agent enter/step/done`,
  `check`, `review`, and `changes` are deterministic state, routing, validation,
  lifecycle, review, and closeout commands.
- Treat `--dry-run` output as preview material only, not as durable final
  analysis/spec/plan evidence.

## Project Context

- `.docpath/backlog/` holds candidate work before it becomes an active task.
- `.docpath/tasks/` holds task artifacts: spec, plan, review, journal, and
  structured JSON mirrors.
- `.docpath/workspace/` holds runtime state, evidence, and rendered views.
- `.docpath/rules/` holds global style, architecture, and learned conventions.
- `.docpath/protocols/` and `templates/` hold installable agent protocol assets.

## Agent Lifecycle Commands

Use lifecycle commands instead of manual state edits:

```bash
docpath agent enter
docpath go --step S1
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
docpath agent handoff
```

Rules:

- Run `docpath agent enter` before code or protocol edits in an executable task.
- Run `docpath agent step` after each meaningful sub-task or major decision.
- Run `docpath agent done` before claiming a task is complete.
- Run `docpath agent handoff` when another session may resume the task.
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.

## Required Gates

1. Do not skip `docpath status --agent` and `docpath next --agent`.
2. Do not act from memory alone.
3. When a product/UI request lacks target user, entry point, data scope, or
   interaction model, clarify or run brainstorm/refine before implementation.
4. When a request may change technology stack, architecture or module
   boundaries, data/API contracts, UI information architecture, workflow or
   agent behavior, permission or write boundaries, task scope, existing
   capabilities, or long-term maintenance cost, run brainstorm/refine first.
   Record a Decision Brief in the task spec and wait for explicit user
   confirmation before implementation.
5. Do not hand-edit `state.json`, `current.md`, `breadcrumb.md`, or other
   workspace runtime views.
6. Run `docpath check` before marking work complete.
7. Let `docpath agent step` update breadcrumb and plan checklist state.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `docpath status --agent` | Machine-readable workflow state snapshot and health indexes |
| `docpath next --agent` | Machine-readable next-action route and command contract |
| `docpath reveal --level N --topic <keyword>` | Progressive context expansion |
| `docpath context --max-tokens 5000 --topic <keyword>` | Budgeted context package |
| `docpath go --step S1` | Load the selected plan step |
| `docpath check` | Quality gates |
| `docpath review` | Structured review |
| `docpath changes --agent` | Read-only git closeout and commit readiness view |
| `docpath journal` | Knowledge archive |
| `docpath gc` | Preview historical task directory archive candidates after closeout |
| `docpath gc-decisions` | Rotate old decision logs |

## Decision Log Aging

- `workspace/decisions.md` keeps recent ADR entries only.
- `docpath journal` rotates older entries into `workspace/decisions-YYYY-MM.md`.
- Historical decision queries should read the relevant monthly archive
  explicitly, not the full decision history.
- `docpath journal` should write decisions only for reusable architecture,
  workflow, or behavior decisions with context, impact, boundaries, and
  alternatives.

## Linked Project

Linked to: **docpath**
Config: `.docpath/config.yaml`
