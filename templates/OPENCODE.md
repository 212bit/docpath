# DocPath OpenCode Protocol

> This project uses **DocPath** as the shared workflow engine for OpenCode sessions.
> Treat `.docpath/` as the single source of truth for task state, recent progress, and next-step routing.

## First Thing You Do

1. Run `docpath status --agent` or read `.docpath/workspace/current.md`.
2. Run `docpath next --agent` to choose the next safe action.
3. Read `.docpath/workspace/breadcrumb.md` for recent progress and blockers.
4. Follow the `recommended_command` from `next --agent` instead of guessing the next step.
5. After each meaningful step, record progress with `docpath agent step`.

## Core Files

- `.docpath/workspace/current.md` — rendered active state view generated from `state.json`
- `.docpath/workspace/breadcrumb.md` — execution trace for resume/handoff
- `.docpath/tasks/current/spec.md` — active task spec
- `.docpath/tasks/current/plan.md` — active task plan
- `.docpath/rules/` — global style, architecture, and learned conventions
- `.docpath/backlog/` — candidate work before it becomes an active task

## Agent Lifecycle Commands

```bash
docpath agent enter                         # load current state and print agent context
docpath go --step S1                        # load the selected sub-task from the active plan
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
docpath agent handoff
docpath continue
```

## OpenCode Workflow

### 1. Start or Resume
```bash
docpath agent enter
docpath next --agent
```

### 2. Execute a Sub-task
```bash
docpath go --step S1
# ... do work ...
docpath agent step --step "S1" --status done
```

### 3. Complete the Task
```bash
docpath check
docpath agent done --step "<task>"
```

### 4. Handoff or Resume Later
```bash
docpath agent handoff
docpath continue
```

## Rules

- Do not act from memory alone; read DocPath state first.
- Clarify product/UI requests before implementation when the target user, entry point, data scope, or interaction model is ambiguous. This applies to pages, workflow visualizations, and data views.
- For major changes, including technology stack, architecture/module boundaries, data model/API contract, UI information architecture/user journey, workflow/Agent behavior, permission or write-operation boundaries, task scope, existing capabilities, or long-term maintenance cost, run brainstorm/refine first. Write a Decision Brief in the task spec and wait for explicit user confirmation before promoting an implementation task or writing implementation code.
- Do not hand-edit `state.json` or workflow fields in `current.md`.
- Do not use `current.md` as task truth; task spec/plan live under `.docpath/tasks/`.
- Use `docpath next --agent` when the route is unclear.
- Run `docpath check` before claiming completion.
- Use `docpath agent handoff` when another session may resume the task.

## Config

Config: `.docpath/config.yaml`
