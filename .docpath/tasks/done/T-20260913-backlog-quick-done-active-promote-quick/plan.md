## 执行计划

### S1: 实现并验证 backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
- [x] S1: 实现并验证 backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
- **描述**: 完成 FR-1: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突），随做随验（agent_flow 压缩计划，R-334）。
- **验收条件**: AC-1: 1) 为"quick/旁路闭环"提供合法终态（如 accepted/planned → done 需附 links.task 非空校验，或新增 absorbed 状态）；2) done 前校验任务证据真实存在，防止借道逃避生命周期；3) 测试覆盖新旧转移路径；4) R-333（已 accepted 滞留）与历史同型条目可按新路径补录。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-346 与任务 T-20260913-backlog-quick-done-active-promote-quick 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
