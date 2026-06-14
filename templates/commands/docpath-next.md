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
2. Treat `context_index`, `data_index`, `required_context`, and `required_files` as indexes, not mandatory full-file reads.
3. Expand details with `/docpath-reveal` or `/docpath-context --max-tokens <n> --topic <keyword>` before opening generated Markdown views.
4. Execute `recommended_command` unless the workspace state has changed.
5. Do not invent a different next step without recording the reason through a DocPath lifecycle command.

## Expected Result

Claude should report the `next_action`, the `recommended_command`, and any additional context it will request before acting.
