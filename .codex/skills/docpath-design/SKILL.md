---
name: docpath-design
description: Design quality lens for UX information architecture interaction decisions and design-to-implementation handoff
---

# DocPath Design

Use this skill when a DocPath task needs **UX/design analysis**: new pages, management screens, workflow views, information architecture, interaction decisions, or design-to-implementation handoff.

This is a **quality lens** that integrates with the main `docpath` workflow. Use the main `docpath` skill for lifecycle routing (`status`, `next`, `go`, `check`, `done`).

## When to Use

- Task mentions UI, UX, page, layout, navigation, visual design, responsive behavior
- User asks to "add a page/management page/settings screen" before design is settled
- Prototype critique, interaction decisions, or design handoff is needed
- External design tools (Figma, Stitch, v0, Framer) are involved

## Approval-Gated UI/UX Route

When the request or active task involves **product UI** (not CLI/config/internal tooling), follow this sequence:

```text
UI Prompt Brief
→ External Design Handoff (if using Figma/Stitch/v0/Framer)
→ Design Preview
→ Design Approval ⚠️ GATE
→ Implementation
→ Visual Acceptance
```

### Hard Rules

- **Do not write product UI code** before `ui-brief.md`, `design-preview.md`, and `design-approval.md` exist in the current task
- **Do not treat workflow approval as design approval**—the user must approve the concrete visual design direction
- If `design-approval.md` is missing, `pending`, or `rejected`, **stop and ask** for explicit design approval
- Approval must be recorded as a DocPath task artifact (use `docpath write-design`)
- External design tool outputs must be recorded in `external-design-handoff.md`

## Design Quality Bar

UI/UX analysis must be **specific enough for implementation planning**. Cover:

- **Target user**: intent, entry point, success path
- **Information architecture**: page/region hierarchy, component inventory
- **Critical flows**: happy path, error recovery, edge cases
- **State matrix**: loading, empty, error, partial data, permission denied, disabled, success, destructive action
- **Responsive behavior**: breakpoints, mobile/tablet/desktop differences
- **Accessibility**: keyboard/focus, ARIA, semantics, screen reader experience
- **Copy tone**: voice, labels, error messages
- **Data density**: filtering, search, sort, pagination, bulk actions (where relevant)
- **Design risks**: usability tradeoffs, open questions

For **management pages**, explicitly analyze read/write boundaries, confirmation points, auditability, and permission visibility.

## DocPath Integration

### Analysis Input
Use `docpath analyze` as the structured payload source:

```bash
docpath analyze --mode deep --content "<requirement>"
```

The returned `ui` section provides the mandatory structure.

### Analysis Output
Persist design conclusions through DocPath:

```bash
docpath write-analysis --section ui --stdin
docpath write-analysis --section risks --stdin
```

For approval-gated UI/UX work, also create:

```bash
docpath write-design --kind brief --stdin
docpath write-design --kind handoff --stdin
docpath write-design --kind preview --stdin
docpath write-design --kind approval --stdin
docpath write-design --kind acceptance --stdin
```

### Role Context
Load design role profiles when deeper expertise is needed:

```bash
docpath roles context --role design-lead
docpath roles context --role prototype-builder
```

Role output must land in analysis sections or deliverables, not stay in chat only.

### Deliverables
Render structured design artifacts:

```bash
docpath deliverables render --template prototype-review --output .docpath/tasks/current/deliverables/prototype-review.md
docpath deliverables check
```

## Boundaries

- Don't create a separate design approval state outside DocPath—keep approval as a current task artifact
- Don't treat design analysis as permission to write code—implementation requires design approval first
- Design guidance must land in `analysis/`, `spec`, `plan`, `deliverables/`, or `journal`
