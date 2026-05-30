# /docpath-go

Start or continue execution from the current DocPath plan.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath go --step "$ARGUMENTS"
elif command -v docpath >/dev/null 2>&1; then
  docpath go --step "$ARGUMENTS"
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath go --step "$ARGUMENTS"
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js go --step "$ARGUMENTS"
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js go --step "$ARGUMENTS"
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If `$ARGUMENTS` is empty, run the next pending step from `plan.md`.

## Follow-up

1. Read the command output and any listed required files.
2. Implement only the selected step.
3. Record progress with `/docpath-agent-step`, then route with `/docpath-next`.
