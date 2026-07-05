# R-246 Decision Brief - Completed Route Precedence

- 当前问题: `docpath next --agent` can recommend `docpath agent step --status done` after the task is already completed, but the state machine rejects that command.
- 目标: Completed tasks must not route to execution-step commands based on stale plan/breadcrumb evidence.
- 背景: After closing `T-20260705-docpath-intake`, `next --agent` reported `phase=completed/gate=review_pass` while still recommending `agent step --step S4 --status done`.
- 可选方案:
  - 方案 A: Let users manually edit plan/breadcrumb state.
  - 方案 B: Make completed-state routing take precedence over active-step routing.
  - 方案 C: Relax `agent step` to allow completion from completed/reviewing phases.
- 推荐方案: 方案 B.
- 决策理由: Completed-state route precedence matches state-machine semantics and avoids allowing lifecycle mutation after closeout.
- 不做什么: Do not hand-edit workspace runtime files; do not weaken `agent step` transition guards.
- 成本: Small targeted router/test change.
- 风险: Could suppress active-step recommendations if condition is too broad; regression tests should keep executing behavior intact.
- 回滚方案: Revert the routing/test changes.
- 用户确认: User requested continuing with this exact residual `next --agent` route contradiction on 2026-07-05.
