# DocPath — Agent Workflow Protocol

> This project uses **DocPath** as the development workflow engine.
> **Document as FSM** — all task states are driven by files in `.docpath/`.

---

## First Thing You Do

1. Read `.docpath/workspace/current.md` to know the current state
2. Read `.docpath/workspace/breadcrumb.md` to understand progress
3. **Follow the state**: the `state` field tells you what to do
4. **Update state after each step**: modify `current.md` and `breadcrumb.md`

---

## Project Context

- **Task Directory**: `.docpath/tasks/`
- **Spec**: `.docpath/tasks/<id>/spec.md`
- **Plan**: `.docpath/tasks/<id>/plan.md`
- **Review**: `.docpath/tasks/<id>/review.md`
- **Coding Style**: `.docpath/spec/style.md`

---

## Commands

| Command | Description |
|---------|-------------|
| `docpath status` | View workflow state |
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
3. Always update `current.md` after state changes
4. Always write breadcrumb after each sub-task
5. Run `docpath check` before marking tasks complete

---

## Linked Project

<!-- DocPath:install will set this -->
Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
