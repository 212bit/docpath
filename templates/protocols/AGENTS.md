# DocPath Agent Protocol

> This project uses DocPath as the shared workflow engine for Codex, Claude Code,
> OpenCode, and compatible coding agents.
>
> Default rule: agents consume DocPath through CLI summaries. JSON/JSONL files are
> machine truth sources. Markdown files are rendered human views and are not
> default agent inputs.

## First Steps

1. Run `docpath next --agent` to read the `agent_view: next` route and the
   current workflow snapshot: `next_action`, `recommended_command`, required
   context, exit criteria, state, progress, drift, and install health.
2. Follow the `recommended_command` unless the user explicitly changes direction.
3. Use `context_index`, `data_index`, `required_files`, and `current_focus` as an
   index. Do not expand files just because they are mentioned.
4. Use `docpath status --agent` only when an explicit status/debug snapshot,
   drift check, or post-mutation confirmation is needed.
5. When details are needed, prefer `docpath reveal --topic <keyword> --level 1-3`
   or `docpath context --max-tokens 5000 --topic <keyword>`.
6. Record progress with DocPath lifecycle commands after each meaningful step.

## Access Model

DocPath is JSON-first internally and CLI-first for agents.

| Artifact | Role | Agent access |
| --- | --- | --- |
| `.docpath/workspace/state.json` | Runtime state truth | Use `docpath next --agent` for start/resume; use `docpath status --agent` for diagnostics. |
| `.docpath/workspace/current.md` | Human rendered state view | Do not read by default. |
| `.docpath/workspace/breadcrumb.jsonl` | Execution event truth | Use `next`, `status`, `reveal`, or `context`; direct tail only for debug. |
| `.docpath/workspace/breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `.docpath/tasks/current/spec.json` | Structured task spec truth | Prefer CLI summaries; direct read only when schema detail is needed. |
| `.docpath/tasks/current/spec.md` | Human spec view | Read on demand for full narrative requirements. `backlog promote` seeds spec.md with backlog background/FR/AC/evidence — edit the seed incrementally; reserve full `write-spec` rewrites for genuine resets. |
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
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. Agent owns semantic recovery decisions: whether
  a drifted spec is a new task, an old task restore, or a user-confirmed reset.
- If `next`, `status`, `check`, or `task drift` reports task identity drift, do
  not repair it with `agent step`; choose a restore/reset/capture/promote path
  with explicit user intent.
- `docpath next --agent` is a read-only advisory router for session
  start/resume and uncertain state. It does not grant permission, hold locks, or
  replace command preflight gates. Do not require it before an explicit
  deterministic user command such as `go --step`, `check`, `review`, or
  `changes`.
- State-changing commands such as `go`, `agent enter/step/done`, `plan`,
  `check`, `review`, `journal`, and `backlog promote` must re-read workflow
  state and enforce their own preconditions.
- `docpath go --step <id>` is atomic step control: it claims/starts the selected
  step only if the workflow allows that step now.
- Treat `--dry-run` output as preview material only, not as durable final
  analysis/spec/plan evidence.

## Project Context

- `.docpath/backlog/` holds candidate work before it becomes an active task.
- `.docpath/project-intake/` holds brand-new project intake packages created
  from raw source materials before they become backlog/spec/plan work.
- `.docpath/tasks/` holds task artifacts: spec, plan, review, journal, and
  structured JSON mirrors.
- `.docpath/workspace/` holds runtime state, evidence, and rendered views.
- `.docpath/rules/` holds global style, architecture, and learned conventions.
- `.docpath/protocols/` and `templates/` hold installable agent protocol assets.

## Agent Lifecycle Commands

Use lifecycle commands instead of manual state edits:

```bash
docpath quick "Fix typo in docs"   # only for tiny low-risk changes
```

<!-- docpath:block lifecycle-commands -->
```bash
docpath go --step S1
docpath agent enter   # optional session declaration; requires an executing step
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
```
<!-- /docpath:block -->

Rules:

- Run `docpath go --step <id>` to claim the active step before code or protocol edits; `docpath agent enter` is an optional session declaration and is legal only after the step is executing.
- Use `docpath project capture` when the user has a brand-new project that
  starts from PPT-derived text, API docs, introductory docs, meeting notes, or a
  single rough requirements document. Do not force these raw materials into
  backlog. Treat project intake as a requirements-shaping workflow:
  `capture -> analyze -> gap index/questions/decision cards -> brief with
  approval gate -> settle requirements/architecture/phase scope/approval ->
  backlog guidance`. Use `docpath project analyze`, `project brief`,
  `project settle`, and confirmed `project backlog` guidance before creating
  executable backlog items. Unapproved intake output is evidence, not a task.
  Before development, the minimum frozen standards package is
  `requirements.md` and `architecture.md`.
  `open-questions.md`, `decisions/*.md`, and `style.md` are optional by
  complexity. Do not require `phase-backlog.md`, checklist, or handoff docs;
  backlog quality belongs to structured backlog items and gates belong in
  DocPath checks. Do not treat inferred architecture or draft standards as
  approved development rules.
- Use `docpath quick "<title>"` for tiny low-risk edits. It creates a lightweight
  task, requires check on closeout, and skips full review by quick profile.
  Escalate to the standard lifecycle when scope touches architecture, protocol,
  permissions, migrations, CI/CD, or broad multi-file changes. For full-cycle
  tasks, pick the lowest fitting complexity level: estimated diff under ~100
  lines, single module, no contract/workflow change → `level 1` (do not default
  to `level 2` for small fixes).
- Run `docpath agent step` after each meaningful sub-task or major decision.
- Run `docpath agent done` before claiming a task is complete.
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.

## Required Gates

1. Do not skip `docpath next --agent` at start/resume or when state is
   uncertain. Do not require it before an explicit deterministic user command;
   that command must enforce its own gate. Use `docpath status --agent` only for
   explicit status/debug snapshots, suspected drift, or confirmation after
   state-changing commands.
2. Do not act from memory alone.
3. For trivial low-risk edits, prefer `docpath quick "<title>"` over a full
   backlog/spec/plan cycle. Do not use quick as a bypass for architecture,
   workflow, permission, migration, CI/CD, or broad module changes.
4. When a product/UI request lacks target user, entry point, data scope, or
   interaction model, clarify or run brainstorm/refine before implementation.
5. When a request may change technology stack, architecture or module
   boundaries, data/API contracts, UI information architecture, workflow or
   agent behavior, permission or write boundaries, task scope, existing
   capabilities, or long-term maintenance cost, run brainstorm/refine first.
   Record a Decision Brief in the task spec and wait for explicit user
   confirmation before implementation.
6. Do not hand-edit `state.json`, `current.md`, `breadcrumb.md`, or other
   workspace runtime views.
7. Run `docpath check` before marking work complete.
8. Let `docpath agent step` update breadcrumb and plan checklist state.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `docpath next --agent` | Default agent start/resume route with command contract and compact state snapshot |
| `docpath status --agent` | Diagnostic workflow state snapshot and health indexes |
| `docpath reveal --level N --topic <keyword>` | Progressive context expansion |
| `docpath context --max-tokens 5000 --topic <keyword>` | Budgeted context package |
| `docpath go --step S1` | Atomically claim/start the selected plan step |
| `docpath check` | Quality gates |
| `docpath review` | Structured review |
| `docpath changes --agent` | Read-only git closeout and commit readiness view |
| `docpath journal` | Knowledge archive |
| `docpath gc` | Preview workspace cleanup candidates and inactive task archive candidates; `--force` executes |
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

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
