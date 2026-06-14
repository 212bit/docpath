# /docpath-review

Run a structured code review for the active task.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath review $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath review $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath review $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js review $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js review $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--scope staged`, `--scope last_commit`, `--no-ai`, or `--approve`.
