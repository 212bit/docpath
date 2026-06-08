# DocPath — Agent Workflow Protocol

> This project uses **DocPath** as the development workflow engine.
> **Document as FSM** — all task states are driven by files in `.docpath/`.

---

## First Thing You Do

1. Run `docpath status --agent` or read `.docpath/workspace/current.md` to know the current state.
2. Run `docpath next --agent` to choose the next safe action.
3. Read `.docpath/workspace/breadcrumb.md` to understand recent progress.
4. **Follow the route**: the `recommended_command` from `next --agent` is the default next step.
5. **Update state after each step**: use DocPath lifecycle commands instead of manual state edits.

---

## Project Context

- **Backlog**: `.docpath/backlog/` — candidate work pool; priority and acceptance live here before a task starts.
- **Task Directory**: `.docpath/tasks/`
- **Spec**: `.docpath/tasks/<id>/spec.md`
- **Plan**: `.docpath/tasks/<id>/plan.md`
- **Review**: `.docpath/tasks/<id>/review.md`
- **Workspace**: `.docpath/workspace/` — rendered runtime state and execution evidence; `current.md` is generated from `state.json`.
- **Rules**: `.docpath/rules/` — global style, architecture, and learned conventions.

---



## Agent Lifecycle Commands

For Codex / Claude Code / OpenCode, prefer these enforceable lifecycle commands over manual file edits:

```bash
docpath agent enter                         # start: load state + print agent context
docpath agent step --step "<sub-task>"      # after each meaningful step
docpath agent done --step "<task>"          # run check/review + record completion
docpath agent handoff                       # compact context before session switch
```

Rules:
- Run `docpath agent enter` before changing code.
- Run `docpath agent step` after each sub-task or major decision.
- Run `docpath agent done` before claiming completion.
- Run `docpath agent handoff` when context is getting long or another agent may resume.

## Commands

| Command | Description |
|---------|-------------|
| `docpath status` | View workflow state |
| `docpath status --agent` | Machine-readable workflow state |
| `docpath next --agent` | Machine-readable next-action route |
| `docpath go` | Execute next step from plan |
| `docpath continue` | Resume from breadcrumb |
| `docpath check` | Run quality gates |
| `docpath review` | Structured code review |
| `docpath reveal --level N` | Progressive context (0-3) |

---

## Level System

- **L0**: Quick fixes (1-2 steps, no docs)
- **L1**: Light tasks (task.md, execute/verify)
- **L2**: Standard tasks (spec → plan → execute → check → review)
- **L3**: Complex tasks (full lifecycle, cross-session)

---

## Rules

1. Do NOT skip state checks
2. Do NOT execute from memory alone
3. When a request describes a product/UI surface such as a page, dashboard, workflow visualization, or data view but does not define the target user, entry point, data scope, and interaction model, stop and clarify before creating a backlog item, promoting a task, or writing code.
4. Do NOT hand-edit `current.md`; it is a rendered view of `workspace/state.json`
5. Always record progress with DocPath lifecycle commands after each sub-task
6. Run `docpath check` before marking tasks complete
7. Let `docpath agent step` update breadcrumb and plan checklist state

---

## Linked Project

<!-- DocPath:install will set this -->
Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
