## 执行计划

### S1: 梳理 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。
- [x] S1: 梳理 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。
- **描述**: 根据 spec 明确 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。 的实现边界和验收口径。
- **验收条件**: 健康 backlog 运行 `docpath backlog groom` 输出通过并以 0 退出。
- **依赖**: 无

### S2: 实现 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。
- [x] S2: 实现 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。
- **描述**: 在现有架构内完成 `docpath backlog groom` 默认只读检查 backlog 条目健康状况。 的代码与文档更新。
- **验收条件**: `docpath backlog groom` 默认只读检查 backlog 条目健康状况。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
