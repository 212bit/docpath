## 执行计划

### S1: 梳理 将 agent 启动协议改为单命令 next --agent
- **描述**: 根据 spec 明确 将 agent 启动协议改为单命令 next --agent 的实现边界和验收口径。
- **验收条件**: 生成的 spec 可直接进入 `docpath plan`
- **依赖**: 无

### S2: 实现 将 agent 启动协议改为单命令 next --agent
- **描述**: 在现有架构内完成 将 agent 启动协议改为单命令 next --agent 的代码与文档更新。
- **验收条件**: 将 agent 启动协议改为单命令 next --agent 已实现，并保持现有工作流兼容。
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
