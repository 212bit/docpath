## 执行计划

### S1: 实现并验证 worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）
- [x] S1: 实现并验证 worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）
- **描述**: 完成 FR-1: worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露），随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 明确 worktree 内 `node_modules` 共享软链接下的依赖安装语义（写穿主仓库 vs 隔离），并给出可执行结论；AC-2: 在 worktree 删除/合并收口路径上给出可检测信号（doctor / finish / prune），使"合并后主干测试失败"可在合并前被预见或至少被明确定位；AC-3: 文档化该副作用到 `docs/features/worktree-workflow.md`，避免后续 agent 再次踩坑；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-467 与任务 T-20261001-worktree-node-modules 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
