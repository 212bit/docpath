# /docpath-docs

Manage the DocPath document asset index.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath docs $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath docs $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath docs $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js docs $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js docs $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--scan`, `--list`, or `--add <path>`.

