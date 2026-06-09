---
name: docpath-design
description: "Design-quality lens for DocPath work: UX, information architecture, page states, interaction decisions, prototype review, and handoff evidence."
---

# DocPath Design

Use this skill when a DocPath task needs a UX/design lens: new pages, dashboards, management screens, workflow views, prototype critique, interaction decisions, or design-to-implementation handoff.

This is a **quality lens**, not a parallel workflow. Use the main `docpath` skill for lifecycle routing and pre-development analysis commands.

## Design quality bar

UI/UX analysis must be specific enough for implementation planning. Cover:

- target user, intent, entry point, and success path
- information architecture and page/region hierarchy
- component inventory and responsibilities
- critical flows and interaction model
- state matrix: loading, empty, error, partial data, permission denied, disabled, success, destructive action
- responsive behavior, accessibility, keyboard/focus, semantics, and copy tone
- data density, filtering/search/sort, pagination, and bulk-action behavior where relevant
- design risks, usability trade-offs, and open questions

For management pages and dashboards, explicitly analyze read/write boundaries, confirmation points, auditability, and permission visibility.

## Useful DocPath context

```bash
docpath status --agent
docpath next --agent
docpath roles context --role design-lead
docpath roles context --role prototype-builder
```

## Durable outputs

Write design conclusions into DocPath evidence, for example:

```bash
docpath write-analysis --section ui --stdin
docpath deliverables render --template prototype-review --output .docpath/tasks/current/deliverables/prototype-review.md
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables check
```

## Boundaries

- Do not create a separate design approval state outside DocPath.
- Do not duplicate the main `docpath analyze` procedure here; use this skill to improve the UI/UX section quality.
- Design guidance must land in analysis, spec, plan, deliverables, review, or journal.
