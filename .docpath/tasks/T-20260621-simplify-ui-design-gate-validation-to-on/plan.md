## 执行计划

### S1: 梳理 Simplify UI design gate validation to only require ui-brief.md and design-approval.md
- [x] S1: 梳理 Simplify UI design gate validation to only require ui-brief.md and design-approval.md
- **描述**: 根据 spec 明确 FR-1: Simplify UI design gate validation to only require ui-brief.md and design-approval.md 的实现边界和验收口径。
- **验收条件**: AC-1: 生成的 spec 可直接进入 `docpath plan`
- **依赖**: 无

### S2: 实现 Simplify UI design gate validation to only require ui-brief.md and design-approval.md
- [x] S2: 实现 Simplify UI design gate validation to only require ui-brief.md and design-approval.md
- **描述**: 在现有架构内完成 FR-1: Simplify UI design gate validation to only require ui-brief.md and design-approval.md 的代码与文档更新。
- **验收条件**: FR-1 Simplify UI design gate validation to only require ui-brief.md and design-approval.md 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 生成的 spec 可直接进入 `docpath plan`；AC-2: backlog 条目 R-228 与任务 T-20260621-simplify-ui-design-gate-validation-to-on 建立双向关联
- **验收条件**: AC-1: 生成的 spec 可直接进入 `docpath plan`；AC-2: backlog 条目 R-228 与任务 T-20260621-simplify-ui-design-gate-validation-to-on 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
