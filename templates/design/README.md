# UI/UX Design Evidence Templates

DocPath defaults to a compact UI design evidence model:

```text
UI Blueprint
→ Design Approval
→ Implementation
→ Visual Acceptance
```

The canonical design source is `ui-brief.md`. It must be dense enough to drive
high-fidelity UI image generation, wireframes, frontend implementation, and
visual review without forcing agents to reconcile multiple competing design
documents.

## Default Artifacts

- `ui-brief.md`: the single UI design truth source. It records the screen,
  user flow, layout, components, states, visual system, generation prompts, and
  acceptance contract.
- `design-approval.md`: a thin state artifact that records whether the current
  `ui-brief.md` is approved for implementation. It must not repeat the design.
- `visual-acceptance.md`: a thin post-implementation evidence artifact that
  records screenshots, checks, drift, and result against `ui-brief.md`.

## Optional Artifacts

These templates remain available for unusual tasks, but they are not part of
the default UI gate:

- `frontend-stack.md`: use when the task needs a separate framework/runtime/CSS
  decision before design.
- `external-design-handoff.md`: use when external tools such as Stitch, Figma,
  v0, or Framer produce substantial prompts, outputs, or alternatives that
  should be archived.
- `design-preview.md`: use when a task needs a separate precision design sheet.
  The selected values must still be reflected back into `ui-brief.md` before
  implementation so agents have one canonical design source.

## Gate Rules

User agreement to use this UI workflow is not approval of a concrete UI design.
For an explicitly opted-in UI task, implementation may start only when:

- `ui-brief.md` exists and includes the required blueprint sections.
- `design-approval.md` exists with `approval.state: approved`.

`visual-acceptance.md` is produced after implementation. It supports check and
review closeout, but it does not approve implementation by itself.

## Rollback

If a design direction is rejected, update `design-approval.md` to `rejected`
with concise notes, revise `ui-brief.md`, and request approval again. Do not
split the current design truth across old handoff, preview, or acceptance files.
