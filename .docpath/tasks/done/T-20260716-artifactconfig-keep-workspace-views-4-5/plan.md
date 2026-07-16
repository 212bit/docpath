## 执行计划

### S1: 梳理 ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档
- [x] S1: 梳理 ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档
- **描述**: 根据 spec 明确 FR-1: ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档 的实现边界和验收口径。
- **验收条件**: AC-1: AC-1: 全仓 grep 四个死字段名仅命中迁移注释与 backlog/归档历史。
- **依赖**: 无

### S2: 实现 ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档
- [x] S2: 实现 ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档
- **描述**: 在现有架构内完成 FR-1: ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档 的代码与文档更新。
- **验收条件**: FR-1 ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: AC-1: 全仓 grep 四个死字段名仅命中迁移注释与 backlog/归档历史。；AC-2: AC-2: pnpm test 全绿; generate_md_views 行为回归不变。；AC-3: AC-3: artifact-policy.md 不再文档化任何无消费方字段。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-275 与任务 T-20260716-artifactconfig-keep-workspace-views-4-5 建立双向关联
- **验收条件**: AC-1: AC-1: 全仓 grep 四个死字段名仅命中迁移注释与 backlog/归档历史。；AC-2: AC-2: pnpm test 全绿; generate_md_views 行为回归不变。；AC-3: AC-3: artifact-policy.md 不再文档化任何无消费方字段。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-275 与任务 T-20260716-artifactconfig-keep-workspace-views-4-5 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
