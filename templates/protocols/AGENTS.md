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

- **Task Directory**: `.docpath/tasks/`
- **Spec**: `.docpath/tasks/<id>/spec.md`
- **Plan**: `.docpath/tasks/<id>/plan.md`
- **Review**: `.docpath/tasks/<id>/review.md`
- **Coding Style**: `.docpath/spec/style.md`

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
3. Always update `current.md` after state changes
4. Always write breadcrumb after each sub-task
5. Run `docpath check` before marking tasks complete
6. **After completing each sub-task, immediately check off the corresponding item in `current.md` checklist (`[ ]` → `[x]`)**

---

## Linked Project

<!-- DocPath:install will set this -->
Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
