# /docpath-go — 开始新任务

## 用途
初始化新任务，创建或更新 workspace 状态文件。

## 命令
```bash
docpath go "任务描述"
```

## 执行步骤
1. 读取 `.docpath/workspace/current.md`
2. 如果有进行中的任务，提示确认或先完成
3. 创建新任务记录到 tasks/
4. 更新 current.md: state=planning, task_title, task_id
5. 追加 breadcrumb: 新任务开始记录
