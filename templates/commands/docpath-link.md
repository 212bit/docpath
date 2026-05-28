# /docpath-link — 声明任务依赖

## 用途
标记当前任务依赖另一个任务或文件。

## 命令
```bash
docpath link <target>   # target = task_id 或文件路径
```

## 执行步骤
1. 读取 current.md
2. 在 links 字段追加 target
3. 更新 breadcrumb: 记录依赖声明
4. 如果 target 未完成，提示注意阻塞风险
