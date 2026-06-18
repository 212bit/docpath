## 执行计划

### S1: 梳理 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取
- [x] S1: 梳理 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取
- **描述**: 根据 spec 明确 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取 的实现边界和验收口径。
- **验收条件**: `docpath init` 新建 `.docpath/rules/style.md` 与 `.docpath/rules/architecture.md`
- **依赖**: 无

### S2: 实现 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取
- [x] S2: 实现 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取
- **描述**: 在现有架构内完成 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取 的代码与文档更新。
- **验收条件**: 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
