# /docpath-reveal

Reveal DocPath context at a controlled detail level.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath reveal $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath reveal $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath reveal $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js reveal $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js reveal $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--level 1`, `--level 2 --topic api`, `--format raw`, or `--output <file>`.

