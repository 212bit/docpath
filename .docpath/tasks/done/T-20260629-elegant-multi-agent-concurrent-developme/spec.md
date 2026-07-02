# T-20260629-elegant-multi-agent-concurrent-developme - Elegant multi-agent concurrent development auto-worktree isolation

> backlog_id: R-233

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Elegant multi-agent concurrent development auto-worktree isolation

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Elegant multi-agent concurrent development auto-worktree isolation

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

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
- 当前问题: ## 背景
- 目标: Elegant multi-agent concurrent development auto-worktree isolation
- 背景: 来自 backlog R-233
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 已在 grill-me 面试中取得用户批准，通过自动隔离工作区的设计与开发实现。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-233 与任务 T-20260629-elegant-multi-agent-concurrent-developme 建立双向关联

## Journal Record

### 📝 任务摘要
实现了多 Agent 并发开发下的自动 Git Worktree 隔离机制，当有活跃任务或脏工作区时自动分流，并建立极速的父仓库 `node_modules` 软链共享，另外通过更新 `.gitignore` 彻底消除了软链导致的未跟踪状态噪声。

### 🏗️ 架构决策
- Git Worktree 隔离: 在多 agent 并存或工作区脏时自动创建 worktree，并共享父级依赖与 backlog，在 done 后由主仓库 prune 回收。
- Gitignore 去除斜杠规则: 将 `.gitignore` 中的 `/node_modules/` 改为 `/node_modules`，使其能够同时匹配并忽略软链接，解决 Git 将其误识为未跟踪文件的噪声问题。

### 💡 经验教训
- 一定要严格在 isolated worktree 中执行 `plan` / `go` / `agent enter` / `done` 的完整状态机流程，不能在旧工作区里抢跑开发、也不能在 go 之前引入未跟踪代码，否则会触发 DocPath 脏门禁和类型检查失败。

### 🔮 后续改进
- 持续在 install 命令或 init 命令中对 `.gitignore` 的规则进行强制修复或校验。
