# /docpath-plan

Emit the planning prompt and sync a conservative local plan for continuity.
Complex planning should be done by the current agent session and persisted with
`/docpath-write-plan`.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath plan $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath plan $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath plan $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js plan $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js plan $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--dry-run` to preview the prompt without writing files or state. After
planning, route with `/docpath-next`.
