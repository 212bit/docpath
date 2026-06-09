---
name: docpath
description: Use DocPath as the task state machine in Codex, with safe routing through status, next, lifecycle gates, roles, deliverables, check, review, and journal.
---

# DocPath

Use this skill when working in a repository that uses DocPath and the user asks to plan, implement, continue, review, or close work.

## Required Route

1. Run `docpath status --agent` to read the current finite-state-machine state.
2. Run `docpath next --agent` and follow its `recommended_command` unless the user explicitly changes direction.
3. Read `.docpath/workspace/breadcrumb.md` before making changes.
4. Before code or document edits in an active task, run `docpath agent enter`.
5. After each meaningful sub-task, run `docpath agent step --step "<step>"`.
6. Before claiming completion, run `docpath agent done`.

## Role Context

Use role profiles as context, not as an independent workflow:

```bash
docpath roles list
docpath roles context --role software-engineer
docpath roles context --role qa-engineer
```

Choose the smallest role context that matches the work. Role output must be written to task files, deliverables, review notes, or another DocPath evidence location.

## Deliverables

Use deliverables for structured product, design, engineering, or QA outputs:

```bash
docpath deliverables list
docpath deliverables render --template architecture-brief --output .docpath/tasks/current/deliverables/architecture-brief.md
docpath deliverables check
```

Deliverables do not replace `spec`, `plan`, `check`, `review`, or `journal`.

## Boundaries

- Do not bypass `spec -> plan -> go -> check -> review -> journal`.
- Do not create a hidden expert-team state outside `.docpath/`.
- Do not hand-edit `.docpath/workspace/current.md`.
- Do not mark work complete from conversation alone; use DocPath gates and evidence.
