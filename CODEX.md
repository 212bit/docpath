# DocPath Codex Protocol

> This file is the Codex fallback protocol. Prefer `AGENTS.md` when the agent
> surface supports it.

## Start Here

1. Run `docpath status --agent`.
2. Run `docpath next --agent`.
3. Use the returned route and indexes before reading files.
4. Expand details with `docpath reveal --topic <keyword> --level 1-3` or
   `docpath context --max-tokens 5000 --topic <keyword>`.

## Access Model

- Agents should use DocPath CLI output as the default context.
- JSON/JSONL files are machine truth sources.
- Markdown files are rendered human views or narrative task documents.
- Do not default-read `.docpath/workspace/current.md`,
  `.docpath/workspace/breadcrumb.md`, `.docpath/tasks/current/plan.md`, or
  `.docpath/docs-index.json`.
- Direct reads are only for explicit debugging, schema inspection, or full
  narrative requirements after the CLI route indicates that more detail is
  needed.

## Lifecycle

```bash
docpath agent enter
docpath go --step S1
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
docpath agent handoff
```

## Rules

- Do not act from memory alone.
- Keep changes scoped to the active task.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Use lifecycle commands for progress and completion evidence.
- Clarify ambiguous product/UI requests before implementation.
- For major architecture, data, workflow, permission, or long-term maintenance
  changes, run brainstorm/refine and record a Decision Brief before coding.
- Run `docpath check` before marking work complete.

## Linked Project

Linked to: **docpath**
Config: `.docpath/config.yaml`
