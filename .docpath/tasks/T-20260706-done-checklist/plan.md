## 执行计划

### S1: 梳理 步骤主条目 done 后底部 checklist 未同步勾选
- [x] S1: 梳理 步骤主条目 done 后底部 checklist 未同步勾选
- **描述**: 根据 spec 明确 FR-1: 步骤主条目 done 后底部 checklist 未同步勾选 的实现边界和验收口径。
- **验收条件**: AC-1: `markPlanStep` 更新 plan.md 时，同步更新**所有**匹配该 step id 的 checklist 行（section 内 + 底部 `## Checklist`），而非只第一处。
- **依赖**: 无

### S2: 实现 步骤主条目 done 后底部 checklist 未同步勾选
- [x] S2: 实现 步骤主条目 done 后底部 checklist 未同步勾选
- **描述**: 在现有架构内完成 FR-1: 步骤主条目 done 后底部 checklist 未同步勾选 的代码与文档更新。
- **验收条件**: FR-1 步骤主条目 done 后底部 checklist 未同步勾选 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `markPlanStep` 更新 plan.md 时，同步更新**所有**匹配该 step id 的 checklist 行（section 内 + 底部 `## Checklist`），而非只第一处。；AC-2: 回归: agent step --status done 后，plan.md 的 section 内 checklist 与底部 Checklist 同 id 行均变为 [x]。；AC-3: 回归: parsePlanSteps 对同 id 多 checklist 行不丢失（用于 drift 检测）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-253 与任务 T-20260706-done-checklist 建立双向关联
- **验收条件**: AC-1: `markPlanStep` 更新 plan.md 时，同步更新**所有**匹配该 step id 的 checklist 行（section 内 + 底部 `## Checklist`），而非只第一处。；AC-2: 回归: agent step --status done 后，plan.md 的 section 内 checklist 与底部 Checklist 同 id 行均变为 [x]。；AC-3: 回归: parsePlanSteps 对同 id 多 checklist 行不丢失（用于 drift 检测）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-253 与任务 T-20260706-done-checklist 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
