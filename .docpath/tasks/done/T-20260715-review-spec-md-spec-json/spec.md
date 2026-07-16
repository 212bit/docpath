# T-20260715-review-spec-md-spec-json - review structured truth drift preflight

> backlog_id: R-252
> backlog_source: docpath backlog capture

## 1. 背景与动机

`docpath review` 当前会继续执行普通代码审查，即使 active task 的 `spec.md` 与 `spec.json`，或 `plan.md` 与 `plan.json` 已经出现 `source.content_sha256` 不一致。此时 agent 可能看到漂移提示但仍不清楚应以哪个文件为准、如何同步。

DocPath 已有结构化漂移检测和格式化修复建议：`detectStructuredMarkdownHashDrift()` 与 `formatStructuredMarkdownHashDrift()`。本任务把这条检测前置到 review，使 review 在机器真源不一致时 fail loud，并直接给出 `write-spec` / `write-plan` 或 `render --view` 修复路径。

分析证据: `.docpath/backlog/analysis/R-252-analysis.md`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。
- [ ] FR-2: 检测到 drift 时，`docpath review` 退出非零，不写入 review evidence、不推进 workflow，并输出包含 `机器真理源不同步` 的明确错误。
- [ ] FR-3: drift 输出必须包含具体 drift 文件、hash 差异摘要和可执行修复建议：Markdown 为准时使用 `docpath write-spec --stdin` 或 `docpath write-plan --stdin`，JSON 为准时使用 `docpath render --view spec|plan`。
- [ ] FR-4: 无 drift 的 clean review 行为保持不变，包括 review skill gate、finding_scope 和 evidence 写入。

### 非功能需求
- [ ] NFR-1: review 保持 read-only 修复策略，不新增 `review --fix-drift`，不自动同步 markdown/json。
- [ ] NFR-2: 复用现有 structured-docs drift helper，避免新增第二套 hash 判断语义。
- [ ] NFR-3: 错误信息对 agent 可操作，能直接指向下一条命令。

## 3. 范围界定

### 包含
- `src/commands/review.ts` 增加 structured truth drift preflight。
- 回归测试覆盖 spec drift 阻断 review 和 clean review 不回归。

### 不包含
- 新增 `review --fix-drift`。
- 修改 `check --fix-drift`。
- 修改 `write-spec` / `write-plan` 的同步语义。
- 修改 `next --agent` 的 drift route。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | review drift 处理 | 自动修复 / fail loud 提示命令 | fail loud 提示命令 | review 是审查命令，不应在审查前自动改任务真源 |
| 2 | drift 检测来源 | 新写 hash 逻辑 / 复用 structured-docs helper | 复用 helper | 与 next/check 的 hash 语义保持一致 |

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
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: review 遇到 spec/plan markdown 与 JSON 机器真源不同步时，缺少前置阻断和可执行修复路径。
- 目标: review 在 drift 状态 fail loud，并输出 write-spec/write-plan 或 render 修复建议。
- 背景: R-252 来源于 evoucher session 中 agent 对 spec.md/spec.json 不同步提示的处理困惑。
- 可选方案: A. 只补提示；B. review preflight fail loud；C. review --fix-drift 自动修复。
- 推荐方案: B。
- 决策理由: B 能防止在真源不一致时继续审查，同时不扩大 review 的写操作边界。
- 不做什么: 不新增 review 自动修复，不改变 check/write/render 的职责。
- 成本: 小，复用现有 helper 并补测试。
- 风险: review 在 drift 状态更早失败；这是期望的 fail-loud 行为。
- 回滚方案: 回滚本任务提交即可恢复旧 review 行为。
- 用户确认: 用户要求继续完成剩余 backlog，按 R-252 scope 执行。

## 5. 验收标准

- [ ] AC-1: active task 的 canonical `spec.md/spec.json` 出现 structured hash drift 时，`docpath review` 退出非零。
- [ ] AC-2: drift review 输出包含 `机器真理源不同步`、具体 `spec.md/spec.json` 路径和 `docpath write-spec --stdin` / `docpath render --view spec` 修复建议。
- [ ] AC-3: active task 的 canonical `plan.md/plan.json` 出现 structured hash drift 时，输出等价的 `write-plan` / `render --view plan` 修复建议。
- [ ] AC-4: 无 drift 的 review 现有测试保持通过。
- [ ] AC-5: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
