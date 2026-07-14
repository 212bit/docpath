## 执行计划

### S1: 梳理 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。
- [x] S1: 梳理 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。
- **描述**: 根据 spec 明确 FR-1: 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。 的实现边界和验收口径。
- **验收条件**: AC-1: `traceCommand` 主体明显缩短，matrix 处理逻辑由独立 helper 承担，trace 行为测试保持通过。
- **依赖**: 无

### S2: 实现 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。
- [x] S2: 实现 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。
- **描述**: 在现有架构内完成 FR-1: 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。 的代码与文档更新。
- **验收条件**: FR-1 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 拆分 `src/commands/write-spec.ts` 中 `writeSpecCommand` 的输入读取、任务身份解析、写入目标解析和 post-write payload 构造。
- [x] S3: 实现 FR-2 拆分 `src/commands/write-spec.ts` 中 `writeSpecCommand` 的输入读取、任务身份解析、写入目标解析和 post-write payload 构造。
- **描述**: 在现有架构内完成 FR-2: 拆分 `src/commands/write-spec.ts` 中 `writeSpecCommand` 的输入读取、任务身份解析、写入目标解析和 post-write payload 构造。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 收紧状态兼容层：命令绑定任务身份时优先使用 `state.json` 和 spec H1，避免把 `current.md` 作为默认决策路径；保留 legacy migration fallback。
- [x] S4: 实现 FR-3 收紧状态兼容层：命令绑定任务身份时优先使用 `state.json` 和 spec H1，避免把 `current.md` 作为默认决策路径；保留 legacy migration fallback。
- **描述**: 在现有架构内完成 FR-3: 收紧状态兼容层：命令绑定任务身份时优先使用 `state.json` 和 spec H1，避免把 `current.md` 作为默认决策路径；保留 legacy migration fallback。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 增加或调整测试覆盖拆分后的行为，尤其是无 `task_id` 写 spec 绑定任务、legacy current.md 迁移、trace matrix 分支输出。
- [x] S5: 实现 FR-4 增加或调整测试覆盖拆分后的行为，尤其是无 `task_id` 写 spec 绑定任务、legacy current.md 迁移、trace matrix 分支输出。
- **描述**: 在现有架构内完成 FR-4: 增加或调整测试覆盖拆分后的行为，尤其是无 `task_id` 写 spec 绑定任务、legacy current.md 迁移、trace matrix 分支输出。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `traceCommand` 主体明显缩短，matrix 处理逻辑由独立 helper 承担，trace 行为测试保持通过。；AC-2: `writeSpecCommand` 主体明显缩短，输入读取、任务身份解析、写入目标解析和 post-write payload 由 helper 承担。；AC-3: 状态兼容层保留 legacy current.md 迁移，但新任务身份解析测试证明无 `task_id` 时从 spec H1 绑定，且 state 优先路径不依赖 current.md。；AC-4: `pnpm run typecheck`、目标测试、`pnpm test`、`docpath check` 和 `docpath review` 通过。
- **验收条件**: AC-1: `traceCommand` 主体明显缩短，matrix 处理逻辑由独立 helper 承担，trace 行为测试保持通过。；AC-2: `writeSpecCommand` 主体明显缩短，输入读取、任务身份解析、写入目标解析和 post-write payload 由 helper 承担。；AC-3: 状态兼容层保留 legacy current.md 迁移，但新任务身份解析测试证明无 `task_id` 时从 spec H1 绑定，且 state 优先路径不依赖 current.md。；AC-4: `pnpm run typecheck`、目标测试、`pnpm test`、`docpath check` 和 `docpath review` 通过。
- **依赖**: S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
