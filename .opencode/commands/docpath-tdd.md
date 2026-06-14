# /docpath-tdd

Drive the DocPath TDD workflow.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath tdd $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath tdd $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath tdd $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js tdd $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js tdd $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--action start`, `--action next`, `--action done`, or `--dry-run`.
