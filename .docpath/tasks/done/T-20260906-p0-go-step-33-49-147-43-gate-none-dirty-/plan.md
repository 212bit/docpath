## 执行计划

### S1: 梳理 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。
- **描述**: 根据 spec 明确 FR-1: 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。 的实现边界和验收口径。
- **验收条件**: AC-1: 任务刚 promote、phase 未进 executing、工作区仅含本任务 tracked 源码改动时，`docpath go --step S1` 成功开步，不再误拦。
- **依赖**: 无

### S2: 实现 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。
- **描述**: 在现有架构内完成 FR-1: 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。 的代码与文档更新。
- **验收条件**: FR-1 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 保留对**跨任务/外部** tracked 改动与**陌生 untracked 源码文件**的拦截，守卫保护力不降。
- **描述**: 在现有架构内完成 FR-2: 保留对**跨任务/外部** tracked 改动与**陌生 untracked 源码文件**的拦截，守卫保护力不降。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 确需人工放行时，失败输出含**一条可直接复制**且指向当前 step 的放行命令，Agent 无需额外 `next`/读 `current.md`。
- **描述**: 在现有架构内完成 FR-3: 确需人工放行时，失败输出含**一条可直接复制**且指向当前 step 的放行命令，Agent 无需额外 `next`/读 `current.md`。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 实现前先采样确认 go 失败真实成因分布（dirty-guard 在 49 次失败中的实际占比），据此确认或收敛修复范围，防止按假设过度放宽。
- **描述**: 在现有架构内完成 FR-4: 实现前先采样确认 go 失败真实成因分布（dirty-guard 在 49 次失败中的实际占比），据此确认或收敛修复范围，防止按假设过度放宽。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 任务刚 promote、phase 未进 executing、工作区仅含本任务 tracked 源码改动时，`docpath go --step S1` 成功开步，不再误拦。；AC-2: 存在跨任务/外部 tracked 改动或陌生 untracked 源码文件时，守卫仍拦截（保护力不降）。；AC-3: 确需人工放行时，失败输出一条可直接复制的放行命令，Agent 无需额外 `next`/读 `current.md`。；AC-4: plan 首步产出 go 失败真实成因占比采样，据此确认或收敛修复面（防止按错误假设过度放宽）。；AC-5: `tests/dirty-worktree-guard.test.mjs` 覆盖 AC-1/AC-2 正反用例；go 失败率复核（目标 33%→<10%，用 trace 验证）。；AC-6: 全量测试与 typecheck 通过，零行为回归；不触碰 FSM 合法转移与其他门禁。
- **验收条件**: AC-1: 任务刚 promote、phase 未进 executing、工作区仅含本任务 tracked 源码改动时，`docpath go --step S1` 成功开步，不再误拦。；AC-2: 存在跨任务/外部 tracked 改动或陌生 untracked 源码文件时，守卫仍拦截（保护力不降）。；AC-3: 确需人工放行时，失败输出一条可直接复制的放行命令，Agent 无需额外 `next`/读 `current.md`。；AC-4: plan 首步产出 go 失败真实成因占比采样，据此确认或收敛修复面（防止按错误假设过度放宽）。；AC-5: `tests/dirty-worktree-guard.test.mjs` 覆盖 AC-1/AC-2 正反用例；go 失败率复核（目标 33%→<10%，用 trace 验证）。；AC-6: 全量测试与 typecheck 通过，零行为回归；不触碰 FSM 合法转移与其他门禁。
- **依赖**: S5

## Checklist
- [ ] S1
- [ ] S2
- [ ] S3
- [ ] S4
- [ ] S5
- [ ] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
