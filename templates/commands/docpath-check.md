# /docpath-check

Run DocPath quality gates and workspace consistency checks.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath check $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath check $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath check $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js check $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js check $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Checks

1. `.docpath` workspace structure and configuration validity.
2. Runtime state consistency between structured sources and rendered views.
3. Plan, breadcrumb, check, review, and journal gate evidence.
4. No conflicting active task state.
5. Any project-specific quality gates configured for the current task.
