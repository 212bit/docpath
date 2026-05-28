# /docpath-continue — 继续当前任务

## 用途
恢复中断的任务，读取当前状态继续执行。

## 命令
```bash
docpath continue
```

## 执行步骤
1. 读取 `.docpath/workspace/current.md`
2. 解析 state + current_step + task_id
3. 输出当前状态摘要和下一步建议
4. 如果 state=blocked，提示解除阻塞条件
