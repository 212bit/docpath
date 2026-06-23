---
name: docpath-design
description: Design quality lens for DocPath work covering UX information architecture page states interaction decisions prototype review and handoff evidence
---

# DocPath Design

Use this skill when the user explicitly asks for a UX/design lens or the active DocPath task explicitly opts into UI design (`ui_gate.state: required`): UI/UX design, visual direction, prototype critique, design approval, Figma/Stitch/v0/Framer handoff, or design-to-implementation handoff.

This is a **quality lens**, not a parallel workflow. Use the main `docpath` skill for lifecycle routing and pre-development analysis commands.

Ordinary product UI or frontend implementation work does not automatically trigger this skill. Mentions of pages, layout, navigation, components, CSS, dashboard, or frontend code are implementation scope unless the user also asks for design, prototype, approval, wireframes, mockups, or UI brief evidence.

## Approval-gated UI/UX route

When the user explicitly requests design work, or the active task has `ui_gate.state: required`, treat it as an approval-gated UI/UX task.

Required sequence before product UI implementation:

```text
UI Blueprint
→ Design Approval
→ Implementation
→ Visual Acceptance
```

Hard rules after explicit opt-in:

- Product UI implementation may start only after the minimum implementation gate passes: `ui-brief.md` exists as the canonical UI Blueprint and `design-approval.md` has `approval.state: approved`.
- `ui-brief.md` is the only default UI design truth source. It should be dense enough to drive high-fidelity image generation, wireframes, frontend implementation, and visual review.
- `design-approval.md` must stay thin: approval state, source, time, approver, and notes only. Do not duplicate the design there.
- `visual-acceptance.md` is post-implementation evidence against `ui-brief.md`; it is not required before implementation.
- Optional artifacts such as `frontend-stack.md`, `external-design-handoff.md`, and `design-preview.md` may be used for unusual tasks, but selected design decisions must be reflected back into `ui-brief.md` before implementation.
- Do not treat the user's approval of this workflow as approval of a concrete visual design.
- If `design-approval.md` is missing, `pending`, or `rejected`, stop and ask the user to approve or reject the concrete design direction before implementation.
- Approval must be recorded as a DocPath task artifact, not as a separate state machine outside DocPath.
- External design tools such as Stitch, Figma, v0, or Framer may be used, but the approved direction must be captured in `ui-brief.md`; archive large prompt/output history separately only when it is useful.

## UI Blueprint

Before implementation, `ui-brief.md` should record all 8 sections. Apply the lean rule: **every line must answer a developer/agent question at implementation time. Delete anything that only explains *why* a decision was made.**

Section-level guidance:

- **Screen Contract** (3–5 lines): target user, entry point, primary job, non-goals. No background narrative.
- **Flow Contract**: navigation map (code block) + 2–3 key paths in 1–2 sentences each. No long user journey prose.
- **Layout Contract**: ASCII skeleton showing regions + brief spec (widths, heights, backgrounds). No rationale.
- **Component Contract**: a table — component name, visual style (exact values), hover/interaction. No CSS blocks.
- **State Contract**: a table — state, UI behavior, copy/action. Covers: loading, empty, error, success at minimum.
- **Visual Contract**: exact hex tokens with contrast ratios, font stack, spacing scale, radius/shadow values. No color-theory commentary.
- **Generation Contract** (**most detailed section**): a runnable high-fidelity prompt that an AI image generator can execute to produce a reviewable mockup, plus a wireframe prompt. Include all exact hex values, font names, layout dimensions, and component descriptions so the output is immediately usable for visual validation before coding starts.
- **Acceptance Contract**: a checklist of visual/behavioral conditions that the implemented UI must satisfy.

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

For management pages, explicitly analyze read/write boundaries, confirmation points, auditability, and permission visibility.

## Useful DocPath context

```bash
docpath next --agent
docpath status --agent  # diagnostics only
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
docpath write-design --kind brief --template
docpath write-design --kind brief --stdin
docpath write-design --kind approval --stdin
# after implementation
docpath write-design --kind acceptance --stdin
```

## Boundaries

- Do not create a separate design approval state outside DocPath; keep approval as a current task artifact.
- Do not duplicate the main `docpath analyze` procedure here; use this skill to improve the UI/UX section quality.
- Design guidance must land in analysis, spec, plan, deliverables, review, or journal.
