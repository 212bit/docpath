# /docpath-check — 任务前检查

## 用途
在开始工作前检查环境和前置条件。

## 命令
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath check $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath check $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath check $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js check $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js check $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## 检查项
1. .docpath 目录结构完整性
2. current.md 存在且可解析
3. breadcrumb.md 存在
4. config.yaml 存在且有效
5. 无进行中的冲突任务
