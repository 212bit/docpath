# /docpath-install

Install DocPath agent protocol files into this project.

## Run

```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath install $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath install $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath install $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js install $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js install $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

Common arguments: `--target claude`, `--target universal`, or `--force`.

