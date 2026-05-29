# DocPath — Codex Agent Protocol

> This project uses **DocPath** as its task state machine and workflow memory.
> Read this file before making changes in Codex or Codex-compatible coding agents.

## First Steps

1. Run `docpath status --agent` or read `.docpath/workspace/current.md`.
2. Read `.docpath/workspace/breadcrumb.md` for recent progress.
3. Use `docpath next --agent` to choose the next safe action.
4. After each meaningful step, update DocPath state/breadcrumb via CLI or files.

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
- Keep changes scoped to the active task.
- Run `docpath check` before marking work complete.
- Record blockers and decisions in breadcrumb/review/journal files.
- Do not push unless explicitly requested.

## Linked Project

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
