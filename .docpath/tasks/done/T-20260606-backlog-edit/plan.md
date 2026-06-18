## 执行计划

### S1: 梳理 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。
- [x] S1: 梳理 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。
- **描述**: 根据 spec 明确 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。 的实现边界和验收口径。
- **验收条件**: `docpath backlog edit R-001 --title ... --priority P0 --level 1` 能更新对应 frontmatter 并刷新索引。
- **依赖**: 无

### S2: 实现 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。
- [x] S2: 实现 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。
- **描述**: 在现有架构内完成 `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。 的代码与文档更新。
- **验收条件**: `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
