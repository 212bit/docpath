## 执行计划

### S1: 实现并验证 worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）
- [x] S1: 实现并验证 worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）
- **描述**: 完成 FR-1: worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享），随做随验（agent_flow 压缩计划，R-334）。
- **验收条件**: AC-1: 多 worktree 并行 capture 时，任一会话能感知其他活跃 worktree 已存在的同标题/同 id 条目并在产生时提示；不再产生结构性重复登记。决策记录（Decision Brief）+ 用户确认后实现（涉及共享模型变更，可能推翻 R-238 Option B/R-273 资源分层，属重大变更门禁）。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-356 与任务 T-20260923-worktree-backlog-merge-mediated 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
