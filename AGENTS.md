# DocPath — Project Agent Guide

This repository uses **DocPath** as its task-state engine.

> For the full Codex/agent operating procedure, use the DocPath skill as the authority:
>
> - Installed skill: `.codex/skills/docpath/SKILL.md`
> - Template skill: `templates/codex-skills/docpath/SKILL.md`

AGENTS.md is only the project-level entry point and local constraint list. Do not duplicate the full Skill workflow here.

---

## Start Here

1. Run `node dist/index.js status --agent` or `docpath status --agent`.
2. Run `node dist/index.js next --agent` or `docpath next --agent`.
3. Follow the recommended command from `next --agent` unless the user explicitly changes direction.
4. Read `.docpath/workspace/breadcrumb.md` before changing files.
5. For detailed lifecycle rules, pre-development analysis, deliverables, roles, gates, and journal behavior, read the DocPath skill listed above.

---

## Local Project Constraints

- Do **not** push changes unless the user explicitly asks.
- Prefer local verification through `node dist/index.js ...` so edits are tested against the built CLI in this repository.
- Do not hand-edit `.docpath/workspace/current.md`; it is rendered from `.docpath/workspace/state.json`.
- If DocPath state is `checking` or `reviewing`, fix only the reported gate issue before proceeding.
- If DocPath state is `drafting`, finish or correct `spec.md` and move through `plan` before editing implementation files.
- Before code or document edits in an active task, enter the task through the DocPath lifecycle route (`go`, `run start`, or `agent enter`, as recommended by `next --agent`).
- After each meaningful sub-task, record progress with DocPath lifecycle commands so breadcrumb and plan stay synchronized.

---

## Project-Specific Clarification Gates

Stop and clarify before creating/promoting a task or writing code when:

- A request describes a product/UI surface such as a page, workflow visualization, or data view but lacks the target user, entry point, data scope, state model, or interaction model.
- A request may change technology stack, architecture/module boundaries, data model/API contract, UI information architecture/user journey, workflow/Agent behavior, permission or write-operation boundaries, task scope, existing capabilities, or long-term maintenance cost.

For these cases, use DocPath pre-development analysis/refinement first and capture the decision brief in task evidence before implementation.

---

## Repository Map

- Backlog: `.docpath/backlog/`
- Active/current task: `.docpath/tasks/current/`
- Canonical tasks: `.docpath/tasks/<task-id>/`
- Workspace/runtime state: `.docpath/workspace/`
- Rules and learned conventions: `.docpath/rules/`
- Codex skill source of truth: `.codex/skills/docpath/SKILL.md`
- Codex skill template: `templates/codex-skills/docpath/SKILL.md`

---

## Linked Project

<!-- DocPath:install will set this -->
Linked to: **docpath**
Config: `.docpath/config.yaml`
