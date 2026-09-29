---
related:
  - design/agent-integration.md
  - architecture/tool-evaluation-2026-06.md
---

# Codex Skill Adapter

DocPath can install project-level Codex Skills that expose a `$docpath` style entry while keeping DocPath as the task state machine.

## Install

```bash
docpath install --target codex
```

This installs:

- `AGENTS.md`
- `CODEX.md`
- `.codex/config.toml`
- `.codex/skills/docpath/SKILL.md`
- `.codex/skills/docpath-product/SKILL.md`
- `.codex/skills/docpath-design/SKILL.md`
- `.codex/skills/docpath-software/SKILL.md`

Existing files are not overwritten by default. Use `--force` only when you want DocPath to replace the installed assets:

```bash
docpath install --target codex --force
```

## Health Checks

Check manifest drift:

```bash
docpath install --target codex --check-only
```

Run the broader install health check:

```bash
docpath install --target codex --doctor
```

The doctor check validates install manifest health, local shim health, Codex config risk, missing Codex Skills, and Codex Skill frontmatter `name` values.

## Codex CLI / App Examples

In Codex CLI or Codex App, invoke the project Skills by name:

```text
$docpath continue the active task
$docpath-product refine this backlog item into an implementation-ready spec
$docpath-design review the prototype deliverable
$docpath-software implement the current plan and run the gates
```

The Skills are adapters. They should route Codex back to DocPath commands such as:

```bash
docpath next --agent
docpath agent enter
docpath roles context --role software-engineer
docpath deliverables list
docpath check
docpath review
docpath agent done
```

`docpath agent done` performs completion gates and journal closeout, but it
intentionally leaves canonical evidence at `.docpath/tasks/<task_id>/` for
`docpath changes --agent` and git closeout. Physical movement into
`.docpath/tasks/done/` is deferred to `docpath gc --force` after closeout.

Use `docpath status --agent` only for explicit status/debug snapshots, suspected
drift, or confirmation after state-changing commands.

`docpath next --agent` is an advisory router for session start/resume and
uncertain state. It is not a permission grant or lock, and explicit
deterministic commands such as `docpath go --step S1`, `docpath check`,
`docpath review`, and `docpath changes --agent` do not need a fresh `next`
prelude. Commands that change workflow state must re-read state and enforce
their own gates.

## Boundaries

- Codex Skills do not replace `spec -> plan -> go -> check -> review -> journal`.
- Codex Skills do not create a hidden expert-team state outside `.docpath/`.
- Role profiles provide context only; they do not approve or complete work.
- Deliverables provide durable task evidence; they do not replace DocPath quality gates.
- Install assets are project-level `.codex/skills` files, not global `~/.codex` files.
