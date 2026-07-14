## 执行计划

### S1: 梳理 Fix learn routing for skipped lesson candidates
- [x] S1: 梳理 Fix learn routing for skipped lesson candidates
- **描述**: 根据 spec 明确 FR-1: Fix learn routing for skipped lesson candidates 的实现边界和验收口径。
- **验收条件**: AC-1: next should not recommend docpath learn --dry-run when all lesson candidates would be skipped by learn classification; learn summary and next routing should use a consistent actionable candidate definition; regression tests cover skipped-only candidates.
- **依赖**: 无

### S2: 实现 Fix learn routing for skipped lesson candidates
- [x] S2: 实现 Fix learn routing for skipped lesson candidates
- **描述**: 在现有架构内完成 FR-1: Fix learn routing for skipped lesson candidates 的代码与文档更新。
- **验收条件**: FR-1 Fix learn routing for skipped lesson candidates 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: next should not recommend docpath learn --dry-run when all lesson candidates would be skipped by learn classification; learn summary and next routing should use a consistent actionable candidate definition; regression tests cover skipped-only candidates.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-262 与任务 T-20260712-fix-learn-routing-for-skipped-lesson-can 建立双向关联
- **验收条件**: AC-1: next should not recommend docpath learn --dry-run when all lesson candidates would be skipped by learn classification; learn summary and next routing should use a consistent actionable candidate definition; regression tests cover skipped-only candidates.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-262 与任务 T-20260712-fix-learn-routing-for-skipped-lesson-can 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
