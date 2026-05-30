# /docpath-agent-step

Record completion or blockage for one DocPath plan step.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent step --step "$ARGUMENTS" --status done
elif command -v docpath >/dev/null 2>&1; then
  docpath agent step --step "$ARGUMENTS" --status done
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent step --step "$ARGUMENTS" --status done
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent step --step "$ARGUMENTS" --status done
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent step --step "$ARGUMENTS" --status done
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If the step is blocked, run:

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent step --step "$ARGUMENTS" --status blocked --note "<blocker>"
elif command -v docpath >/dev/null 2>&1; then
  docpath agent step --step "$ARGUMENTS" --status blocked --note "<blocker>"
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent step --step "$ARGUMENTS" --status blocked --note "<blocker>"
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent step --step "$ARGUMENTS" --status blocked --note "<blocker>"
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent step --step "$ARGUMENTS" --status blocked --note "<blocker>"
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Follow-up

1. Confirm `.docpath/workspace/breadcrumb.md` contains the new step record.
2. If status is `done`, confirm `.docpath/tasks/current/plan.md` has the matching checklist item checked.
3. Run `/docpath-next` to route the next action.

## Expected Result

Claude should state the recorded step, whether plan sync succeeded, and the next recommended command.
