---
id: R-366
title: transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-transitions-check/spec.md
  decision_brief: |-
    - 当前问题: 承接 R-365（收口口径对齐第一批）与 2e9ef93（顶层接口聚合原则）：`docpath done` 内部即
    - 目标: transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
    - 背景: 来自 backlog R-366
    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A
    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
    - 成本: 中等，按 plan 拆分后逐步验证
    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260923-transitions-check
  spec: tasks/T-20260923-transitions-check/spec.md
created_at: 2026-09-23
---

## 背景

承接 R-365（收口口径对齐第一批）与 2e9ef93（顶层接口聚合原则）：`docpath done` 内部即
`check -> review -> journal` 完整门禁序列，对外推荐应是一步到位的复合命令。

第一批已清理文案层残留，但 `src/engine/transitions.ts` 未动，导致**同一输出内两个字段口径打架**。实测现场（R-365 自身收口时）：

```
下一步: `docpath done` 执行收口门禁（check -> review -> journal）；如需单独排查可运行 `docpath review`
next_hint:
  recommended_command: docpath review      ← 仍指向单步 review
```

根因：`EVENT_RECOVERY_COMMAND`（`transitions.ts:60-75`）与 `preferredWorkflowCommand`
（`:191-215`）中 `check.passed` / `check.env_exempt` 的建议仍为 `docpath review`，而
`formatters.ts` 的同状态分支已改为 `docpath done`。

## 影响面（已核实）

`preferredWorkflowCommand` 有 5 处消费，语义分两类：

**（一）面向用户的「建议下一步」提示** —— 可安全改为 `done`：
- `src/commands/plan.ts:378`（`建议下一步: ...`）

**（二）FSM 报错/恢复路径** —— 语义为「恢复**这个事件**该敲什么」，改 `done` 会造成语义漂移：
- `transitions.ts:156` `workflowEventBlockReason` 的建议
- `transitions.ts:323` `Illegal workflow transition`（phase 不匹配）的建议
- `transitions.ts:335`（gate 前置不满足）的建议
- `EVENT_RECOVERY_COMMAND` 经 `workflowEventSuggestedCommand` 导出

**关键前提已核实**：`docpath done` / `agent done` **没有 FSM gate 前置**（`agent done` 仅在
`review.skipped` / `review.failed` / `agent.blocked` 处做合法性校验），它自行跑 check/review/
journal 三门禁。因此指向 `done` 在任意 gate 下都合法、不会把用户引入死胡同。

## 验收

1. `check.passed` / `check.env_exempt` 在**面向用户**的建议路径上输出 `docpath done`，不再输出 `docpath review`；
2. FSM 报错/恢复路径（`workflowEventBlockReason`、`Illegal workflow transition`）的「建议下一步」语义不被破坏——仍给出**当前 phase/gate 下可执行**的命令，不得因改动引入死胡同；
3. 消除实测现场的口径打架：`check` 通过后，正文引导与 `next_hint.recommended_command` 指向同一收口入口；
4. 既有 FSM / transitions 相关测试全通过；新增断言覆盖「check_pass gate 下建议收口入口」；
5. 不改变任何 `EVENT_TARGETS` / `requiredGate` 等门禁合法性判定（只动建议文案）。

## 范围界定

### 包含
- `transitions.ts` 中 check.passed / check.env_exempt 的建议命令口径对齐

### 不包含
- `EVENT_TARGETS` / `requiredGate` / `from` 等门禁合法性数据（契约层，不动）
- backlog 生命周期聚合（另立条目）
- 命令命名收敛与 budget.ts 措辞
