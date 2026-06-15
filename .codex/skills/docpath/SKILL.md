---
name: docpath
description: DocPath workflow state machine for task lifecycle routing and evidence-based completion gates
---

# DocPath

Use this skill when working in a repository that uses DocPath for task planning, execution, review, and completion tracking.

## Core Workflow

1. **Get next action**: `docpath next --agent` — read the `agent_view: next`
   route, `recommended_command`, and compact workflow snapshot
2. **Follow recommended command** unless the user explicitly changes direction
3. **Use status only when needed**: `docpath status --agent` is for explicit
   status/debug snapshots, suspected drift, or confirmation after state-changing
   commands

`docpath next --agent` is read-only and advisory. Use it at session
start/resume or when state is uncertain; do not treat it as permission, a lock,
or a required prelude to an explicit deterministic command. State-changing
commands re-read workflow state and enforce their own preconditions.

Treat `context_index`, `data_index`, `required_files`, and `current_focus` as indexes, not instructions to read all files.

## When to Use Domain Skills

For analysis and quality work, delegate to domain-specific skills:

- **Product/requirements analysis** → `docpath-product` skill
- **UI/UX design analysis** → `docpath-design` skill  
- **Technical/engineering analysis** → `docpath-software` skill

Each domain skill integrates with DocPath evidence and lifecycle gates.

## Execution Lifecycle

For active implementation tasks:

```bash
docpath agent enter              # Enter execution mode (only when task is in executable phase)
docpath go --step <id>           # Atomically claim/start a plan step
# ... make changes ...
docpath agent step --step "<id>" --status done
docpath check                    # Quality gates
docpath agent done               # Record completion evidence
```

After each meaningful sub-task, run `docpath agent step`. Before claiming completion, run `docpath agent done` or follow the completion route from `docpath next --agent`.

If there is **no active task**, do not invent hidden state. Use `docpath next --agent` to find the route.

## Access Model

- **CLI output first**: Use DocPath CLI commands for context, not direct file reads
- **JSON = truth**: `state.json`, `plan.json`, `spec.json`, `breadcrumb.jsonl` are machine sources
- **Markdown = views**: `.md` files are human-rendered outputs or narrative documents
- **Scoped reads only**: Direct file reads allowed only when CLI route, debugging, or user explicitly requests specific content

Key files to avoid reading by default:
- `.docpath/workspace/current.md` (rendered state view)
- `.docpath/workspace/breadcrumb.md` (rendered progress view)
- `.docpath/tasks/current/plan.md` (rendered plan view)
- `.docpath/docs-index.json` (use `docpath reveal` or `docpath context` instead)

## Command Boundaries

DocPath commands fall into three categories:

### Prompt Emitters
Commands like `brainstorm`, `refine`, `analyze --dry-run`, and `plan --dry-run` output structured prompt contracts or payload previews. They do not call a hidden LLM and do not replace current-session reasoning.

### Artifact Sinks
Commands like `write-spec`, `write-plan`, `write-design`, and `write-analysis` persist content that Codex has already generated or selected in the current conversation.

### Workflow Gates
Commands like `status`, `next`, `go`, `agent enter/step/done`, `check`, `review`, and `changes` are deterministic state, routing, validation, lifecycle, review, and closeout commands.

CLI owns mechanical consistency checks: task identity, current/canonical task
file sync, state transition legality, plan/breadcrumb alignment, install
health, and closeout evidence. Codex owns semantic recovery decisions: whether
a drifted spec is a new task, an old task restore, or a user-confirmed reset.

If `next`, `status`, `check`, or `tasks drift` reports task identity drift, do
not repair it with `agent step`; choose a restore/reset/capture/promote path
with explicit user intent.

`next --agent` is the advisory router; `go --step <id>` is atomic step control.
State-changing commands must own their preflight gates instead of relying on a
previous `next` call.

**Important**: Do not treat prompt-emitter output as final content. Use the current Codex session to reason, then persist results through the relevant artifact sink. `--dry-run` commands are previews only—not evidence that final content exists.

## Pre-commit Gate

Before any `git commit`:

```bash
docpath changes --agent
```

Treat output as read-only closeout report. Only force-add exact canonical evidence paths it recommends. Do not force-add `.docpath/tasks/current/*` alias evidence by default.

## Deeper Context Commands

For focused context retrieval:

```bash
docpath reveal --topic <keyword> --level 1-3
docpath context --max-tokens 5000 --topic <keyword>
```

Use these instead of reading large state files directly.

## Boundaries

- Don't bypass spec → plan → go → check → review → journal for implementation tasks
- Don't create hidden expert-team state outside `.docpath/`
- Don't hand-edit `state.json` or generated workspace `.md` files  
- Don't mark work complete from conversation alone—use DocPath gates and evidence
