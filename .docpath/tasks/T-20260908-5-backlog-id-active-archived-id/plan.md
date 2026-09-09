## 执行计划

### S1: 梳理 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
- [x] S1: 梳理 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
- **描述**: 根据 spec 明确 FR-1: 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求) 的实现边界和验收口径。
- **验收条件**: AC-1: 1) 逐条定权威归属;2) 冲突方重分配唯一 id 或合并,修 links.task/spec 与历史引用;3) 迁移后 groom 无撞号告警;4) 需独立 Decision Brief+用户确认(改 id 牵动引用,非 trivial)。
- **依赖**: 无

### S2: 实现 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
- [x] S2: 实现 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
- **描述**: 在现有架构内完成 FR-1: 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求) 的代码与文档更新。
- **验收条件**: FR-1 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 1) 逐条定权威归属;2) 冲突方重分配唯一 id 或合并,修 links.task/spec 与历史引用;3) 迁移后 groom 无撞号告警;4) 需独立 Decision Brief+用户确认(改 id 牵动引用,非 trivial)。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-322 与任务 T-20260908-5-backlog-id-active-archived-id 建立双向关联
- **验收条件**: AC-1: 1) 逐条定权威归属;2) 冲突方重分配唯一 id 或合并,修 links.task/spec 与历史引用;3) 迁移后 groom 无撞号告警;4) 需独立 Decision Brief+用户确认(改 id 牵动引用,非 trivial)。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-322 与任务 T-20260908-5-backlog-id-active-archived-id 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
