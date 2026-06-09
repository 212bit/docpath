---
name: docpath-design
description: Design-focused DocPath adapter for UX, prototype review, design decisions, and deliverable evidence in Codex.
---

# DocPath Design

Use this skill for UX, design review, prototype critique, interaction decisions, or design-to-implementation handoff in a DocPath repository.

## First Commands

```bash
docpath status --agent
docpath next --agent
docpath roles context --role design-lead
```

For a new page, dashboard, workflow visualization, or data view, clarify target user, entry point, data scope, and interaction model before creating backlog, promoting a task, or writing code.

## Design Roles

Use the smallest relevant role:

```bash
docpath roles context --role design-lead
docpath roles context --role prototype-builder
```

## Design Deliverables

Render durable artifacts for reviewable design output:

```bash
docpath deliverables render --template prototype-review --output .docpath/tasks/current/deliverables/prototype-review.md
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables check
```

## Boundaries

- Design guidance must land in task evidence, deliverables, spec, plan, review, or journal.
- The skill does not create a parallel design approval gate.
- Implementation still follows `docpath next --agent` and the active plan.
