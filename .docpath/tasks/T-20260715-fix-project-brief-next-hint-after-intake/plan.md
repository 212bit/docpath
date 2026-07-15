## 执行计划

### S1: 梳理 Fix project brief next_hint after intake brief
- [x] S1: 梳理 Fix project brief next_hint after intake brief
- **描述**: 根据 spec 明确 FR-1: Fix project brief next_hint after intake brief 的实现边界和验收口径。
- **验收条件**: AC-1: After running docpath project brief, next_hint no longer recommends 'docpath project plan'. It points users/agents to the valid post-brief path: create executable work through backlog add / project backlog guidance as appropriate. Help text and routing remain consistent with supported project subcommands.
- **依赖**: 无

### S2: 实现 Fix project brief next_hint after intake brief
- [x] S2: 实现 Fix project brief next_hint after intake brief
- **描述**: 在现有架构内完成 FR-1: Fix project brief next_hint after intake brief 的代码与文档更新。
- **验收条件**: FR-1 Fix project brief next_hint after intake brief 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: After running docpath project brief, next_hint no longer recommends 'docpath project plan'. It points users/agents to the valid post-brief path: create executable work through backlog add / project backlog guidance as appropriate. Help text and routing remain consistent with supported project subcommands.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-243 与任务 T-20260715-fix-project-brief-next-hint-after-intake 建立双向关联
- **验收条件**: AC-1: After running docpath project brief, next_hint no longer recommends 'docpath project plan'. It points users/agents to the valid post-brief path: create executable work through backlog add / project backlog guidance as appropriate. Help text and routing remain consistent with supported project subcommands.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-243 与任务 T-20260715-fix-project-brief-next-hint-after-intake 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
