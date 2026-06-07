# /docpath-learn

Extract durable rules from journal entries into project guidance.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath learn
elif command -v docpath >/dev/null 2>&1; then
  docpath learn
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath learn
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js learn
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js learn
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Useful arguments:

- `--journal <path>` learns from a specific journal file.
- `--dry-run` previews learned rules without writing guidance files.
- `groom --dry-run` reports low-value lesson candidates.
- `prune` removes low-value lesson candidates from `workspace/lesson-candidates.md`.
