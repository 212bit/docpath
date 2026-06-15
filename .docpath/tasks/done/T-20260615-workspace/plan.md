## 执行计划

### S1: 梳理现有 cleanup、gc、compact 行为
- **描述**: 阅读并确认 `workspace-cleanup`、`gc`、`compact` 和相关测试的当前语义，明确哪些行为需要保留、扩展或避免回归。
- **验收条件**: 形成实现边界：`docpath gc` 现有历史 task 清理不被破坏，`compact` 默认无 cleanup，`compact --cleanup` 与 workspace cleanup 复用同一引擎。
- **依赖**: 无

### S2: 扩展 workspace cleanup engine 的计划与执行模型
- **描述**: 将 cleanup 策略集中在 workspace cleanup 模块中，支持 dry-run 计划、force 执行摘要、保守保护对象、corrupted candidate 报告和幂等执行。
- **验收条件**: cleanup 引擎可区分候选项、跳过项、错误/警告、预计释放大小和实际变更；dry-run 不写文件；force 能清理 check-history、breadcrumb、sessions、leases。
- **依赖**: S1

### S3: 将 `docpath gc` 接入 workspace cleanup dry-run/force
- **描述**: 调整 `docpath gc` 默认输出 workspace cleanup dry-run，`--force` 执行 workspace cleanup，同时保留或兼容现有历史 task directory gc 行为。
- **验收条件**: `docpath gc` 默认无副作用并提示 `--force`；`docpath gc --force` 输出实际清理摘要；既有 task gc 测试或语义不被意外移除。
- **依赖**: S2

### S4: 将 `compact --cleanup` 复用同一 cleanup engine
- **描述**: 保持 `docpath compact` 默认非破坏性，只在显式 `--cleanup` 时调用 S2 的 engine。
- **验收条件**: `compact` 默认不会修改 cleanup 目标；`compact --cleanup` 的策略、保护对象和摘要与 `gc --force` 保持一致。
- **依赖**: S2

### S5: 补齐自动化测试
- **描述**: 新增或扩展测试覆盖 dry-run 无副作用、force 幂等、保护对象、corrupted candidate 报告、read-only 命令无 cleanup、compact 默认行为和 gc 兼容性。
- **验收条件**: 相关单测可独立运行并验证 R-178 acceptance criteria；测试不依赖本机绝对路径。
- **依赖**: S2, S3, S4

### S6: 更新文档与 agent-facing 语义
- **描述**: 更新命令帮助、协议文档或相关说明，明确 CLI/agent 边界：CLI 处理确定性 cleanup mechanics，agent 负责语义决策和确认。
- **验收条件**: 用户可从文档/帮助理解 `gc`、`gc --force`、`compact`、`compact --cleanup` 的副作用边界。
- **依赖**: S3, S4

### S7: 验证、审查、归档与 closeout
- **描述**: 运行定向测试、全量验证、DocPath check/review/journal/changes，修复发现的问题并完成任务归档。
- **验收条件**: 测试、typecheck、diff check、DocPath gates 通过；任务进入 done/archive 状态；closeout evidence 可用于本地提交。
- **依赖**: S5, S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S3 → S5 → S7
S1 → S2 → S4 → S5 → S7
S3 → S6 → S7
S4 → S6 → S7
