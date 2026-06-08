# DocPath — Codex Agent Protocol

> This project uses **DocPath** as its task state machine and workflow memory.
> Read this file before making changes in Codex or Codex-compatible coding agents.

## First Steps

1. Run `docpath status --agent` or read `.docpath/workspace/current.md`.
2. Read `.docpath/workspace/breadcrumb.md` for recent progress.
3. Use `docpath next --agent` to choose the next safe action.
4. After each meaningful step, update DocPath state/breadcrumb via lifecycle commands.

## Information Architecture

- `.docpath/backlog/` holds candidate work before it becomes an active task.
- `.docpath/tasks/` holds task truth: spec, plan, review, and task journal.
- `.docpath/workspace/` holds runtime state and evidence; `current.md` is rendered from `state.json`.
- `.docpath/rules/` holds global style, architecture, and learned conventions.



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

## Useful Commands

```bash
docpath status --agent
docpath context --agent
docpath next --agent
docpath check
docpath review
docpath journal --dry-run
docpath compact
```

## Rules

- Do not act from memory alone; read DocPath state first.
- Clarify product/UI requests before implementation when the target user, entry point, data scope, or interaction model is ambiguous. This applies to pages, dashboards, workflow visualizations, and data views.
- For major changes, including technology stack, architecture/module boundaries, data model/API contract, UI information architecture/user journey, workflow/Agent behavior, permission or write-operation boundaries, task scope, existing capabilities, or long-term maintenance cost, run brainstorm/refine first. Write a Decision Brief in the task spec and wait for explicit user confirmation before promoting an implementation task or writing implementation code.
- Keep changes scoped to the active task.
- Run `docpath check` before marking work complete.
- Record blockers and decisions in breadcrumb/review/journal files.
- Do not hand-edit `current.md`; use DocPath commands to update state.
- Do not push unless explicitly requested.

## Linked Project

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
