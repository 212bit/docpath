# /docpath-agent-enter

Enter a DocPath-managed Claude Code session.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath agent enter $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath agent enter $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath agent enter $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js agent enter $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js agent enter $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Follow-up

1. Read the generated `agent_context` YAML.
2. Follow `context_policy`: listed files and context entries are indexes; do not open every generated Markdown view by default.
3. Treat `command_effects.updates` and legacy `must_update` as files updated by DocPath commands, not as hand-edit targets.
4. Continue with `/docpath-next` unless `recommended_command` already gives a more specific action.
5. Use `/docpath-reveal` or `/docpath-context --max-tokens <n> --topic <keyword>` when deeper context is required.

## Expected Result

Claude should summarize the active task, current phase/gate, and the command it will run next.
