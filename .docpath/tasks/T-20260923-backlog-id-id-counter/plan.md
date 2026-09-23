## 执行计划

### S1: 实现并验证 Backlog ID 分配增强：结合磁盘最大 ID 防御 counter 回退撞号
- [x] S1: 实现并验证 Backlog ID 分配增强：结合磁盘最大 ID 防御 counter 回退撞号
- **描述**: 完成 FR-1: Backlog ID 分配增强：结合磁盘最大 ID 防御 counter 回退撞号，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: nextBacklogId 始终分配严格递增且不撞号的 ID，全量测试与门禁通过；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-375 与任务 T-20260923-backlog-id-id-counter 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
