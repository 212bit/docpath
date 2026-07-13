## 执行计划

### S1: 梳理 Deduplicate learn candidate classification
- [x] S1: 梳理 Deduplicate learn candidate classification
- **描述**: 根据 spec 明确 FR-1: Deduplicate learn candidate classification 的实现边界和验收口径。
- **验收条件**: AC-1: docpath learn and docpath next share the same lesson candidate parsing/classification helper; duplicate private classification logic is removed from learn; existing learn and next regression tests continue to pass.
- **依赖**: 无

### S2: 实现 Deduplicate learn candidate classification
- [x] S2: 实现 Deduplicate learn candidate classification
- **描述**: 在现有架构内完成 FR-1: Deduplicate learn candidate classification 的代码与文档更新。
- **验收条件**: FR-1 Deduplicate learn candidate classification 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: docpath learn and docpath next share the same lesson candidate parsing/classification helper; duplicate private classification logic is removed from learn; existing learn and next regression tests continue to pass.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-263 与任务 T-20260713-deduplicate-learn-candidate-classificati 建立双向关联
- **验收条件**: AC-1: docpath learn and docpath next share the same lesson candidate parsing/classification helper; duplicate private classification logic is removed from learn; existing learn and next regression tests continue to pass.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-263 与任务 T-20260713-deduplicate-learn-candidate-classificati 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
