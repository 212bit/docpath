# /docpath-disclosure

Show progressive disclosure output for the current project state.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath disclosure
elif command -v docpath >/dev/null 2>&1; then
  docpath disclosure
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath disclosure
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js disclosure
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js disclosure
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Use `--level summary`, `--level detail`, or `--level debug`.
