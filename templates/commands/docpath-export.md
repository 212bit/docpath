# /docpath-export

Export the DocPath workflow state as standalone markdown.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath export
elif command -v docpath >/dev/null 2>&1; then
  docpath export
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath export
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js export
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js export
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--output <file>` to save the export, and `--full` when full spec/plan content is required.
