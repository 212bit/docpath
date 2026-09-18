# R-349 分析: agent done 非法状态转换的真实边界与门禁语义裁决 (2026-09-18, 代码核验 + 复现)

## 结论摘要

- **Bug 真实存在**：`agent done` 在 gate 不属于 review 类事件 `requiredGate` 时，失败路径硬走
  `review.failed` / `review.skipped`，被 FSM 拒绝，表面成 "未预期的错误 / Illegal workflow transition"。
- **根因描述不准确**：backlog 称 "`--skip-check` 把 gate 置为 check_fail" —— 事实错误。`--skip-check`
  从不改 gate（历史各版本与当前代码一致，只写审计决策日志）。真实触发条件是 **done 时 gate 仍不是
  `check_pass`**（`none` / `check_fail`），与 `--skip-check` 无因果，只是用户常在此时才想起来用它。
- **崩溃面比 backlog 描述的更宽**：不止 `review.failed`，还包含 quick/instant profile 的
  `review.skipped`（gate 不合法、以及 phase=executing 两种形态）。
- **修复建议 1 不采纳**：新增 `check_skipped` gate 让 skip-check 可 closeout，等于给"检查已失败仍可完成"
  开门，与既有契约冲突（见 F5），属契约变更，不能当 bugfix 顺手做。
- **修复建议 2 采纳但需设计决策**：`--status blocked` 复用 `review.failed` 确为语义 bug（已复现状态污染），
  但 `blocked` 目前在 FSM 中不可达、且渲染映射为 `check_fail`，需要先裁定表示法。
- **修复建议 3 表述不准**：真正的缺口不是"强制 review.failed"，而是**失败路径缺乏 FSM 合法性前置检查**。

## 机制核验 (事实 + 证据)

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `--skip-check` 只记审计，不产生状态转换；gate 保持原值 | src/commands/agent.ts:370-378（skip 分支仅 `recordSkipReason` + return）；src/engine/policy.ts:45-56（`recordSkipReason` 只 `appendDecision('policy.skip')`）；git 历史各版本同形 |
| F2 | review 类事件被 FSM 门禁前置约束：`review.passed/failed` requiredGate=`['check_pass','review_pass','review_fail']`，`review.skipped`=`['check_pass','review_skipped']` | src/engine/transitions.ts:88-89,90；约束执行处 :279-286（fail-loud 抛 Illegal workflow transition） |
| F3 | `agent done` 的失败路径**无条件**尝试这些事件：review 抛错 → `review.failed`；quick/instant → `review.skipped`；blocked closeout → `review.failed` | src/commands/agent.ts:469-471、430-432/441-443、488-490 |
| F4 | 无 diff 时 `reviewCommand` 提前 return（不转移），于是 gate 非法不必然崩溃，改为在 journal 门禁以干净文案失败 | src/commands/review.ts:469-473 early return；src/commands/journal.ts:293-295 `❌ 归档门禁未通过`；src/engine/policy.ts:30 |
| F5 | "check_fail 不得归档"是刻意契约，非缺陷 | src/engine/transitions.ts:92 注释"失败态不得归档"；src/engine/policy.ts:30-37 allowedCompletionGates 不含 check_fail；transitions.ts:77-79 注释声明 requiredGate 就是为拦"check_fail 仍进 review" |
| F6 | 环境性失败（Docker/工具链缺失）同样落 `check_fail`，无 sanctioned 出口 | src/commands/check/evidence.ts:78-87 只做**环境诊断**，仍走 `updateCheckWorkflowState(allPassed=false)` → `check.failed`；`check --force` 仅是无任务守卫（check.ts:154） |
| F7 | `agent done --status blocked` 无任何测试覆盖 | `grep -rn "'--status', 'blocked'" tests/` 零命中 |
| F8 | `blocked` gate 在 FSM 中不可达且渲染歧义 | src/engine/state-machine.ts:190 枚举含 `blocked`，但 transitions.ts EVENT_TARGETS 无任何目标 gate='blocked'；:169-176 把 `blocked` 映射成 state `check_fail` |

## 复现证据 (本次实测, dist 构建 2026-09-14 11:19 = R-349 报告所用同一构建)

夹具：`.docpath/workspace/state.json` 写入指定 phase/gate，`tasks/current/{spec,plan}.md` 结构齐备，
git 仓库含一笔 committed 改动 + 一笔工作区改动（保证 `reviewCommand` 真正跑起来）。
CLI: `node bin/docpath.js`。

| 用例 | 初始态 | 命令 | 结果 | 状态变化 |
| --- | --- | --- | --- | --- |
| A | phase=checking gate=**check_fail** | `agent done --step S7 --skip-check --note repro`（有 diff） | ❌ `Illegal workflow transition: review.failed cannot run with gate=check_fail` → exit 1 | 无变化（卡住） |
| B | phase=checking gate=**check_fail** | 同上 + `--skip-review` | ✅ 干净失败：`❌ 归档门禁未通过 - 当前 gate 为 check_fail，不能完成任务` | 无变化 |
| C | phase=checking gate=**check_pass** | `agent done --status blocked --skip-check --skip-review` | exit **0**（静默成功） | ⚠️ phase=**reviewing** gate=**review_fail**（blocked 语义被污染成"审查失败"） |
| D | profile=**quick** gate=**check_fail** | `agent done --skip-check --note x` | ❌ `review.skipped cannot run with gate=check_fail` | 无变化 |
| E | profile=**quick** phase=**executing** gate=none（真实 quick 流：`init`→`quick`→改文件→`agent done --skip-check`） | 同上 | ❌ `review.skipped cannot run from phase=executing（允许来源: checking, reviewing）` | 无变化 |
| F | 同 E | `agent done --skip-check --skip-review` | ✅ 干净失败：`❌ 归档门禁未通过 - 缺少 last-check.md / 当前 gate 为 none，需要 check_pass` | 无变化 |

要点：
1. 用例 A 与 backlog 报告的现象**逐字一致**，确认 bug 成立。
2. 用例 E 是比 A **更常见**的入口：普通 quick 任务直接 `agent done --skip-check`（未加 `--skip-review`）即崩，
   且崩在 `phase` 而非 `gate`，backlog 完全未覆盖。
3. 用例 C 是本组里**最危险**的形态：不报错、exit 0，任务既未 blocked 也未完成，gate 被写成 `review_fail`，
   后续 next/review 路由全部基于错误前提（next_hint 甚至提示"修正 plan/breadcrumb 漂移"）。

## 对 backlog 三条修复建议的裁决

| 建议 | 裁决 | 理由 |
| --- | --- | --- |
| 1. `--skip-check` 改置 `check_skipped` 并允许 closeout | **否** | 前提失真（F1）；且效果是"检查已失败仍可完成"，与 F5 契约冲突。属契约变更（level 3 语义），须用户单独裁定，不能夹带在 bugfix 里 |
| 2. `--status blocked` 独立转换 | **是（需先定表示法）** | F7/F8：现状把 blocked 写成 review_fail 是明确错误；但 `blocked` gate 当前不可达、渲染映射成 check_fail，需先裁定"blocked closeout"的 FSM 表示 |
| 3. 收尾路径不强制 `review.failed` | **改写** | 真正问题是失败路径缺 FSM 合法性前置检查：应先 `listValidWorkflowEvents` 判定目标事件是否合法，不合法则**原样抛原始错误 + 可操作指引**，而不是抛二次异常掩盖语义 |

## 建议的推进方案 (拆两条，避免 bugfix 夹带契约变更)

**R-349a（本轮可做，level 1 bugfix，不改门禁强度）**
- `runAgentReviewGate` / `finishAgentDoneTask` 的失败路径改为 FSM 感知：
  - 目标事件在当前 phase/gate 不合法时，不尝试转换，直接以可操作文案 fail-loud，
    例如：`检查未通过（gate=check_fail），不能以 --skip-check 收口；请先 docpath check 修复（--skip-tests/--skip-lint 可减负）`；
  - quick/instant 的 `review.skipped` 路径同理（覆盖 gate 与 phase 两种不合法形态）。
- `agent done --status blocked` 与 `review.failed` 解耦（表示法裁定后落地；若裁定"blocked≡check_fail"，
  则至少不得写 `review_fail`/`phase=reviewing`）。
- 验收草案：
  - AC-1: gate ∈ {none, check_fail} × {standard+`--skip-check`, quick+`--skip-check`, `--status blocked`}
    执行 `agent done`，一律不出现 `Illegal workflow transition` / `未预期的错误` 文案，exit≠0 且给出恢复命令。
  - AC-2: `--status blocked` 不再产生 gate=review_fail / phase=reviewing（按裁定写入 blocked 表示）。
  - AC-3: 上述组合均有单测（现 tests/ 零覆盖）；已正常的路径（gate=check_pass 全量 done、quick 走 check 后收口）不回归。

**R-349b（独立需求，level 2→需用户确认）**
- 议题：环境性 check_fail（F6）没有任何 sanctioned 出口，这是 R-023 手工 commit 绕过的真实痛点。
- 候选：① 环境性失败不计入 gate（`environment_failure` 单独通道 + 留痕）；② 新增显式
  `check_skipped` gate + 记录原因 + 禁止 silent 通过；③ 维持现状，仅文档化 workaround。
- 不建议在本轮 bugfix 内决定。

## 当前条目自身的门禁状态（推进前需修）

- `docpath backlog groom`：2 处 error —— 正文缺 `## 背景` / `## 验收` 章标题
  （现有 `## 复现` / `## 验收（Acceptance）` 不被识别）。
- `docpath backlog promote R-349`：会被拒 —— level 2 需要 `evidence.analysis` 或 `evidence.spec`，
  当前两者均为 null；本文件即 `--evidence-analysis` 的候选。
