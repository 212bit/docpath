# R-318 Analysis — go --step 执行起始守卫误拦本任务合法改动，制造 33% 失败重试环

## Problem

`.docpath/workspace/trace.jsonl` 全量实测（本工作区，1506 条）：`go` 调用 147 次，失败 **49 次（33%）**，其中 **43/49 记录为 `gate=none`**（即非具名 review/check 门禁，属命令自身执行前守卫抛错）。每一次 go 失败都逼 Agent 再调 `next`/读 `current.md` 看清状态、再重发正确命令——**每个失败制造 2–3 个零信息增量 turn**，且集中在历史最长的执行中后段（成本超线性放大）。

> **重要纠正**：backlog 初稿把根因写成"步骤顺序不匹配"，那是从 `gate=none` 字段的**错误推断**。通读 `src/commands/go.ts` 后确认：`go --step <id>` 经 `selectTargetStep` 仅按 id 定位步骤，**代码中不存在步骤顺序校验**。`gate=none` 只代表"未命中具名门禁"，其真实来源是下述执行起始守卫。

## Root Cause（已定位到代码）

`goCommand` 在 `!status`（进入执行）路径上，于 **`go.ts:287` 调用 `assertNoNonDocPathChangesForExecutionStart`**，而该守卫**跑在 `startStep`（`go.ts:329` → `transitionWorkflow('step.started')` 把 phase 置为 executing）之前**。守卫逻辑（`git-dirty-guard.ts:221`）：

- `isActiveTask` 仅当 `state.task_id === options.taskId` **且** `state.phase ∈ {executing, checking, reviewing}` 时为真（`git-dirty-guard.ts:235`, `ACTIVE_TASK_PHASES` L219）。
- 当 `isActiveTask === false` 时，**所有非 DocPath 簿记的 dirty 文件（含本任务自己的 tracked `.ts/.mjs` 改动）都被计入 `blockedFiles`**（L246–255），守卫抛 `buildDirtyWorktreeError` → go 以非零退出（对应 trace 的 `gate=none` 失败）。

于是两条高频触发路径：

1. **首个 `go --step S1`**：任务刚 promote、phase 尚未进入 `executing`，若 Agent 已按正常"改代码→记录"习惯先编辑了源码（tracked 改动），`isActiveTask=false` → 这些**合法本任务改动被误判为无关变更并拦截**。这正是已 **dropped 的 R-249**（"go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦"）未根治的残留分支。
2. **会话串味放大**：当 R-319 的 session 键失效（多任务塌缩为 `session-default`）导致 `state.task_id` 与 `options.taskId` 不一致时，`isActiveTask` 恒为 false，误拦被系统性放大。

**次要来源**（需 plan 首步用真实错误消息分布确认占比，勿 overclaim）：`go.ts:220` 对 `phase=completed` 的抛错、`go.ts:250` 无 task_id、`go.ts:257` 漂移锁、`go.ts:285` 重大变更门禁、`go.ts:314` UI 门禁。这些是**合法门禁**，不在本次放宽范围。

## Expected Behavior

守卫的**使命是防止"别的任务/来源"的代码混进本任务执行**，不应拦截**当前任务自身**的 tracked 改动。修正方向（择一，见 Decision Brief）：让 go 在"开步前"就能把当前任务的 tracked 源码改动识别为可放行，而不是要求 phase 已经是 executing 才放行（鸡生蛋）。

具体：`assertNoNonDocPathChangesForExecutionStart` 的"当前任务归属"判定，应在 `go` 首次 `--step` 时**接受 `phase ∈ {promoted, drafting, planning} 且 state.task_id === options.taskId`** 作为"本任务活跃"，从而放行本任务 tracked 改动；对**确属外部的 untracked 源码文件**仍拦截。

## Scope

### In scope
- `src/utils/git-dirty-guard.ts`：`isActiveTask` 判定放宽（纳入"刚 promote 未进 executing 但 task_id 匹配"的本任务首步场景）。
- 失败输出（`buildDirtyWorktreeError`）：当确属误拦风险时，直接给出"这些改动属于当前任务时可用的放行入口"命令（现已有 `docpath run start --step`，L136），确保**一条可复制命令**即可纠正，Agent 无需再 `next` 往返。
- `src/commands/go.ts`：必要时调整守卫与 `startStep` 的先后，使"本任务首步 + 本任务改动"不被自身时序卡住。
- 回归测试：覆盖 `tests/dirty-worktree-guard.test.mjs` / `tests/go-auto-next.test.mjs`。

### Out of scope
- 不削弱对**外部/跨任务**改动与 untracked 陌生文件的拦截（守卫核心职责保留）。
- 不改 FSM 合法转移语义；不碰重大变更门禁 / UI 门禁 / check / review 门禁。
- 不在本任务修 R-319（会话隔离）本身，仅解除其对 go 失败的正反馈叠加；两者边界清晰、可独立验收。

## Technical Surface
- 主因：`src/utils/git-dirty-guard.ts:221` `assertNoNonDocPathChangesForExecutionStart` / `isActiveTask`(L229–241) / `ACTIVE_TASK_PHASES`(L219)。
- 触发时序：`src/commands/go.ts:287`（守卫）先于 `go.ts:329 → startStep → go.ts:201 transitionWorkflow('step.started')`。
- 交叉项：`src/utils/session.ts` `resolveSessionContext`（R-319 关联，勿在此合并修）。
- 测试：`tests/dirty-worktree-guard.test.mjs`（守卫行为真源）。

## Decision Brief（L2；promote 后写入 spec）

- **问题**：go 执行起始守卫把当前任务自己的 tracked 源码改动误判为"无关变更"并拦截，制造 33% 失败重试环（含 R-249 残留 + R-319 叠加）。
- **选项**：
  - A：放宽 `isActiveTask` 归属判定，纳入"task_id 匹配的本任务首步（promoted/drafting/planning 相）"，放行本任务 tracked 改动；untracked 陌生文件仍拦。**（推荐）**
  - B：把守卫移到 `startStep`（置 executing）之后再跑，从时序上根除鸡生蛋；改动面更大，可能影响 dirty-guard 对其他入口（promote/agent enter）的语义。
  - C：仅在失败消息里更详细地指路，不改判定——治标，重试环仍在。
- **选择（推荐）**：A —— 直击归属判定，改动局部、风险可控，保留对跨任务/外部改动的拦截力；配合"失败即回送可复制放行命令"进一步压成单 turn。
- **为何不 B**：调整守卫与状态写入的先后属时序级改动，回归面波及 promote/enter，收益不抵风险；先用 A 覆盖主场景，若仍有残留再评估 B。
- **为何不 C**：C 不减失败次数，只减失败后的困惑；与 R-318"降 turn"目标不符。
- **风险**：放宽归属可能放行"同 taskId 但实为陈旧"的改动 → 以 `state.task_id === options.taskId` 严格相等 + 仍拦 untracked 陌生文件兜底。
- **回滚**：还原 `isActiveTask` 判定条件即可，行为退回现状。
- **验证前置**：plan S1 先用一次真实消息分布采样（或从 `run start` 逃生入口日志）确认 dirty-guard 在 49 次失败中的实际占比，若显著低于预期则收敛修复范围。

## Acceptance Criteria
- [ ] AC-1: 任务刚 promote、phase 未进 executing、工作区仅含本任务 tracked 源码改动时，`docpath go --step S1` **成功开步**（不再误拦）。
- [ ] AC-2: 存在**跨任务/外部** tracked 改动或**陌生 untracked 源码文件**时，守卫仍拦截（保护力不降）。
- [ ] AC-3: 确需人工放行时，失败输出含**一条可直接复制的放行命令**，Agent 无需额外 `next`/读 `current.md`。
- [ ] AC-4: plan 首步产出 go 失败真实成因占比的采样记录，据此确认或收敛修复面（防止按错误假设过度放宽）。
- [ ] AC-5: `tests/dirty-worktree-guard.test.mjs` 覆盖 AC-1/AC-2 正反用例；`go` 失败率复核（目标从 33% 降至 <10%，用 trace 验证）。
- [ ] AC-6: 全量测试与 typecheck 通过，零行为回归；不触碰 FSM 合法转移与其他门禁。

## Evidence References
- trace 实测：go 147 调用 / 49 失败 / 43 为 `gate=none`（本工作区 `.docpath/workspace/trace.jsonl`，2026-07~09）。
- 代码真源：`src/commands/go.ts:287,329`、`src/utils/git-dirty-guard.ts:221,229-241,246-258`、`ACTIVE_TASK_PHASES` L219。
- 历史关联：R-249（dropped，"频繁误拦"残留分支）、R-319（会话隔离失效，正反馈叠加源）、R-313（backlog 全域簿记放行，同类归属判定放宽先例）。

## FR-4 采样结果（S1 实现前复验）— **前提被证伪**

AC-4 要求在写代码前先采样坐实 dirty-guard 占比。隔离临时仓库复现（phase=planning/drafting + **本任务 own** tracked 源码改动，随后 `go --step S1`）：

```
[A] phase=planning  blocked=true  offersRunStart=true -> runstart=ok go2=ok
[B] phase=drafting  blocked=true  offersRunStart=true -> runstart=ok go2=ok
```

**三条硬事实（推翻方案 A 的前提）**：

1. **FR-3 当前代码已满足**：失败消息本身已带可复制恢复命令 `docpath run start --step <S> --note "..."`（`git-dirty-guard.ts:136`），无需"新增"。
2. **恢复成本仅 +1 命令**，不是原估的 "+2~3 盲目重试 turn"：`run start` 认领本任务改动 → `go` 立即成功。原 P0 成本模型对 dirty-guard 这一项**过于悲观**。
3. **该拦截是有设计、有测试的执行起始守卫（R-249/R-313）**：现存 `tests/dirty-worktree-guard.test.mjs:229` 明确断言 phase=planning + 本任务(taskId 同为 T-DIRTY) tracked 源码脏改时 `go` **必须**以 code 1 拒绝，并回送 `run start`。放宽 `isActiveTask`（方案 A）会**直接弄坏这条测试、推翻 R-249 意图**。

**自我纠正**：本会话早先撞到的守卫，真实情况是 **R-317 遗留的跨任务源码改动**被本任务（R-318）planning 阶段纳入——守卫拦得**对**，正确处置正是 commit/stash（我当时也确实这么做了），并非"误拦本任务改动"。据此，R-318 的核心缺陷假设不成立。

## 处置结论（2026-09-07）

**R-318 判定为"按设计工作，非缺陷"，以 `dropped` 关闭。** 依据 AC-4"防止按错误假设过度放宽"的保险触发。真正仍站得住、值得投入的是：
- **R-319（会话隔离失效）**：`resolveSessionContext` 多任务塌缩为 `session-default`，导致 `state.task_id` 与 `options.taskId` 串味——这是**独立且真实**的问题，且它是本条守卫误判的**放大器**（若真要修守卫误判，根子在 R-319，而非放宽守卫）。
- **R-320（next 哈希去重）**：稳定状态下重复 `next` 全量重注入，是纯 turn 成本，与守卫无关。

若未来仍想让"本任务 own 改动"零命令起步（省掉那 1 次 `run start`），那是一个**新的、需单独 Decision Brief 的设计变更**（要同时改 `dirty-worktree-guard.test.mjs:229` 契约），不属于本条范围，收益仅 +1 命令/任务，性价比低于 R-319/R-320。
