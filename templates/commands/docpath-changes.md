---
description: 提交前只读变更收口视图
---

运行 `docpath changes`，汇总当前 git 工作树变更、DocPath 门禁证据和建议 commit message。

## 命令

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

常用参数：

```bash
docpath changes --agent
docpath changes --json
docpath changes --since main
```
