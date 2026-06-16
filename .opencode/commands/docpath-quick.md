# /docpath-quick

Create a fast-track DocPath task for a tiny low-risk change.

Use this for typo fixes, one-line bugs, comments, or small safe adjustments.
Do not use it for architecture, protocol, permission, migration, CI/CD, or broad
multi-file changes.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath quick "$ARGUMENTS"
elif command -v docpath >/dev/null 2>&1; then
  docpath quick "$ARGUMENTS"
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath quick "$ARGUMENTS"
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js quick "$ARGUMENTS"
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js quick "$ARGUMENTS"
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Closeout

After making the change:

```bash
docpath done
```

`docpath done` still runs check. Full review is skipped by the quick profile and
recorded as audit evidence.
