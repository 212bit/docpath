# T-20260906-p0-go-step-33-49-147-43-gate-none-dirty- - P0: 修正 go 执行起始守卫误拦本任务改动导致 33% 失败重试环

> backlog_id: R-318
> backlog_source: docpath backlog add

## 1. 背景与动机

依据 `.docpath/workspace/trace.jsonl` 全量 1506 条真实调用记录（本工作区实测）：`go` 调用 147 次、失败 **49 次（33%）**，其中 **43/49 记录为 `gate=none`**（非具名 review/check 门禁，即命令自身执行前守卫抛错）。每次 go 失败逼 Agent 再 `next`/读 `current.md` 确认再重发，制造 2–3 个零信息增量 turn，落在历史最长的执行中后段，成本超线性放大。

**根因（已定位到代码）**：`go --step <id>` 仅按 id 定位步骤，无顺序校验。真凶是 `assertNoNonDocPathChangesForExecutionStart`（`src/utils/git-dirty-guard.ts:221`）——它在 `go.ts:287`、于 `startStep` 把 phase 置为 executing **之前**运行；其 `isActiveTask` 要求 `phase∈{executing,checking,reviewing}` 且 `state.task_id===taskId`。于是"本任务首步（phase 未进 executing）"或"会话串味致 task_id 不符"时，**当前任务自己的 tracked 源码改动被误判为无关变更并拦截**。这是 dropped 的 R-249"频繁误拦"残留分支，并与 R-319 会话隔离失效正反馈叠加。

完整根因、取舍与验收见分析件：`.docpath/backlog/analysis/R-318-analysis.md`。

## 1.1 已有证据

### 深度分析摘要 (analysis)

`.docpath/backlog/analysis/R-318-analysis.md`

## 2. 需求清单

### 功能需求
- [ ] FR-1: 放宽 `assertNoNonDocPathChangesForExecutionStart` 的"本任务归属"判定，使 `task_id` 匹配且 phase∈{promoted,drafting,planning} 的本任务首步场景，放行本任务 tracked 源码改动，`go --step S1` 成功开步。
- [ ] FR-2: 保留对**跨任务/外部** tracked 改动与**陌生 untracked 源码文件**的拦截，守卫保护力不降。
- [ ] FR-3: 确需人工放行时，失败输出含**一条可直接复制**且指向当前 step 的放行命令，Agent 无需额外 `next`/读 `current.md`。
- [ ] FR-4: 实现前先采样确认 go 失败真实成因分布（dirty-guard 在 49 次失败中的实际占比），据此确认或收敛修复范围，防止按假设过度放宽。

### 非功能需求
- [ ] NFR-1: 零行为回归；不改 FSM 合法转移语义，不触碰 check/review/重大变更/UI 门禁。
- [ ] NFR-2: 改动局部、可回滚（还原 `isActiveTask` 判定条件即恢复现状）。

## 3. 范围界定

### 包含
- `src/utils/git-dirty-guard.ts`：`isActiveTask` 归属判定放宽 + 失败消息可复制放行命令。
- `src/commands/go.ts`：必要时微调守卫与 `startStep` 时序（仅服务 FR-1 主场景，避免波及其他入口）。
- `tests/dirty-worktree-guard.test.mjs`：正反用例回归。

### 不包含
- 不修 R-319 会话隔离本身（仅在边界内解除其对 go 失败的正反馈叠加）。
- 不改对 untracked 陌生文件、跨任务改动的拦截策略。
- 不引入网络/LLM 依赖；不做 plan/go 的语义重构。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 如何消除 go 首步误拦 | A 放宽 isActiveTask 归属判定；B 守卫移到 startStep 之后；C 仅优化失败文案 | A | 直击归属判定，改动局部可控，保留对外部/跨任务拦截；B 时序级回归面波及 promote/enter，C 不减失败次数 |

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
- 当前问题: go 执行起始守卫把当前任务自己的 tracked 源码改动误判为"无关变更"并拦截，制造 33% 失败重试环（R-249 残留 + R-319 叠加）。
- 目标: 消除本任务首步/本任务改动的误拦，把 go 失败率从 33% 降到 <10%，同时不削弱对跨任务/外部改动的保护。
- 背景: 来自 backlog R-318；分析件 `.docpath/backlog/analysis/R-318-analysis.md`。
- 可选方案:
  - 方案 A: 放宽 `isActiveTask` 归属判定，纳入"task_id 匹配的本任务首步（promoted/drafting/planning 相）"，放行本任务 tracked 改动；untracked 陌生文件仍拦。
  - 方案 B: 把守卫移到 `startStep`（置 executing）之后运行，从时序根除鸡生蛋；改动面更大，波及 promote/agent enter 语义。
  - 方案 C: 仅在失败消息里更详细指路，不改判定；治标，重试环仍在。
- 推荐方案: 方案 A
- 决策理由: A 直击归属判定，改动局部、风险可控，保留拦截力；配合"失败即回送可复制放行命令"进一步把纠正压成单 turn。B 属时序级改动回归面过宽；C 不减失败次数，与降 turn 目标不符。
- 不做什么: 不改 FSM 合法转移；不碰 check/review/重大变更/UI 门禁；不在此合并修 R-319；不放宽对 untracked 陌生文件的拦截。
- 成本: 低—中，集中在单函数归属判定 + 一条失败消息；先采样验证占比再收敛。
- 风险: 放宽归属可能放行"同 taskId 但陈旧"的改动 → 以 `state.task_id === options.taskId` 严格相等 + 仍拦 untracked 陌生文件兜底。
- 回滚方案: 还原 `isActiveTask` 判定条件即恢复现状；或退回 backlog R-318 到 proposed。
- 用户确认: 已确认 —— 2026-09-07 会话内用户回复"确认方案 A"，批准采用方案 A（放宽 isActiveTask 归属判定 + 失败即回送可复制放行命令）进入实现；实现首步仍按 FR-4 采样坐实 dirty-guard 占比后再收敛范围。

## 5. 验收标准

- [ ] AC-1: 任务刚 promote、phase 未进 executing、工作区仅含本任务 tracked 源码改动时，`docpath go --step S1` 成功开步，不再误拦。
- [ ] AC-2: 存在跨任务/外部 tracked 改动或陌生 untracked 源码文件时，守卫仍拦截（保护力不降）。
- [ ] AC-3: 确需人工放行时，失败输出一条可直接复制的放行命令，Agent 无需额外 `next`/读 `current.md`。
- [ ] AC-4: plan 首步产出 go 失败真实成因占比采样，据此确认或收敛修复面（防止按错误假设过度放宽）。
- [ ] AC-5: `tests/dirty-worktree-guard.test.mjs` 覆盖 AC-1/AC-2 正反用例；go 失败率复核（目标 33%→<10%，用 trace 验证）。
- [ ] AC-6: 全量测试与 typecheck 通过，零行为回归；不触碰 FSM 合法转移与其他门禁。

---

*由 docpath write-spec --stdin 写入（spec.json 真源同步）。*
