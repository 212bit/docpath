---
name: docpath-product
description: Product quality lens for DocPath work covering requirements PRDs user value journeys scope metrics and stakeholder tradeoffs
---

# DocPath Product

Use this skill when a DocPath task needs a product lens: requirements, PRDs, backlog shaping, stakeholder trade-offs, user journeys, success metrics, or scope decisions.

This is a **quality lens**, not a parallel workflow. Use the main `docpath` skill for lifecycle routing and pre-development analysis commands.

## Product quality bar

Product analysis must be durable and specific enough to guide spec/plan decisions. Cover:

- target users, personas, and primary jobs-to-be-done
- user value and expected behavior change
- success metrics and signals of failure
- core user journey, entry points, and exit states
- business rules, permissions, data ownership, and policy constraints
- scope boundaries, non-goals, release slicing, rollout and rollback
- assumptions, dependencies, risks, and blocking questions

Avoid one-line product conclusions. If details are missing, write explicit assumptions and confirmation questions.

## Useful DocPath context

```bash
docpath status --agent
docpath next --agent
docpath roles context --role product-director
docpath roles context --role requirement-analyst
docpath roles context --role user-researcher
docpath roles context --role competitive-analyst
```

## Durable outputs

Write product conclusions into DocPath evidence, for example:

```bash
docpath write-analysis --section product --stdin
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables render --template competitive-analysis --output .docpath/tasks/current/deliverables/competitive-analysis.md
docpath deliverables render --template stakeholder-update --output .docpath/tasks/current/deliverables/stakeholder-update.md
docpath deliverables check
```

## Boundaries

- Do not approve scope changes by skill authority alone; record the decision in spec/Decision Brief and follow DocPath gates.
- Do not duplicate the main `docpath analyze` procedure here; use this skill to improve the product section quality.
- Product recommendations must land in analysis, spec, plan, deliverables, review, or journal.
