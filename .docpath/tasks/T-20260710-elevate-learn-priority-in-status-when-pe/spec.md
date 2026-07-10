# T-20260710-elevate-learn-priority-in-status-when-pe - Elevate /learn priority in status when pending lesson candidates and regression warnings exist

> backlog_id: R-237
> backlog_source: docpath backlog capture

## 1. 背景与动机

`docpath next --agent` / `status --agent` 已能统计 `lesson_summary.pending_count`，但 `inferNextAction` 在 `completed` / `idle` 下把 proposed/raw backlog 排在 learn 之前。

真实失败模式（2026-07-10）：phase=completed、pending lessons=10、install_health 失败（install-manifest-drift），`next` 仍推荐 brainstorm 分析 proposed backlog，导致 journal 后的知识收口被拖延。

目标：在 idle/completed 且存在可行动（非 low-value）lesson 候选时，抬高 `docpath learn --dry-run` 路由优先级（仍低于 dirty closeout 与可执行 accepted promote）；当存在 install/check 等 regression/health 告警时强化文案。

### 1.1 已有证据

- brainstorm: session:brainstorm-dry-run:2026-07-10 R-237 Elevate /learn priority
- analysis: .docpath/backlog/analysis/R-237-analysis.md

## 2. 需求清单

### 功能需求

- [ ] FR-1: 在 completed/idle 路由中，actionable pending lessons 优先于 proposed/raw backlog shaping（brainstorm/accept）与 immature accepted backlog edit
- [ ] FR-2: dirty worktree / ignored closeout evidence 仍优先于 learn
- [ ] FR-3: accepted **executable** backlog promote 仍优先于 learn
- [ ] FR-4: 当 install_health 失败或同类 health/regression 告警存在且仍有 actionable pending lessons 时，recommended_command 为 `docpath learn --dry-run`，next_action 体现待固化 lesson
- [ ] FR-5: 仅 low-value workflow lesson 时不强制 learn（沿用 `isLowValueWorkflowLessonBlock` / `summarizeUnlearnedLessonCandidates`）
- [ ] FR-6: 不改变 active executing/checking/reviewing 阶段的既有路由

### 非功能需求

- [ ] NFR-1: 保持与现有 DocPath FSM 与命令行为兼容；不自动执行 `docpath learn`（仍 dry-run 优先）
- [ ] NFR-2: 新增行为通过本地自动化测试验证，不依赖网络或外部 LLM
- [ ] NFR-3: agent YAML 字段尽量 append-only；不破坏现有解析器

## 3. 范围界定

### 包含

- 调整 `src/utils/agent-output/formatters.ts` 中 `inferNextAction` 的 completed/idle 分支顺序
- 将已有 `installHealth`（或等价 health 信号）接入 learn 提升文案/路由判断
- `tests/next.test.mjs` 回归用例覆盖 AC-1..AC-5

### 不包含

- 自动运行 `docpath learn`（无 dry-run）
- 修改 learn 合并语义、lesson key 去重、style/architecture 写入规则
- Dashboard UI 改造
- 在 executing/checking/reviewing 强制 learn
- 重做 install doctor 本身

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | learn 相对 backlog 优先级 | A 全高于 accepted / B 高于 proposed+immature 低于 accepted+dirty / C 仅在有 warning 时提升 | B | 保护知识收口且不饿死可执行 accepted 与 git closeout |
| 2 | warning 角色 | 仅告警文案 / 告警作为额外门控 | 告警强化文案；无告警时 learn 仍压过 proposed | 仅依赖告警会漏掉“只有 lessons + proposed backlog”主故障 |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [ ] 否
- [x] 是，需要用户确认

### 变更类型

- [x] 工作流 / Agent 行为

### UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief

- 当前问题: completed/idle 路由把 proposed backlog 排在 learn 前，pending lessons 与 health 告警无法驱动知识收口
- 目标: idle/completed 下 actionable pending lessons 优先于 backlog shaping；closeout 与 accepted executable promote 仍更高
- 背景: R-237 分析与 2026-07-10 实机路由证据
- 可选方案:
  - 方案 A: lessons 存在时 learn 高于一切 backlog（含 accepted）
  - 方案 B: learn 高于 proposed/immature accepted，低于 dirty closeout 与 accepted executable；warning 强化文案
  - 方案 C: 仅在 lessons + warning 同时存在时提升 learn
- 推荐方案: 方案 B
- 决策理由: 修复主故障且不饿死可执行任务；C 单独会漏主故障
- 不做什么: 不自动 learn、不改 learn 合并、不改 dashboard、不在执行中途强制 learn
- 成本: 低；集中在 inferNextAction 与 next 测试
- 风险: agent 可能先 learn 再 shape backlog；由 low-value filter 与 dry-run 缓解
- 回滚方案: 恢复 inferNextAction 原分支顺序
- 用户确认: 用户于 2026-07-10 明确同意 promote R-237 并实现（会话指令“同意”），接受方案 B 的 Agent 路由行为变更

## 5. 验收标准

- [ ] AC-1: completed + actionable pending lessons + proposed raw backlog 时，`next --agent` 推荐 `docpath learn --dry-run`，而不是 brainstorm/accept
- [ ] AC-2: 同上且 install_health 失败（或同类 health/regression 告警）时仍推荐 learn，next_action 体现待固化 lesson
- [ ] AC-3: accepted 可执行 backlog 与 dirty worktree closeout 仍优先于 learn
- [ ] AC-4: 仅 low-value workflow lesson 时不强制 learn
- [ ] AC-5: `tests/next.test.mjs`（或等价）覆盖 AC-1..AC-4；不引入网络/LLM 依赖
- [ ] AC-6: backlog 条目 R-237 与任务 T-20260710-elevate-learn-priority-in-status-when-pe 双向关联保持有效

## 6. 技术要点

- 主改动: `inferNextAction` completed 块与 idle case 中 learn 与 proposed/immature 的相对顺序
- 可向 `inferNextAction` 传入 `hasHealthRegressionWarning`（来自 context.installHealth）以强化 next_action 文案
- 既有测试模板: `tests/next.test.mjs` 中 learn-before-capture 用例
