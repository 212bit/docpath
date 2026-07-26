## 执行计划

### S1: 梳理 changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约
- [x] S1: 梳理 changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约
- **描述**: 根据 spec 明确 FR-1: changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约 的实现边界和验收口径。
- **验收条件**: AC-1: 全仓库仅存一份 worktree 判定实现（grep 断言），在真实 linked worktree 内判定为 true。
- **依赖**: 无

### S2: 实现 changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约
- [x] S2: 实现 changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约
- **描述**: 在现有架构内完成 FR-1: changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约 的代码与文档更新。
- **验收条件**: FR-1 changes-report worktree_isolation 死功能: 重复 symlink 判定 + noise 分类语义违反 R-273 契约 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 全仓库仅存一份 worktree 判定实现（grep 断言），在真实 linked worktree 内判定为 true。；AC-2: worktree 内 changes --agent：backlog/rules/tasks-done 变更列为 commit-relevant，不再归类为 isolation noise。；AC-3: isolated 运行时文件仍归类为 noise，现有 changes 测试全绿，新增契约一致性测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-289 与任务 T-20260726-changes-report-worktree-isolation-symlin 建立双向关联
- **验收条件**: AC-1: 全仓库仅存一份 worktree 判定实现（grep 断言），在真实 linked worktree 内判定为 true。；AC-2: worktree 内 changes --agent：backlog/rules/tasks-done 变更列为 commit-relevant，不再归类为 isolation noise。；AC-3: isolated 运行时文件仍归类为 noise，现有 changes 测试全绿，新增契约一致性测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-289 与任务 T-20260726-changes-report-worktree-isolation-symlin 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
