# /docpath-continue

Resume an interrupted task through the DocPath CLI.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath continue $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath continue $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath continue $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js continue $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js continue $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Follow-up

1. Read the command output as the resume summary.
2. Run `/docpath-next` to select the next safe action.
3. Treat any listed files as context indexes; do not open generated Markdown views unless the route, a debug need, or the user explicitly requires it.
4. If the state is blocked, report the blocker and the condition required to unblock it.
