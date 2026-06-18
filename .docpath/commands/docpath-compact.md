# /docpath-compact

Persist a compact runtime context package.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath compact $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath compact $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath compact $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js compact $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js compact $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--max-entries 20`, `--dry-run`, or `--cleanup` when you
explicitly want workspace aging cleanup. Plain `compact` persists the compact
context package and does not prune workspace cleanup targets.
