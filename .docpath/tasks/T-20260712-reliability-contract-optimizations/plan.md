## 执行计划

### S1: 梳理 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。
- [x] S1: 梳理 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。
- **描述**: 根据 spec 明确 FR-1: 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。 的实现边界和验收口径。
- **验收条件**: AC-1: README 和相关源码注释不再把 `.docpath/workspace/current.md` 描述为机器状态真源。
- **依赖**: 无

### S2: 实现 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。
- [x] S2: 实现 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。
- **描述**: 在现有架构内完成 FR-1: 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。 的代码与文档更新。
- **验收条件**: FR-1 更新 README 和相关源码注释，明确 JSON/JSONL 是机器真源，Markdown 是人类视图或叙事文档。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 增加 workflow state 契约测试，覆盖 `snapshotFromState`、`stateFromPhaseGate` 和非法状态归一化。
- [x] S3: 实现 FR-2 增加 workflow state 契约测试，覆盖 `snapshotFromState`、`stateFromPhaseGate` 和非法状态归一化。
- **描述**: 在现有架构内完成 FR-2: 增加 workflow state 契约测试，覆盖 `snapshotFromState`、`stateFromPhaseGate` 和非法状态归一化。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 增加关键 `--agent` 输出契约测试，覆盖 `next --agent` 与 `status --agent` 的代表性字段。
- [x] S4: 实现 FR-3 增加关键 `--agent` 输出契约测试，覆盖 `next --agent` 与 `status --agent` 的代表性字段。
- **描述**: 在现有架构内完成 FR-3: 增加关键 `--agent` 输出契约测试，覆盖 `next --agent` 与 `status --agent` 的代表性字段。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 验证验收标准
- [x] S5: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: README 和相关源码注释不再把 `.docpath/workspace/current.md` 描述为机器状态真源。；AC-2: 状态契约测试覆盖代表性状态到 phase/gate 映射、phase/gate 到 runtime state 映射和非法状态归一化。；AC-3: Agent 输出契约测试覆盖 `next --agent` 与 `status --agent` 的代表性稳定字段。；AC-4: `pnpm test` 通过。
- **验收条件**: AC-1: README 和相关源码注释不再把 `.docpath/workspace/current.md` 描述为机器状态真源。；AC-2: 状态契约测试覆盖代表性状态到 phase/gate 映射、phase/gate 到 runtime state 映射和非法状态归一化。；AC-3: Agent 输出契约测试覆盖 `next --agent` 与 `status --agent` 的代表性稳定字段。；AC-4: `pnpm test` 通过。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
