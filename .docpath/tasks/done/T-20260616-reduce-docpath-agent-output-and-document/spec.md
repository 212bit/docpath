# T-20260616-reduce-docpath-agent-output-and-document - Reduce DocPath agent output and document index token noise

> backlog_id: R-194
> workflow_profile: standard

## 1. 背景与动机

DocPath 已经完成 JSON-first / CLI-first 的基本方向，但狗粮使用暴露出 token 消耗和输出冗余问题：

- `docpath next --agent` / `status --agent` 在正常态仍输出空 drift 明细、完整 healthy install 信息、lesson key 列表和重复 current_focus。
- `.docpath/docs.md` 作为 human rendered index 已增长到约 153KB，`docs list` 默认打印完整索引会诱导 agent 消费大体积低信号表格。
- `context` / `reveal` 的文档索引摘要默认列出较多重复字段，正常路径上 path/type/scope/default_read/archive/generated_view/index_only/budget_excluded/tokens/task_id/summary 的逐条输出密度偏高。
- `changes --agent` clean/normal 状态仍输出完整结构，适合诊断但不适合高频 closeout。
- completed 路由会被低信息密度 lesson 候选占据，即使 `learn --dry-run` 会把它们全部归档。

目标是在不削弱可恢复性、门禁和 JSON 机器真源的前提下，减少默认 agent 输出和文档索引摘要带来的 token 成本。

## 2. 需求清单

### 功能需求

- [ ] FR-1: `next --agent` / `status --agent` 正常态默认省略空明细和 healthy 诊断细节。
- [ ] FR-2: `lesson_summary` 默认只输出计数和必要状态；低价值 lesson 候选不应阻塞 completed 状态进入下一项工作。
- [ ] FR-3: `changes --agent` 在 clean worktree 或无异常 closeout 状态下输出 compact 结构；异常或有变更时仍保留足够可操作信息。
- [ ] FR-4: `context` / `reveal` 的默认文档索引摘要减少逐条字段和默认条目数；topic/task/verbose/full 模式可展开更多信息。
- [ ] FR-5: `docs list` 默认输出 compact human summary；完整 human index 需要显式 full 模式或等价入口。
- [ ] FR-6: 保留 JSON/verbose/debug 路径，以免破坏自动化、测试和人工诊断。

### 非功能需求

- [ ] NFR-1: 不改变状态机语义、门禁顺序或 check/review/journal 的完成条件。
- [ ] NFR-2: 不删除 canonical evidence、workspace truth source 或 docs-index 机器真源。
- [ ] NFR-3: 默认输出应优先服务 agent 下一步决策，诊断细节按需展开。
- [ ] NFR-4: 覆盖现有测试，并新增 compact 输出与兼容性测试。

## 3. 范围界定

### 包含

- Agent YAML 输出压缩：`src/utils/agent-output.ts`。
- Git closeout agent 输出压缩：`src/commands/changes.ts`。
- 文档索引 scan/list 和 context/reveal 摘要输出压缩：`src/commands/docs.ts`、`src/commands/context.ts`、`src/commands/reveal.ts`、`src/utils/document-index.ts`。
- Lesson 候选低价值分类对 completed 路由的影响调整：`src/utils/agent-output.ts` 与 `src/commands/learn.ts` 中已有分类逻辑的复用或提取。
- 测试更新：`tests/next.test.mjs`、`tests/changes.test.mjs`、`tests/docs-index.test.mjs` 等相关测试。

### 不包含

- 不重做 DocPath 状态机。
- 不改变 spec/plan/check/review/journal 的核心生命周期。
- 不删除历史任务、breadcrumb、backlog 或 decisions 文件。
- 不把 quick profile 用于本任务。
- 不引入新存储后端或大依赖。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 生命周期 | quick / standard | standard | 本任务改变 CLI 输出契约、文档系统默认行为和 Agent 路由，属于 workflow/Agent 行为变更，不符合 quick 边界。 |
| 2 | 输出策略 | 删除字段 / 条件化字段 / 保持现状 | 条件化字段 | 正常态省 token，异常态保留诊断能力。 |
| 3 | 文档策略 | 删除 docs.md / compact docs.md / 保持完整表 | compact docs.md/list，full 显式展开 | 保留 human view，但避免默认打印 153KB 索引。 |
| 4 | 兼容性 | 直接改默认 / 新增 opt-in / 双模式 | 默认 compact + verbose/json/full 兼容 | Agent 高频路径默认低噪声，诊断路径不丢信息。 |

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
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: Agent-facing 默认输出和文档索引摘要在正常路径上过于详细，造成 token 消耗、重复阅读和下一步判断噪声。
- 目标: 默认输出更短，异常和诊断模式仍完整；文档系统保持 index-first，但默认只给可行动摘要。
- 背景: 本轮审计量化出 `.docpath/docs.md` 约 153KB、`.docpath/docs-index.json` 约 198KB，并定位到 `next/status`、`changes`、`context/reveal`、`docs list` 的冗余输出点。
- 可选方案: A 保持现状；B 删除部分文档/字段；C 条件化输出并保留 verbose/json/full 展开路径。
- 推荐方案: C。正常态 compact，异常态和显式诊断模式展开。
- 不做什么: 不删除 canonical evidence，不改生命周期门禁，不用 quick profile 绕过标准 review。
- 成本: 需要调整输出 contract 和测试断言；部分 downstream 文本匹配测试可能需要更新。
- 风险: 过度压缩可能隐藏诊断线索；通过 `--verbose`、`--json`、`--full` 或异常态自动展开缓解。
- 回滚方案: 保留旧渲染函数或 verbose/full 路径；若 agent 使用受影响，可临时改回详细输出。
- 用户确认: 用户已确认窄任务标题，并要求测试是否能用 quick；结论是机械可创建但治理上不适用 quick。

## 5. 验收标准

- [ ] AC-1: `docpath next --agent` completed/healthy 状态输出不再列空 drift details、空 identity details、完整 healthy install details 或全量 lesson keys。
- [ ] AC-2: 低价值 lesson 候选不会在 completed 状态下持续抢占主路由；仍可通过 learn 命令处理。
- [ ] AC-3: `docpath changes --agent` clean 状态输出 compact，存在变更或 canonical evidence 缺失时仍提供可操作 staging 信息。
- [ ] AC-4: `docpath context` / `docpath reveal` 默认文档索引摘要更短，显式 topic/task/verbose/full 路径能展开必要明细。
- [ ] AC-5: `docpath docs list` 默认不打印完整 500+ 行索引；完整索引有显式入口。
- [ ] AC-6: 相关 node tests 通过，至少覆盖 next/status、changes、docs/context/reveal 的 compact 行为。
- [ ] AC-7: `docpath check` 通过，`docpath changes --agent` closeout 无 canonical evidence blocker。
