# /docpath-run

Record low-level DocPath runtime lifecycle events.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath run $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath run $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath run $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js run $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js run $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `start --step S1`, `end --status done`, or `recover --note "..."`.
