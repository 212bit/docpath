# /docpath-init

Initialize `.docpath/` in the current project.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath init $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath init $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath init $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js init $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js init $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use arguments such as `--level 1`, `--force`, or `--link <path>` only when explicitly needed.

