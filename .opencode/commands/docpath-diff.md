# /docpath-diff

Inspect changes for the active task or step.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath diff $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath diff $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath diff $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js diff $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js diff $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--scope staged`, `--scope last`, `--scope step --step S1`, or `--scope all`.
