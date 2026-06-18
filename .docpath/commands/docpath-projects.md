# /docpath-projects

View local projects registered in the DocPath SQLite registry.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath projects
elif command -v docpath >/dev/null 2>&1; then
  docpath projects
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath projects
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js projects
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js projects
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--json` for machine-readable registered project data.
