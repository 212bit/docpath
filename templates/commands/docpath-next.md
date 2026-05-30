# /docpath-next

Use this command as the default entry point before deciding what to do next.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath next --agent
elif command -v docpath >/dev/null 2>&1; then
  docpath next --agent
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath next --agent
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js next --agent
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js next --agent
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Follow-up

1. Read the YAML output.
2. Open every file listed in `required_files` before editing.
3. Execute `recommended_command` unless the workspace state has changed.
4. Do not invent a different next step without recording the reason in breadcrumb or decisions.

## Expected Result

Claude should report the `next_action`, the `recommended_command`, and the files it will read before acting.
