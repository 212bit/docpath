# /docpath-debug

Run the systematic debugging workflow.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath debug $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath debug $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath debug $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js debug $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js debug $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use one action: `reproduce`, `isolate`, `hypothesize`, `verify`, or `fix`.

