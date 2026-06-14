# /docpath-status

Show the current DocPath state without modifying files.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath status $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath status $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath status $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js status $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js status $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Output

- `task_id` and `task_title`
- `state`, `phase`, and `gate`
- Progress counters and the current focus
- `--agent`: machine-readable YAML with `next_action`, `recommended_command`, indexes, and `exit_criteria`
- Treat `required_context` and `required_files` as indexes, not instructions to read every file.
