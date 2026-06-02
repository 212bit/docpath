# /docpath-config

Inspect or update DocPath configuration.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath config
elif command -v docpath >/dev/null 2>&1; then
  docpath config
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath config
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js config
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js config
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `list`, `get <key>`, or `set <key> <value>`.

