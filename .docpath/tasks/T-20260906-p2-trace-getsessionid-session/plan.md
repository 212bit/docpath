## 执行计划

### S1: 梳理 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。
- [x] S1: 梳理 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。
- **描述**: 根据 spec 明确 FR-1: 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。 的实现边界和验收口径。
- **验收条件**: AC-1: `--session <id>` 执行任一被 trace 记录的命令时，`trace.jsonl` 该条 `session === <id>`（透传生效）。
- **依赖**: 无

### S2: 实现 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。
- [x] S2: 实现 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。
- **描述**: 在现有架构内完成 FR-1: 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。 的代码与文档更新。
- **验收条件**: FR-1 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `index.ts` 将 `--session` 解析结果透传给 trace 写入（async 与 sync 两路径），使 `--session <id>` 时该条 trace `session === <id>`。
- [x] S3: 实现 FR-2 `index.ts` 将 `--session` 解析结果透传给 trace 写入（async 与 sync 两路径），使 `--session <id>` 时该条 trace `session === <id>`。
- **描述**: 在现有架构内完成 FR-2: `index.ts` 将 `--session` 解析结果透传给 trace 写入（async 与 sync 两路径），使 `--session <id>` 时该条 trace `session === <id>`。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 无 `--session`/无 env 时，trace 默认标识与 `resolveSessionContext().sessionId` 逐字一致（消除 `'session-default'` vs `'default'` 分叉）。
- [x] S4: 实现 FR-3 无 `--session`/无 env 时，trace 默认标识与 `resolveSessionContext().sessionId` 逐字一致（消除 `'session-default'` vs `'default'` 分叉）。
- **描述**: 在现有架构内完成 FR-3: 无 `--session`/无 env 时，trace 默认标识与 `resolveSessionContext().sessionId` 逐字一致（消除 `'session-default'` vs `'default'` 分叉）。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 `writeTraceEntry`/`writeTraceEntrySync` 增加可选 `sessionId` 入参并保持向后兼容（缺省时自解析）。
- [x] S5: 实现 FR-4 `writeTraceEntry`/`writeTraceEntrySync` 增加可选 `sessionId` 入参并保持向后兼容（缺省时自解析）。
- **描述**: 在现有架构内完成 FR-4: `writeTraceEntry`/`writeTraceEntrySync` 增加可选 `sessionId` 入参并保持向后兼容（缺省时自解析）。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `--session <id>` 执行任一被 trace 记录的命令时，`trace.jsonl` 该条 `session === <id>`（透传生效）。；AC-2: 无 `--session` 且无 `DOCPATH_SESSION` 时，trace `session` 值与 `resolveSessionContext().sessionId` 逐字一致（默认串不再分叉为 `session-default`）。；AC-3: 隔离行为零变化：`verifySessionCwd`/锁/`touchSession` 路径不受影响，`resolveSessionContext` 不新增读取平台 env。；AC-4: `getSessionId()` 私有 env 旁路被移除或收敛为委托 `resolveSessionContext`；`detectAgent()` 仍独立记录平台。；AC-5: 新增回归测试覆盖 AC-1/AC-2；`writeTraceEntry` 向后兼容（既有 `tests/runtime-state.test.mjs` trace 轮转用例不破）。；AC-6: 全量测试与 typecheck 通过，零行为回归。
- **验收条件**: AC-1: `--session <id>` 执行任一被 trace 记录的命令时，`trace.jsonl` 该条 `session === <id>`（透传生效）。；AC-2: 无 `--session` 且无 `DOCPATH_SESSION` 时，trace `session` 值与 `resolveSessionContext().sessionId` 逐字一致（默认串不再分叉为 `session-default`）。；AC-3: 隔离行为零变化：`verifySessionCwd`/锁/`touchSession` 路径不受影响，`resolveSessionContext` 不新增读取平台 env。；AC-4: `getSessionId()` 私有 env 旁路被移除或收敛为委托 `resolveSessionContext`；`detectAgent()` 仍独立记录平台。；AC-5: 新增回归测试覆盖 AC-1/AC-2；`writeTraceEntry` 向后兼容（既有 `tests/runtime-state.test.mjs` trace 轮转用例不破）。；AC-6: 全量测试与 typecheck 通过，零行为回归。
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
