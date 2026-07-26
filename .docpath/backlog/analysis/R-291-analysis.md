# R-291 Analysis — plan 命令写盘先于 FSM 校验（半执行污染）

## 1. 缺陷

planCommand（src/commands/plan.ts:329-350）的执行序为：写盘（writeGeneratedPlan → writeActiveTaskFile 双写 plan.md + plan.json）→ 再 transitionWorkflow('plan.ready')。FSM 在转移时才校验合法性，于是在 completed 等非法阶段误跑 `docpath plan` 时，canonical 计划证据先被改写、之后才报 Illegal transition——已完成任务的 plan.json 时间戳被刷新；若 spec 与旧 plan 有差异，checklist 勾选状态会被保守草案直接清零（canonical 证据污染，且已 gc/提交的任务无 git 兜底时不可恢复）。

实证：2026-07-26 本会话两次复现（R-286/R-287 起任务期间在 completed 态误跑 plan，T-…-changes-report… 与 T-…-isdocpathworktree… 的 plan.json 均被改写，靠 git checkout 恢复）。与 R-279（completed 任务上 go/agent step 半执行污染 breadcrumb）同族——「写盘先于校验」模式。

## 2. 方案

写盘前用 FSM 单源做前置校验（fail-loud，零写入）：

- planCommand 在 readCurrentState 后、任何写盘前，用 `listValidWorkflowEvents(current)` 判定 `plan.ready` 是否合法；非法即抛错并给出 `preferredWorkflowCommand(current)` 建议（与 R-262 路由单源一致，不手写提示）。
- `--dry-run` 保持现状（prompt emitter，无写盘无状态，无需门禁）。
- current 为 null（全新工作区）沿用 FSM fallback（idle 合法）不拦。
- 不改 transitionWorkflow 本身——转移时的持锁校验仍是最终防线（TOCTOU 窗口由锁内校验兜底），本修复只是把 UX 层校验提到写盘前。

## 3. 验收

- AC-1: phase=completed（含其它非法阶段）运行 `docpath plan` 退出码非零，plan.md/plan.json 内容与运行前逐字节一致（零写入）。
- AC-2: 错误信息含非法原因与 FSM 派生的建议下一步命令。
- AC-3: 合法阶段（drafting/planning 等）plan 行为不变，`--dry-run` 不受影响；现有测试全绿 + 新增回归测试。

## 4. 风险与回滚

- 风险：极低——纯前置校验，不改写路径与 FSM。
- 回滚：revert 单点。
