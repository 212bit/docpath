# /docpath-refine

Convert a requirement note into a structured DocPath spec input.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath refine
elif command -v docpath >/dev/null 2>&1; then
  docpath refine
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath refine
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js refine
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js refine
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Prefer `--file <path>` for existing notes, `--content "..."` for short input, or `--stdin` when piping content.
