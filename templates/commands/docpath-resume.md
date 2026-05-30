# /docpath-resume

Resume from the last DocPath interruption point.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath resume
elif command -v docpath >/dev/null 2>&1; then
  docpath resume
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath resume
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js resume
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js resume
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

After the command succeeds, run `/docpath-next` to select the next action.

