# /docpath-brainstorm

Clarify a vague request and generate a task/spec starting point.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath brainstorm --input "$ARGUMENTS"
elif command -v docpath >/dev/null 2>&1; then
  docpath brainstorm --input "$ARGUMENTS"
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath brainstorm --input "$ARGUMENTS"
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js brainstorm --input "$ARGUMENTS"
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js brainstorm --input "$ARGUMENTS"
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

If `$ARGUMENTS` is empty, ask the user for the task/request before running.

## Follow-up

1. Read the generated prompt/output.
2. Write or refine the task spec with `/docpath-next` as the router.
3. Do not start implementation until a spec/plan route exists.
