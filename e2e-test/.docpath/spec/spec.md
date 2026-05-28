# 给TODO CLI添加删除任务功能

## 背景
TODO CLI 现有 init/add/list 功能，缺少删除。用户需要通过 task ID 删除已完成任务。

## 需求
1. 支持 `todo delete <id>` 命令
2. 删除前确认（可选 --force 跳过）
3. 删除后更新 storage.json
4. 不存在的 ID 给出友好提示

## 技术约束
- TypeScript, Node.js
- 读写 tasks.json 文件存储
- 保持现有代码风格一致
