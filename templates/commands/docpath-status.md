# /docpath-status — 查看当前状态

## 用途
快速查看任务状态，不修改任何文件。

## 命令
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath status --agent
elif command -v docpath >/dev/null 2>&1; then
  docpath status --agent
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath status --agent
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js status --agent
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js status --agent
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## 输出内容
- task_id + task_title
- state (planning/executing/done/blocked)
- current_step
- 最近一条 breadcrumb 记录
- --agent: YAML 格式 (next_action/recommended_command/exit_criteria)
