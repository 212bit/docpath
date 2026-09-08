# 多任务并发优化分析（候选，待审阅）

> 状态：分析存档，**未立项、未实现**。供用户审阅后决定方向。
> 日期：2026-09-09
> 触发：R-321 收尾时暂存被并发会话卷入提交（b57a209）；当前 R-315/T-20260908 正在**主 checkout** executing，占用同一工作树。
> 关联决策：R-171（会话隔离 MVP，2026-06-14 用户确认「保持单 active task」）、R-238/R-273（worktree 隔离契约）、R-262（changes --agent task-aware 分组）。

## 1. 核心判断

DocPath 的「多任务」**不是缺功能，而是既有安全机制没被启用/没被维护**。架构早已刻意选定「单活跃任务 + worktree 隔离做并行」，但实践中：会话身份全回落 `default`、lease 形同虚设、主 checkout 被多 agent 共享、12 个 worktree 陈旧未清理。最高价值的优化是**强制 + 卫生**，不是造多活跃任务运行时。

## 2. 现状取证（2026-09-09，只读）

- **单活跃任务模型**：`workspace/state.json` 单槽（一个 task_id/phase）。见 `docs/design/session-isolation-mvp.md`（"not a multi-task scheduler"）、`docs/features/worktree-workflow.md` 第 520 行（"单活跃任务：一个 worktree 一个任务"）。
- **两套并行机制**：
  - Session lease（R-171）：同 checkout 多会话，task/step 级 lease 冲突检测，fail-loud。
  - Worktree 隔离（R-238/R-273）：一 worktree 一任务，workspace/tasks/journal 物理隔离，backlog/rules/tasks-done 为 tracked 快照合并中介。
- **实测证据**：
  - `.docpath/workspace/sessions/` 只有 `default.json`；`DOCPATH_SESSION` 未设置 → **所有 agent 同一身份**。
  - `.docpath/workspace/leases/` 为空，尽管 R-315 正 executing → lease 未持有（TTL 过期或 session-less 流程未 claim）。
  - `git worktree list` 有 **12 个 worktree**（r243~r268 + feature-project-scan），大概率已合并未 prune；文档自述「不建议超过 5 个」。
  - R-315/T-20260908 在**主 checkout**（非 worktree）executing，S3 进行中，工作树 dirty。
  - 活队列极小：R-315(active)、R-322(proposed)，其余 done/dropped。
  - 旁支：`install-manifest-drift` 健康检查连续两天 `passed:false, errors:1`。

## 3. 差距分析

| # | 差距 | 后果 | 证据 |
|---|------|------|------|
| G1 | 会话身份回落 `default` | lease 冲突检测无法区分会话 → 静默失效 | sessions 只有 default.json |
| G2 | 同 checkout 多 agent 静默抢占 | promote/go 覆盖 state.json 单槽；git 暂存区全局共享被他人 commit 卷入 | R-321 暂存被卷进 b57a209；R-315 现占主树 |
| G3 | worktree 隔离无强制/无卫生 | 官方并行路径没人走，12 个陈旧 worktree 堆积 | git worktree list |
| G4 | 无跨 worktree 可视化 | 看不到谁在哪个 worktree 跑什么、stale lease、阻塞步骤 | status --team 是文档 Phase 2，未实现 |
| G5 | install 健康持续 failed | next/status 恒报 drift，噪声掩盖真问题 | install_health.passed:false |

## 4. 方案选项

### 多任务方向

- **A1 并发隔离强制（推荐，价值高/风险低）**
  - 做什么：`promote`/`go`/`agent enter` 在同 checkout 检测到「已有 executing 任务」或「近期有异 session 活动」或「DOCPATH_SESSION 未设且非单会话」时，**fail-loud 并引导 `docpath worktree create` 隔离**，而非静默抢占 state.json。可选：非交互 agent 模式下也提供自动隔离（现仅交互式 promote 会自动开 worktree）。
  - 边界：不改单活跃任务模型；只加「共享 checkout 并发」的前置守卫与引导。
  - 依赖：需明确「异 session 活动」的判定信号（state.json mtime + breadcrumb sessionId + lease）。
  - 直接堵住 G1/G2（我踩两次的坑）。

- **A3 worktree 卫生（推荐与 A1 打包，价值中高/风险低）**
  - 做什么：一次性 prune 12 个陈旧 worktree；`worktree doctor`/`gc` 自动识别「已合并 + 干净」的 worktree 并提示 prune；`next`/`status` 在 worktree 数超阈值时告警。
  - 边界：prune 前需确认已合并（`git branch --merged`）+ 无未提交变更；不自动删有 dirty 的。
  - 直接堵 G3。

- **A2 status --team 跨 worktree 看板（可选，价值中/风险低-纯读）**
  - 做什么：只读聚合各 worktree 的活跃 session、持有 lease、在跑任务、stale lease、阻塞步骤 + 建议恢复命令。填补 session-isolation-mvp.md 的 Phase 2。
  - 可复用 `docpath projects` + project-registry(SQLite) 的跨项目聚合模式，下沉到跨 worktree。
  - 纯读零副作用；堵 G4。

- **A4 同任务多步并发 `go --claim`（价值中/风险中高）**
  - 做什么：把 task 级 lease 细化到 step 级 + 依赖规则，允许多 agent 做同一任务的不同步骤。R-171 已把它 gate 在「`go --claim` + 依赖规则明确后」。
  - 风险：state.json/current.md/last-check/review/tasks-current 仍是任务全局，需先 task-scoped 化，牵动面大。

- **A5 真·多活跃任务运行时（不建议，价值高/风险很高）**
  - 做什么：task-scoped 的 state/check/review/handoff/current-alias（R-171 的 Option C）。
  - 为何不建议：**违背 R-171 用户已确认的架构决策**；迁移面巨大（几乎所有生命周期命令）；收益需先证明。若未来并发 agent 成常态可重估，但门槛高。

### 非多任务（旁支，可单独 quick）

- **B1 install-manifest-drift 排查**：连续两天 failed，查是真漂移还是误报（有 R-311/R-312 前科）。低风险快赢。
- **B2 R-322 撞号数据迁移**：5 起历史 id 撞号（R-260/261/262/263/268），需自己的 Decision Brief，改 id 牵动 links/历史引用。
- **B3 backlog list 默认过滤终态**：上次 R-321 D2 未采纳的 option B，低风险小改善。

## 5. 推荐

**A1 + A3 打包**为首选：把「多任务」从纸面支持变成实践强制 + 卫生，证据最硬、成本最低、直堵两起真实事故。A2 作为只读增益可捎带。**避开 A5**。B1/B2/B3 可各自作为独立 quick/level-1 处理。

## 6. Decision Brief（待用户确认）

- 当前问题：多 agent 共享主 checkout，会话身份/lease/worktree 隔离三套安全机制均未启用或未维护，导致 state 抢占与 git 暂存卷入（已发生 2 次）。
- 目标：让既有的「单活跃任务 + worktree 隔离」模型在实践中被强制、被维护、可观测。
- 可选方案：A1 / A1+A3 / A2 / A4 / A5 / B1-B3（见上）。
- 推荐方案：A1+A3（+可选 A2）。
- 不做什么：不造多活跃任务运行时（A5）；不改单活跃任务核心模型；不自动删有未提交变更的 worktree。
- 成本：A1+A3 中等（守卫逻辑 + prune/doctor 增强 + 测试）；A2 中等（只读聚合）。
- 风险：A1 守卫过严可能误拦合法单会话流程 → 需精确判定信号 + 明确豁免；prune 误删 → 只删已合并+干净的。
- 回滚方案：守卫与 prune 均为附加逻辑，可单独回退；不改 state schema。
- 用户确认：**待定**（本文档即供审阅）。

## 7. 落地前提（若决定实现）

1. **隔离**：当前主 checkout 被 R-315 占用，实现须先 `docpath worktree create <slug>` 到独立 worktree（正好实践 A1 理念，避免第三次撞车）。
2. **先清场**：开工前 prune 12 个陈旧 worktree（A3 的一次性部分）。
3. **正式立项**：checkout 空闲后（或在隔离 worktree 内）把选定方向 `backlog capture`/`add` 成正式条目（本文档作 evidence），再 promote → spec（Decision Brief 落 spec）→ 标准流程。

## 8. 备注

本文档为**未跟踪的分析存档**，未 stage/commit，未创建 backlog 条目——以避免与正在主 checkout 执行的 R-315 会话争 `backlog.md` 索引或被卷入其提交。立项动作留到 checkout 空闲或在隔离 worktree 内进行。
