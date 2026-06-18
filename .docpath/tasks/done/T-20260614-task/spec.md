# T-20260614-task - 收紧文档索引生成视图与空任务路由边界

> backlog_id: R-170
> backlog_source: docpath backlog capture
> readiness: confirmed

## 1. 背景与动机

Dogfood 暴露了两个同源的工作流/文档系统边界问题：

1. `docpath reveal --topic docs --level 2` 会把 `docs.md`、`archive/docs-legacy-20260613.md` 这类生成视图或历史大索引当作普通 topic 候选，导致 `estimated_tokens_selected` 接近 77k。虽然正文未默认展开，但预算信号已经失真，Agent 容易把二级索引当成推荐深读目标。
2. 在 completed/idle 且没有活跃任务时，`analyze` / `write-analysis` 仍可能沿用上一轮 `task_id` 写入旧任务；`task reset` 后 `status/next` 也可能被旧 breadcrumb 的 in_progress 计数误导，推荐完成不存在的旧步骤。

这两类问题都指向同一原则：机器真源和渲染视图必须有清晰边界；空任务状态不能从旧运行态派生下一步。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 文档索引能识别生成视图、legacy 索引和大体积索引视图，并把它们从普通 topic 候选中降权或隔离。
- [ ] FR-2: `reveal/context --topic docs` 的 selected token 统计不再被 `docs.md`、`archive/docs-legacy-*.md` 这类文件主导。
- [ ] FR-3: 生成视图仍然可发现，但输出必须表达它们是 generated/index/archive-like 视图，不应推荐 Agent 默认深读正文。
- [ ] FR-4: `analyze` 在 completed/idle 且无活跃任务时不得静默复用旧 task_id；应 fail-loud 并提示先 `docpath backlog capture` 或 `docpath backlog promote`。
- [ ] FR-5: `write-analysis` 在无活跃任务时不得写入旧 canonical task；应 fail-loud 并提示先创建/提升任务。
- [ ] FR-6: `next --agent` / `status --agent` 在 `phase=idle` 或 `task_id` 为空时，不应根据旧 breadcrumb in_progress 推荐 `docpath agent step`。

### 非功能需求

- [ ] NFR-1: 保持现有 docs-index JSON schema 向后兼容，新增字段必须 append-only 或可由 normalize 推断。
- [ ] NFR-2: 不删除 `docs.md`，不破坏人类可读索引。
- [ ] NFR-3: 不引入外部搜索、向量索引或网络依赖。
- [ ] NFR-4: 新行为必须有自动化测试覆盖。

## 3. 范围界定

### 包含

- `src/utils/document-index.ts` 的文档分类、topic 匹配、排序或统计逻辑。
- `src/commands/reveal.ts` / `src/commands/context.ts` 的索引输出与提示文案。
- `src/commands/analyze.ts` / `src/commands/write-analysis.ts` 的活跃任务保护。
- `src/utils/agent-output.ts` 或相关 next/status 路由中 idle 空任务与旧 breadcrumb 的分离。
- `tests/docs-index.test.mjs`、`tests/analyze.test.mjs`、`tests/next.test.mjs` 等回归测试。
- 文档中补充 generated view 与 JSON 真源边界。

### 不包含

- 删除或重命名 `docs.md`。
- 重写 docs scan 全量架构。
- 修改任务生命周期的核心状态枚举。
- 引入新的数据库、服务或外部 LLM 调用。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | generated view 处理 | 从索引删除 / 标记并降权 / 保持现状 | 标记并降权 | 删除会损害人类可发现性；保持现状会继续误导 Agent。 |
| 2 | 空任务 analyze 行为 | 自动创建任务 / 写入上一任务 / fail-loud | fail-loud | 自动创建会绕过 backlog 成熟度；写旧任务会污染归档证据。 |
| 3 | idle next 行为 | 继续用 breadcrumb 推荐旧步骤 / 只推荐新需求入口 | 只推荐新需求入口 | idle 没有活跃任务，旧 breadcrumb 只能作为历史证据，不能驱动下一步。 |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [ ] 否
- [x] 是，需要用户确认

### 变更类型

- [x] 工作流 / Agent 行为
- [x] 架构 / 模块边界
- [x] 长期维护成本增加

### Decision Brief

- 当前问题: generated Markdown 视图和机器索引候选边界不清；空任务状态可能复用旧 task_id 或旧 breadcrumb。
- 目标: 让 Agent 默认路径只消费可信索引和当前任务，避免预算噪声与旧任务污染。
- 背景: 用户指出 backlog 不应未经 brainstorm/需求理解就 add；本轮 dogfood 进一步证明空任务入口和文档视图边界需要 fail-loud。
- 可选方案: 删除生成视图；保留但降权；新增专用索引层；自动创建任务。
- 推荐方案: 保留生成视图但通过 metadata/priority/budget 规则降权；无活跃任务写分析时 fail-loud；idle next 只推荐 capture/analyze/promote 入口。
- 不做什么: 不删除 `docs.md`，不引入外部索引，不绕过 backlog maturity gate 自动创建任务。
- 成本: 需要调整索引分类、输出统计和多组状态机测试。
- 风险: 过度降权可能让用户找不到 docs 入口；通过保留索引摘要和提示降低风险。
- 回滚方案: 回退分类/排序改动，恢复旧 topic 选择；保留 fail-loud 测试作为独立修复可单独保留。
- 用户确认: 用户要求继续优化工作流和文档系统，并明确同意 backlog 需求应先 brainstorm/充分理解后再进入执行。

## 5. 验收标准

- [ ] AC-1: 构造包含巨大 `docs.md` 和 `archive/docs-legacy-*.md` 的测试索引时，`reveal --topic docs --level 2` 不把这些文件排在普通候选前列，selected token 不被其主导。
- [ ] AC-2: `context --topic docs` 保留 generated/archive-like 条目的可发现摘要，但不会展开其正文，且提示其为生成视图或降权候选。
- [ ] AC-3: 在 completed/idle 且无活跃 task 时运行 `analyze --content ...` 不写入上一任务，输出明确修复建议。
- [ ] AC-4: 在 idle 且 `task_id` 为空但 breadcrumb 仍有 in_progress 历史时，`next --agent` 推荐捕获/分析新需求，而不是 `docpath agent step` 旧步骤。
- [ ] AC-5: `pnpm test`、`pnpm run typecheck`、`docpath check`、`docpath review` 通过或明确记录非阻塞警告。
