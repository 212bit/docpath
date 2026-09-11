# R-330 分析：弹回环残余成因定性（2026-09-11）

## 结论

**组合成因，主因为恢复链消息缺口（背景 (b) 分支成立），非守卫拦截语义缺陷。**

`run start --note` 只解锁 phase 门（planning→executing），对 untracked 新文件**完全无效**；
而 `buildDirtyWorktreeError` 的恢复指引只建议 run start，从未提及 untracked 文件的解锁操作
`git add`（归属认领）。Agent 照建议执行后仍连败 2 次，最终靠自行 git add 解锁。

## 证据链（task T-20260911-trace-status，2026-09-11 17:14-17:29）

前置状态：quick 溢出废弃→promote 升级标准任务→plan 完成（phase=planning）。
工作区遗留 5 个业务文件：`src/commands/trace.ts`、`src/commands/register/tdd-debug.ts`、
`src/utils/README.md`（tracked 修改）+ `src/utils/ceremony.ts`、`tests/ceremony.test.mjs`（untracked 新文件，见 04ca173 stat）。

| 时刻 | 事件 | 结果 | 机理 |
|---|---|---|---|
| 17:15:08 | go --step S1 | FAIL | phase=planning → `isActiveTask=false`（`ACTIVE_TASK_PHASES`={executing,checking,reviewing} 不含 planning）→ 全部 5 个非 DocPath 文件被拦（git-dirty-guard.ts:243-253） |
| 17:15:56 | go --step S1 | FAIL | 同上 |
| 17:16:46 | run start --step S1 --note | 成功 | `transitionWorkflow('step.started')` 合法（transitions.ts:74，from planning）→ **phase 解锁为 executing** |
| 17:16:46 | go --step S1 | FAIL | isActiveTask=true → tracked 修改放行，但 `if (!untrackedSet.has(file)) return false` 只放行 tracked，untracked 2 个新文件仍被拦 |
| 17:18:14 | go --step S1 | FAIL | 同上 |
| 17:18-17:29 | （git add，breadcrumb 外操作） | — | staged 后 porcelain 状态从 `??` 变 `A `，`parseStatusLine` 的 untracked 判定为 `x==='?' && y==='?'` → 不再算 untracked |
| 17:29:30 | go --step S1 | 成功 | untracked 集合清空，guard 放行 |

breadcrumb 证据：`.docpath/workspace/breadcrumb.jsonl` 09:16:46Z 恢复意图记录（「ceremony 实现（4 文件）先于 promote 产生」）与 09:29:30Z S1 started。

## 三个候选假设的裁决

- **(a) agent 未用逃生入口**：部分成立但非主因——本次 agent 确实采用了 run start（17:16:46），说明逃生入口可用但**不完整**。
- **(b) run start 后 go 语义未解锁（恢复链缺陷）**：✅ 主因。run start 解锁 phase 门有效，但错误消息对 untracked 场景给出的建议无效；消息全程未提 git add。
- **(c) R-319 会话隔离误判**：不成立。本例 taskId 匹配（T-20260911-trace-status），isActiveTask 判定正确生效。

## 修复方向（不推翻 R-318/R-249 拦截语义）

`buildDirtyWorktreeError`（git-dirty-guard.ts:120）按 blockedFiles 是否含 untracked 分支：
1. **含 untracked**：主建议改为「若属本任务：`git add <files>` 认领归属后重试 go；若不属：先收口（changes --agent / commit / stash）」，run start 建议降级为针对 tracked 部分的补充。
2. **仅 tracked**：保留现有 run start 建议（该场景下它有效）。
3. `formatDirtySummary` 的 untracked 行追加一句归属认领提示。

验证方式：扩展 `tests/dirty-worktree-guard.test.mjs`——断言 untracked 场景错误消息含 git add 指引、active-task 下 untracked 仍被拦截（语义不变）。
