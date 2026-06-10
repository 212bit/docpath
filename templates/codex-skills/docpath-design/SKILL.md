---
name: docpath-design
description: Design quality lens for DocPath work covering UX information architecture page states interaction decisions prototype review and handoff evidence
---

# DocPath Design

Use this skill when a DocPath task needs a UX/design lens: new pages, dashboards, management screens, workflow views, prototype critique, interaction decisions, or design-to-implementation handoff.

This is a **quality lens**, not a parallel workflow. Use the main `docpath` skill for lifecycle routing and pre-development analysis commands.

## Approval-gated UI/UX route

When the request or active task mentions UI, UX, dashboard, page, layout, navigation, visual design, responsive behavior, Figma, Stitch, v0, Framer, or equivalent interface work, treat it as an approval-gated UI/UX task.

Required sequence before product UI implementation:

```text
UI Prompt Brief
→ External Design Handoff
→ Design Preview
→ Design Approval
→ Implementation
→ Visual Acceptance
```

Hard rules:

- Do not write product UI code before `ui-brief.md`, `design-preview.md`, and `design-approval.md` exist in the current task.
- Do not treat the user's approval of this workflow as approval of a concrete visual design.
- If `design-approval.md` is missing, `pending`, or `rejected`, stop and ask the user to approve or reject the concrete design direction before implementation.
- Approval must be recorded as a DocPath task artifact, not as a separate state machine outside DocPath.
- External design tools such as Stitch, Figma, v0, or Framer may be used as handoff sources, but their prompts, outputs, selected direction, rejected direction, and constraints must be recorded in `external-design-handoff.md`.

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

For approval-gated UI/UX work, also create or update:

```bash
docpath write-design --kind brief --stdin
docpath write-design --kind handoff --stdin
docpath write-design --kind preview --stdin
docpath write-design --kind approval --stdin
docpath write-design --kind acceptance --stdin
```

## Boundaries

- Do not create a separate design approval state outside DocPath; keep approval as a current task artifact.
- Do not duplicate the main `docpath analyze` procedure here; use this skill to improve the UI/UX section quality.
- Design guidance must land in analysis, spec, plan, deliverables, review, or journal.
