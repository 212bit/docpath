---
description: Read-only pre-commit change summary
---

Run `docpath changes` to summarize the current git working tree, DocPath gate evidence, and a suggested commit message.

This command is read-only. In agent mode, use it before local `git commit`.
If it reports ignored canonical evidence, only force-add the exact paths from
`ignored_evidence.add_command`. Do not force-add `.docpath/tasks/current/*`
alias evidence by default.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath changes $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath changes $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath changes $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js changes $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js changes $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments:

```bash
docpath changes --agent
docpath changes --json
docpath changes --since main
```
