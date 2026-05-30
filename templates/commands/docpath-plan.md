# /docpath-plan

Generate an execution plan from the active `spec.md`.

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

Use `--dry-run` to preview without writing files. After planning, route with `/docpath-next`.

