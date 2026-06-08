# /docpath-dashboard

Open the local read-only DocPath Agent Dashboard.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath dashboard
elif command -v docpath >/dev/null 2>&1; then
  docpath dashboard
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath dashboard
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js dashboard
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js dashboard
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--port <port>` to choose a port. Use `--print` for HTML output or `--json` for machine-readable dashboard data.
Use `--root <path>` or `--project <name|task-id|root>` to open a registered project in read-only mode.
Use `--status <status>`, `--priority <priority>`, or `--q <query>` to filter the read-only Backlog Board.
