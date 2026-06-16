## 执行计划

### S1: 定义 compact 输出契约与兼容边界
- **描述**: 明确 `next/status --agent`、`changes --agent`、`context/reveal`、`docs list` 的默认 compact 输出规则，以及 `--json`、`--verbose`、`--full`、异常态展开的兼容边界。确认 quick 模式机械可用但治理不适用，并把该结论保留在 spec/plan 证据中。
- **验收条件**: 输出契约覆盖正常态、异常态、诊断态；不改变状态机、门禁和 JSON 真源；测试更新范围明确。
- **依赖**: 无

### S2: 压缩 agent 路由与 closeout 输出
- **描述**: 调整 `src/utils/agent-output.ts` 和 `src/commands/changes.ts`，让 healthy/empty/clean 状态默认输出 compact 结构；drift、identity drift、install issue、canonical evidence、dirty worktree 等异常仍自动展开可操作明细。
- **验收条件**: `next --agent` completed/healthy 状态不输出空 details、完整 healthy install details 或全量 lesson keys；`changes --agent` clean 状态 compact；异常 closeout 仍保留 staging/阻塞原因。
- **依赖**: S1

### S3: 压缩文档索引默认展示
- **描述**: 调整 `src/commands/docs.ts`、`src/commands/context.ts`、`src/commands/reveal.ts` 和必要的 document-index helper，使 `docs list`、`context`、`reveal` 默认输出短摘要；topic/task/verbose/full 路径保留可展开能力。
- **验收条件**: `docs list` 默认不打印完整 500+ 行表格；`context/reveal` 默认减少文档条目数量和重复字段；显式 topic/task/full 仍可定位并展开文档。
- **依赖**: S1

### S4: 测试、门禁与 closeout
- **描述**: 更新并新增覆盖 compact 行为和兼容路径的测试，运行相关 node tests 与 DocPath closeout 门禁。
- **验收条件**: 相关 `node --test` 通过；`docpath check` 通过；`docpath changes --agent` 无 canonical evidence blocker；任务证据与实现变更可提交。
- **依赖**: S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S4
S1 → S3 → S4
