# /docpath-write-design

Artifact sink: write UI/UX design evidence already generated or selected by the
current agent session into the active DocPath task.

This command is an evidence writer, not a workflow trigger. Writing a design
artifact does not by itself enable the UI design gate; the task must explicitly
opt in through `spec.json ui_gate.state: required`, the spec UI gate checkbox,
or a user-requested design flow.

Default flow after explicit opt-in:

```text
UI Blueprint
→ Design Approval
→ Implementation
→ Visual Acceptance
```

`ui-brief.md` is the canonical UI design source. It should be dense enough to
drive high-fidelity UI image generation, wireframes, frontend implementation,
and review. `design-approval.md` records only whether that blueprint is approved.
`visual-acceptance.md` records post-implementation evidence against the blueprint.

Optional artifacts such as `frontend-stack.md`, `external-design-handoff.md`,
and `design-preview.md` may be written for unusual tasks, but they are not the
default UI gate.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath write-design $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath write-design $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath write-design $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js write-design $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js write-design $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## kind
- `brief` / `ui-brief` / `ui-prompt-brief`: write `ui-brief.md`.
- `approval` / `design-approval`: write `design-approval.md`.
- `acceptance` / `visual-acceptance`: write `visual-acceptance.md`.
- `stack` / `frontend-stack` / `framework` / `framework-decision`: optionally write `frontend-stack.md`.
- `handoff` / `external-design-handoff` / `design-handoff`: optionally write `external-design-handoff.md`.
- `preview` / `design-preview`: optionally write `design-preview.md`.
- `all`: with `--template`, initialize `ui-brief.md`, `design-approval.md`, and `visual-acceptance.md`.

## Recommended Order
```bash
docpath write-design --kind brief --template
docpath write-design --kind brief --stdin
docpath write-design --kind approval --stdin
# after implementation
docpath write-design --kind acceptance --stdin
```

## Check Gate
`docpath check` verifies the following when an explicitly opted-in UI/UX task has implementation steps or product UI file changes:

- `ui-brief.md`, with the required UI Blueprint sections.
- `design-approval.md`, with `approval.state` set to `approved`.

If approval is `pending` or `rejected`, or if the approval source or approval
time is missing, stop implementation and ask the user to approve the concrete
`ui-brief.md` blueprint.
