# DocPath Codex Protocol

> This file is the Codex fallback protocol. Prefer `AGENTS.md` when the agent
> surface supports it.

## Start Here

1. Run `docpath next --agent` for the `agent_view: next` route,
   `recommended_command`, and compact workflow snapshot.
2. Use the returned route and indexes before reading files.
3. Use `docpath status --agent` only for explicit status/debug snapshots,
   suspected drift, or confirmation after state-changing commands.
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

## Command Boundaries

- `brainstorm`, `refine`, `analyze --dry-run`, and `plan --dry-run` are prompt
  emitters for the current Codex session; they do not call a hidden LLM.
- `write-spec`, `write-plan`, `write-design`, and `write-analysis` are artifact
  sinks for content Codex has already generated or selected.
- `status`, `next`, `go`, `agent`, `check`, `review`, and `changes` are
  deterministic workflow gates.
- `docpath next --agent` is read-only and advisory. Use it at session
  start/resume or when state is uncertain; do not treat it as permission, a
  lock, or a required prelude to an explicit deterministic command.
- State-changing commands must re-read workflow state and enforce their own
  preconditions. `docpath go --step <id>` is atomic step control: it
  claims/starts that step only if it is allowed now.
- Treat `--dry-run` output as preview material, not final evidence.

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
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.

## Linked Project

Linked to: **docpath**
Config: `.docpath/config.yaml`
