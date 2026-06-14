# /docpath-agent-done

Close the active DocPath task through quality gates.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent done $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath agent done $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent done $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent done $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent done $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If `$ARGUMENTS` is empty, let the CLI resolve the active task from structured state.

## Rules

- Do not claim completion before this command succeeds.
- Do not use `--skip-check` or `--skip-review` unless the user explicitly asks and a reason is recorded with `--note`.
- If the command fails, route via `/docpath-next` and read failure evidence only when the CLI points to it.

## Expected Result

Claude should report check/review/journal status and the next route from `docpath next --agent`.
