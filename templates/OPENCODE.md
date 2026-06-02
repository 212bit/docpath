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

- `.docpath/workspace/current.md` — active task state and checklist
- `.docpath/workspace/breadcrumb.md` — execution trace for resume/handoff
- `.docpath/tasks/current/spec.md` — active task spec
- `.docpath/tasks/current/plan.md` — active task plan

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
- Do not hand-edit `state.json` or workflow fields in `current.md`.
- Use `docpath next --agent` when the route is unclear.
- Run `docpath check` before claiming completion.
- Use `docpath agent handoff` when another session may resume the task.

## Config

Config: `.docpath/config.yaml`
