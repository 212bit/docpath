# /docpath-unlink

Remove the current project association from DocPath.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath unlink $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath unlink $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath unlink $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js unlink $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js unlink $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Only run this when the user explicitly asks to remove the project association.
