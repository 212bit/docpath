# /docpath-write-journal

Append a generated knowledge record into the active DocPath task through the CLI.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath write-journal $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath write-journal $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath write-journal $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js write-journal $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js write-journal $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--content "..."` or `--stdin`. Let the CLI persist the record into the active task's structured and rendered artifacts.
