# /docpath-agent-handoff

Persist a compact handoff package for the next Claude Code session.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent handoff $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath agent handoff $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent handoff $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent handoff $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent handoff $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Follow-up

1. Confirm `.docpath/workspace/compact-context.md` was written.
2. Summarize the `recommended_command` from the embedded `Next Agent Route`.
3. Tell the next session to run `/docpath-status` and `/docpath-next`; read `compact-context.md` only when the handoff command or route explicitly requires the extra context.

## Expected Result

Claude should produce a short handoff summary with blockers, recent failure evidence, and next command.
