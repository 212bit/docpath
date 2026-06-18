## 执行计划

### S1: 梳理 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。
- [x] S1: 梳理 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。
- **描述**: 根据 spec 明确 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。 的实现边界和验收口径。
- **验收条件**: 普通 `docpath journal` 完成归档后不再向 `decisions.md` 写入 `journal.archive` ADR。
- **依赖**: 无

### S2: 实现 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。
- [x] S2: 实现 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。
- **描述**: 在现有架构内完成 `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。 的代码与文档更新。
- **验收条件**: `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
