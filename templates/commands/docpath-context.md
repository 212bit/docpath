# /docpath-context — 查看完整上下文

## 用途
获取任务的完整上下文，包括状态、执行日志、规范文档。

## 命令
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath context
elif command -v docpath >/dev/null 2>&1; then
  docpath context
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath context
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js context
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js context
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## 输出内容
- current.md 完整内容
- breadcrumb.md 最近 N 条记录
- task spec/plan 摘要
- --agent: 机器可读格式
