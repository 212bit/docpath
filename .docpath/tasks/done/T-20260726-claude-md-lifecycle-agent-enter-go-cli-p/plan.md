## 执行计划

### S1: 梳理 CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
- [x] S1: 梳理 CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
- **描述**: 根据 spec 明确 FR-1: CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go 的实现边界和验收口径。
- **验收条件**: AC-1: 全部载体顺序与 CLI 一致; grep 零残留; 仅文档变更
- **依赖**: 无

### S2: 实现 CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
- [x] S2: 实现 CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
- **描述**: 在现有架构内完成 FR-1: CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go 的代码与文档更新。
- **验收条件**: FR-1 CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 全部载体顺序与 CLI 一致; grep 零残留; 仅文档变更；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-290 与任务 T-20260726-claude-md-lifecycle-agent-enter-go-cli-p 建立双向关联
- **验收条件**: AC-1: 全部载体顺序与 CLI 一致; grep 零残留; 仅文档变更；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-290 与任务 T-20260726-claude-md-lifecycle-agent-enter-go-cli-p 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
