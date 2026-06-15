## 执行计划

### S1: 修复 runtime cleanup 与 compact 触发边界
- **描述**: 让 cleanup 读取 check-history、session、lease 的真实 schema，并把 destructive cleanup 从默认 compact 中拆到显式 `compact --cleanup`。
- **验收条件**: runtime cleanup 测试覆盖真实字段与旧字段兼容；`docpath compact` 默认不裁剪运行态，`docpath compact --cleanup` 才执行清理。
- **依赖**: 无

### S2: 修复 docs archive 与 stale index 行为
- **描述**: 调整 docs scan/context/reveal 对归档任务的索引策略，使旧归档任务保持可发现并用 stale 标记区分。
- **验收条件**: 旧归档任务仍在 docs-index 中；显式 `context --task-id <id>` 可以展开 stale archived task。
- **依赖**: S1

### S3: 修复 universal install 的 OpenCode 资产
- **描述**: 让 universal install 安装 `OPENCODE.md`、写入正确 `.opencode/docpath.json`，并修正 manifest/summary。
- **验收条件**: install 测试覆盖 opencode、codex、claude、universal target；install doctor/check-only 行为保持兼容。
- **依赖**: S1

### S4: 明确 status/next 与 agent protocol 边界
- **描述**: 将 `status --agent` 定位为 diagnostic snapshot，将 `next --agent` 定位为 active route，并同步 AGENTS/CODEX/CLAUDE/OPENCODE、protocol templates、Codex skill 和 rules。
- **验收条件**: `status --agent` 的执行路线只在 `route_hint`；`next --agent` 提供 active route；协议不再要求双命令启动。
- **依赖**: S2, S3

### S5: 增加 task identity drift fail-loud 保护
- **描述**: 在 task files、write-spec、tasks sync、check、next/status 和 tasks drift 中增加 task id 身份一致性检测，阻止错误 spec 继续污染 canonical/current。
- **验收条件**: task identity drift 优先于普通 current/canonical drift 报告；`check` 在 drafting 等阶段不触发非法 workflow transition；写入错误 task id 的 spec 失败且不改文件。
- **依赖**: S4

### S6: 执行恢复路径并保留 drifted draft
- **描述**: 将 `T-DRAFT-data-uniform` draft 保存为 backlog R-182，从归档恢复旧任务 canonical/current，再 reset stale current，并将当前修复包绑定到 R-181 active task。
- **验收条件**: `docpath tasks drift` 不再报告身份漂移；R-182 保留 draft 内容；R-181 建立 active task spec/plan。
- **依赖**: S5

### S7: 回归验证与 closeout
- **描述**: 运行全量测试、typecheck、diff check、DocPath check，并刷新 docs index / backlog index。
- **验收条件**: `pnpm test`、`pnpm run typecheck`、`git diff --check` 通过；`docpath check --skip-tests --skip-lint` 通过或仅剩明确的非本任务阻塞项。
- **依赖**: S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S4 → S5 → S6 → S7
S1 → S3 → S4
