# /docpath-context — 查看完整上下文

## 用途
获取任务的完整上下文，包括状态、执行日志、规范文档。

## 命令
```bash
docpath context
docpath context --agent   # YAML 格式输出
```

## 输出内容
- current.md 完整内容
- breadcrumb.md 最近 N 条记录
- task spec/plan 摘要
- --agent: 机器可读格式
