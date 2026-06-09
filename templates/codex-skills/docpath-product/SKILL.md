---
name: docpath-product
description: Product-focused DocPath adapter for requirements, PRDs, competitive analysis, stakeholder updates, and role-based context in Codex.
---

# DocPath Product

Use this skill for product strategy, requirements, PRDs, competitive analysis, stakeholder updates, or backlog shaping in a DocPath repository.

## First Commands

```bash
docpath status --agent
docpath next --agent
docpath roles context --role product-director
```

If the work changes scope, workflow, user journey, API contract, data model, permission boundary, or long-term maintenance cost, run brainstorm/refine first and record the Decision Brief in the active task spec.

## Product Roles

Use the smallest relevant role:

```bash
docpath roles context --role product-director
docpath roles context --role requirement-analyst
docpath roles context --role user-researcher
docpath roles context --role competitive-analyst
```

## Product Deliverables

Render structured outputs when the task needs a durable artifact:

```bash
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables render --template competitive-analysis --output .docpath/tasks/current/deliverables/competitive-analysis.md
docpath deliverables render --template stakeholder-update --output .docpath/tasks/current/deliverables/stakeholder-update.md
docpath deliverables check
```

## Boundaries

- Product recommendations must land in spec, plan, deliverables, review, or journal.
- The skill does not approve scope changes by itself.
- Completion still requires `docpath check`, `docpath review`, or `docpath agent done` as routed by DocPath.
