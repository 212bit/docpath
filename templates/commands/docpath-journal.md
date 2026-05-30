# /docpath-journal

Archive lessons from the completed task.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath journal $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath journal $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath journal $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js journal $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js journal $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--dry-run` to preview, or `--skip-ai` when no model-assisted summary is desired.

