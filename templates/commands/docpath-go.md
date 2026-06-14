# /docpath-go

Start or continue execution from the current DocPath plan.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath go $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath go $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath go $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js go $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js go $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If `$ARGUMENTS` is empty, let DocPath select the next pending step from the structured plan state.

## Follow-up

1. Read the command output and any listed required files.
2. Treat listed files as indexes; request focused context before opening generated Markdown views.
3. Implement only the selected step.
4. Record progress with `/docpath-agent-step`, then route with `/docpath-next`.
