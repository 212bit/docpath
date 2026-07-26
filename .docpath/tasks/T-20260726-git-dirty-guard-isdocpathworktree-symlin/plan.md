## 执行计划

### S1: 梳理 git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
- [x] S1: 梳理 git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
- **描述**: 根据 spec 明确 FR-1: git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补 的实现边界和验收口径。
- **验收条件**: AC-1: 在真实 git worktree 内（tracked-copy 契约下）isDocpathWorktree 判定为 true，execution-start 放宽分支有回归测试覆盖。
- **依赖**: 无

### S2: 实现 git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
- [x] S2: 实现 git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
- **描述**: 在现有架构内完成 FR-1: git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补 的代码与文档更新。
- **验收条件**: FR-1 git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 在真实 git worktree 内（tracked-copy 契约下）isDocpathWorktree 判定为 true，execution-start 放宽分支有回归测试覆盖。；AC-2: phase=checking/reviewing 时，本任务的 tracked 改动不再被 execution-start guard 拦截；与任务无关文件仍被拦截。；AC-3: 现有 dirty-worktree-guard 测试全绿，新增上述两场景测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-288 与任务 T-20260726-git-dirty-guard-isdocpathworktree-symlin 建立双向关联
- **验收条件**: AC-1: 在真实 git worktree 内（tracked-copy 契约下）isDocpathWorktree 判定为 true，execution-start 放宽分支有回归测试覆盖。；AC-2: phase=checking/reviewing 时，本任务的 tracked 改动不再被 execution-start guard 拦截；与任务无关文件仍被拦截。；AC-3: 现有 dirty-worktree-guard 测试全绿，新增上述两场景测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-288 与任务 T-20260726-git-dirty-guard-isdocpathworktree-symlin 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
