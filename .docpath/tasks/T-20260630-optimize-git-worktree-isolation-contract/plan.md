## 执行计划

### S1: 梳理 Optimize Git Worktree isolation contract, verification gating, repair, and lease checks
- [x] S1: 梳理 Optimize Git Worktree isolation contract, verification gating, repair, and lease checks
- **描述**: 根据 spec 明确 FR-1: Optimize Git Worktree isolation contract, verification gating, repair, and lease checks 的实现边界和验收口径。
- **验收条件**: AC-1: 生成的 spec 可直接进入 `docpath plan`
- **依赖**: 无

### S2: 实现 Optimize Git Worktree isolation contract, verification gating, repair, and lease checks
- [ ] S2: 实现 Optimize Git Worktree isolation contract, verification gating, repair, and lease checks
- **描述**: 在现有架构内完成 FR-1: Optimize Git Worktree isolation contract, verification gating, repair, and lease checks 的代码与文档更新。
- **验收条件**: FR-1 Optimize Git Worktree isolation contract, verification gating, repair, and lease checks 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [ ] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 生成的 spec 可直接进入 `docpath plan`；AC-2: backlog 条目 R-238 与任务 T-20260630-optimize-git-worktree-isolation-contract 建立双向关联
- **验收条件**: AC-1: 生成的 spec 可直接进入 `docpath plan`；AC-2: backlog 条目 R-238 与任务 T-20260630-optimize-git-worktree-isolation-contract 建立双向关联
- **依赖**: S2

## Checklist
- [ ] S1
- [ ] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
