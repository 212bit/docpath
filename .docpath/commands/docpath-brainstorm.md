# /docpath-brainstorm

Emit a requirement-clarification prompt contract for the current agent session.
The CLI does not call a hidden LLM or replace the current conversation.

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

1. Read the generated prompt/output in the current agent session.
2. Ask any required follow-up questions and generate the spec content in this conversation.
3. Persist the result with `/docpath-write-spec`, then route with `/docpath-next`.
4. Do not start implementation until a spec/plan route exists.
