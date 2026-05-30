# /docpath-write-spec

Write a refined spec into the active DocPath task.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath write-spec $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath write-spec $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath write-spec $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js write-spec $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js write-spec $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--content "..."` or `--stdin`. After success, route with `/docpath-plan` or `/docpath-next`.

