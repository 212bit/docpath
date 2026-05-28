# /docpath-status — 查看当前状态

## 用途
快速查看任务状态，不修改任何文件。

## 命令
```bash
docpath status
docpath status --agent   # YAML 格式输出
```

## 输出内容
- task_id + task_title
- state (planning/executing/done/blocked)
- current_step
- 最近一条 breadcrumb 记录
- --agent: YAML 格式 (next_action/recommended_command/exit_criteria)
