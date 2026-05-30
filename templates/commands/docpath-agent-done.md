# /docpath-agent-done

Close the active DocPath task through quality gates.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent done --step "$ARGUMENTS"
elif command -v docpath >/dev/null 2>&1; then
  docpath agent done --step "$ARGUMENTS"
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent done --step "$ARGUMENTS"
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent done --step "$ARGUMENTS"
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent done --step "$ARGUMENTS"
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If `$ARGUMENTS` is empty, use the current task title from `.docpath/workspace/current.md`.

## Rules

- Do not claim completion before this command succeeds.
- Do not use `--skip-check` or `--skip-review` unless the user explicitly asks and a reason is recorded with `--note`.
- If the command fails, read `.docpath/workspace/last-check.md` and route via `/docpath-next`.

## Expected Result

Claude should report check/review/journal status and the next route from `docpath next --agent`.
