# /docpath-write-design

Artifact sink: write UI/UX design evidence already generated or selected by the
current agent session into the active DocPath task.

Required flow:

```text
UI Prompt Brief
→ External Design Handoff
→ Design Preview
→ Design Approval
→ Implementation
→ Visual Acceptance
```

User agreement to use this workflow is not approval of a specific visual direction. Product UI implementation may start only after `design-approval.md` has `approval.state: approved` with the approval source, approval time, approval rationale, and rejected directions recorded.

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
- `handoff` / `external-design-handoff` / `design-handoff`: write `external-design-handoff.md`.
- `preview` / `design-preview`: write `design-preview.md`.
- `approval` / `design-approval`: write `design-approval.md`.
- `acceptance` / `visual-acceptance`: write `visual-acceptance.md`.

## Recommended Order
```bash
docpath write-design --kind brief --stdin
docpath write-design --kind handoff --stdin
docpath write-design --kind preview --stdin
docpath write-design --kind approval --stdin
docpath write-design --kind acceptance --stdin
```

## External Design Handoff
`external-design-handoff.md` should record prompts, output links or snapshots, selected directions, rejected directions, and implementation constraints from Stitch, Figma, v0, Framer, or another design tool. If no external tool is used, record equivalent design inputs, candidate directions, and rejected directions so implementation is not based only on verbal preference.

## Check Gate
`docpath check` verifies the following when a UI/UX task has implementation steps or product UI file changes:

- `ui-brief.md`
- `external-design-handoff.md`
- `design-preview.md`
- `visual-acceptance.md`
- `design-approval.md`, with `approval.state` set to `approved`

If approval is `pending` or `rejected`, or if the approval source, approval time, or rejected directions are missing, stop implementation and ask the user to approve a specific visual direction.
