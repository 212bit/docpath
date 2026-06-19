## 执行计划

### S1: Map tracked DocPath cleanup behavior
- **描述**: 梳理 `docpath worktree create` 对 `.docpath/workspace`, `.docpath/tasks`, `.docpath/journal`, `.docpath/docs.md`, `.docpath/docs-index.json` 的清理和初始化路径，明确哪些路径可能包含 tracked 文件。覆盖 FR-1, FR-2, FR-3。
- **验收条件**: 已确定 tracked 路径不能删除或重写，且 AC-1/AC-2 的测试入口明确。
- **依赖**: 无

### S2: Implement tracked-path preserving cleanup
- **描述**: 更新 `initWorktreeDocpath`，对包含 tracked 文件的 `.docpath` 路径保留 tracked copy；只对未 tracked runtime 路径执行删除和隔离初始化。覆盖 FR-1, FR-2, FR-3。
- **验收条件**: tracked `.docpath/tasks`, `.docpath/docs.md`, `.docpath/docs-index.json`, `.docpath/workspace/*` 不再因 worktree create 产生 deleted/modified Git 噪声，满足 AC-1。
- **依赖**: S1

### S3: Extend worktree regression tests
- **描述**: 扩展 worktree 测试夹具，使测试仓库追踪 tasks/docs/workspace runtime，并断言 create 后完整 `git status --porcelain` 为空。覆盖 FR-4, NFR-1, NFR-3。
- **验收条件**: worktree 测试验证 AC-1, AC-2, AC-3：新 worktree clean，tracked backlog/rules 保持 tracked copy，doctor 仍通过。
- **依赖**: S2

### S4: Validate dogfood and closeout
- **描述**: 运行 typecheck、worktree 目标测试，并用当前 CLI 创建/检查/删除临时 worktree，确认真实仓库形态下无 tracked evidence 删除噪声。覆盖 NFR-2, AC-4。
- **验收条件**: `tsc --noEmit`、`tests/worktree.test.mjs`、真实 dogfood create/status/doctor/remove 均通过；DocPath check/review/changes closeout 结果明确。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
