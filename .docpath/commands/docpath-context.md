# /docpath-context

Get a budgeted DocPath context package through the CLI.

## Run
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath context $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath context $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath context $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js context $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js context $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## Output

- A scoped state, progress, spec, and plan summary selected by DocPath.
- Use `--max-tokens <n>` and `--topic <keyword>` when the agent needs bounded context.
- Prefer this command or `/docpath-reveal` over direct reads of `current.md`, `breadcrumb.md`, or `plan.md`.
- Markdown files remain human views; JSON/JSONL files are the machine truth sources.
