## 执行计划

### S1: 梳理 深化 spec.json schema 与门禁字段
- **描述**: 根据 spec 明确 深化 spec.json schema 与门禁字段 的实现边界和验收口径。
- **验收条件**: 生成的 spec 可直接进入 `docpath plan`
- **依赖**: 无

### S2: 实现 深化 spec.json schema 与门禁字段
- **描述**: 在现有架构内完成 深化 spec.json schema 与门禁字段 的代码与文档更新。
- **验收条件**: 深化 spec.json schema 与门禁字段 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
