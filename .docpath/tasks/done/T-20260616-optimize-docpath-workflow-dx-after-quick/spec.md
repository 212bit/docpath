# T-20260616-optimize-docpath-workflow-dx-after-quick - Optimize DocPath workflow DX after quick-profile dogfood

> backlog_id: R-192
> backlog_source: docpath backlog add
> user_confirmed: 用户要求：把这些都放到一个backlog里面然后完成它

## 1. 背景与动机

Dogfooding the quick fast-track workflow exposed several places where DocPath still imposes unnecessary operator cost or reports noisy secondary state. The goal is to improve daily DX without weakening standard workflow guarantees.

需要处理的摩擦点：

1. `start` / `go` / `step done` / `current_step` 在步骤切换后可能不一致。
2. `docpath done` 可能重复运行或拒绝可安全复用的 fresh check/review evidence。
3. volatile workspace rendered Markdown 会产生 docs-index stale 噪声。
4. plan 还没全部完成时，pending-done 不应成为 primary next route。
5. `changes --agent` 已给出 canonical evidence staging plan，但 commit/stage 工具没有干净消费它。
6. install-manifest drift 噪声需要区分 pre-existing baseline 与当前任务回归。
7. review warnings 需要尽量区分 existing baseline warning 与 new warning。
8. quick scope guard 需要更清晰、可配置，尤其支持安全的 document-only allowance。
9. status/done 输出需要更清楚暴露 active workflow profile 与 gate policy。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 保持 `docpath start`、`docpath go --step`、`docpath step done` 在正常步骤切换后的 current-step 状态一致。
- [ ] FR-2: `docpath done` 在 task 状态和 evidence freshness 安全时可复用成功的 check/review evidence，并说明复用或拒绝复用的原因。
- [ ] FR-3: docs-index stale checks 忽略 volatile workspace rendered Markdown，避免正常运行态渲染造成 stale-doc 噪声。
- [ ] FR-4: plan steps 未全部完成前，pending-done 只能作为 secondary signal，primary route 继续指向下一个未完成步骤。
- [ ] FR-5: closeout/staging 工具可以消费 `changes --agent` canonical evidence staging plan，默认 force-add canonical ignored evidence 并排除 `.docpath/tasks/current/*` alias evidence。
- [ ] FR-6: drift/review/install 输出在数据可得时区分 baseline/pre-existing noise 与 current-task regressions。
- [ ] FR-7: quick scope guard policy 更清楚且可配置，支持安全的 document-only edits，同时继续阻止宽泛 source changes。
- [ ] FR-8: status/done 输出包含 active workflow profile 与 gate policy。

### 非功能需求

- [ ] NFR-1: 保持 standard workflow gate 语义兼容，除非显式 profile policy 放宽。
- [ ] NFR-2: 保持 Codex、Claude Code、OpenCode 和通用 CLI 用户兼容。
- [ ] NFR-3: 针对 routing、closeout、quick policy、gate output 添加聚焦回归测试。
- [ ] NFR-4: 优先改结构化 machine output，不依赖解析 Markdown runtime views。

## 3. 范围界定

### 包含

- CLI workflow routing 与 closeout 改进。
- Workflow profile/gate policy 输出。
- docs-index stale filtering for generated runtime views。
- quick guard policy options 与测试。
- 对上述行为的测试和任务 evidence。

### 不包含

- 重写 DocPath 状态机。
- 移除 standard workflow 必需 gates。
- 在当前任务中实现完整历史 baseline database。
- 大规模重构 install adapters。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 优化方式 | bypass / ad hoc escape / deterministic CLI improvements | 采用 deterministic CLI improvements | 保持 DocPath 可审计，同时降低重复操作和噪声 |
| 2 | gate 处理 | silently skip / bounded evidence reuse | 采用 bounded evidence reuse | 不削弱 standard gate，只复用可证明 fresh 的成功证据 |
| 3 | warning 处理 | hide warnings / distinguish baseline where practical | 采用 distinguish baseline where practical | 降低噪声但不掩盖真实风险 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: quick-profile dogfood 暴露出步骤状态、closeout、docs-index、review/install warning 和 evidence staging 的重复成本与噪声。
- 目标: 降低常见 workflow overhead，同时保持 deterministic state machine 与 audit trail。
- 背景: standard lifecycle 对复杂任务仍然必要，但微型/恢复/收尾路径不应被 secondary noise 主导。
- 可选方案: 不改；增加隐藏 bypass；在现有 CLI route 和 policy 层做确定性优化。
- 推荐方案: 在 commands/utils/profile policy 内做确定性改进；无法完全判定 baseline 时，显式标注而不是隐藏。
- 不做什么: 不引入隐藏 LLM 决策；不 silent skip standard gates；不手改 runtime state。
- 成本: 中等，涉及 workflow commands、closeout commands、quick guard policy 与 tests。
- 风险: 错误复用 gate evidence 可能隐藏 stale checks；输出字段变化可能影响脆弱消费者；quick guard 配置过宽可能误放行。
- 回滚方案: 各改动局部化，可分别 revert；standard gates 保持 fallback。
- 用户确认: 用户明确要求“把这些都放到一个backlog里面然后完成它”。

## 5. 验收标准

- [ ] AC-1: `start`/`go`/`step done` current-step consistency 有回归测试覆盖。
- [ ] AC-2: `done` 可在安全时复用 fresh successful gate evidence，并报告复用/拒绝原因。
- [ ] AC-3: docs-index stale warnings 忽略 volatile workspace rendered Markdown。
- [ ] AC-4: pending-done 在所有 plan steps 完成前为 secondary signal。
- [ ] AC-5: closeout/staging 工具可以应用 canonical evidence staging plan，并默认排除 `tasks/current` aliases。
- [ ] AC-6: install/review drift 输出尽量区分 baseline/pre-existing noise 与 current-task regressions。
- [ ] AC-7: quick scope guard 支持清晰 configurable/document-only allowances，并继续阻止 broad source edits。
- [ ] AC-8: status/done 输出包含 active workflow profile 与 gate policy details。
- [ ] AC-9: `pnpm test`、`pnpm run typecheck`、`docpath check`、`docpath review`、`docpath done` 通过；若有残留问题需明确记录。
