---
related:
  - architecture/breadcrumb-task-level-architecture.md
  - features/backlog-lifecycle.md
---

# 状态机正确性分析 (R-203)

## 背景

审查发现 DocPath 存在两套状态机:规约 FSM (state-machine.ts: LEVEL_TRANSITIONS) 与运行时 FSM (transitions.ts: EVENT_TARGETS)。全仓 grep 确认规约 FSM 在定义文件外零消费,属死代码;运行时 FSM 是唯一被强制的转移仲裁层。两大缺口:(1) 门禁前置只到 phase 粒度,gate 级前置 (check 必须 pass 才能 review) 未在 FSM 层强制;(2) level 在运行时被完全忽略,L0/L3 走同一门禁表。

## Technical

## 1. 架构影响与模块边界

改动集中在两个引擎文件,不触碰命令层契约:

- `src/engine/transitions.ts` — 运行时被强制的 FSM(`EVENT_TARGETS` + `transitionWorkflow`)。**唯一真正生效**的转移仲裁层,20+ 命令经此落盘。
- `src/engine/state-machine.ts` — 规约 FSM(`LEVEL_TRANSITIONS` / `canTransition` / `getValidTransitions`)。经全仓 grep 确认在定义文件外**零消费**,属死代码。

边界原则:`transitionWorkflow` 仍是工作流状态写入的唯一入口(workspace.ts 已注释声明),本次不新增写入路径,只收紧其内部前置校验。

## 2. 数据模型 / API / 事件契约

核心缺口:`EVENT_TARGETS[event].from` 用 `WorkflowPhase`(8 值)粒度,只校验 `previous.phase ∈ from`,**不校验 gate**。后果是「检查未过(gate=check_fail)却进 review」在 FSM 层不被拦截,仅靠 review.ts 命令自觉重判。

提议契约扩展(向后兼容,新增可选字段):

```ts
interface TransitionTarget {
  phase: WorkflowPhase;
  gate: GateStatus;
  from: WorkflowPhase[];
  requiredGate?: GateStatus[];   // 新增:对 previous.gate 的前置约束
}
// review.passed/review.failed: requiredGate: ['check_pass','review_pass','review_fail']
// journal.archived:           requiredGate: ['review_pass']
```

校验在 `transitionWorkflow` 持锁段内、phase 校验之后追加:若 `target.requiredGate` 存在且 `previous.gate ∉ requiredGate` → 抛同样风格的 fail-loud 错误(允许门禁 + 建议下一步)。

## 3. 依赖、迁移与兼容性

- 无外部依赖变更。
- `requiredGate` 为可选,未声明的事件行为完全不变 → 对现存 state.json 无迁移成本。
- 死代码清理选项见 open-questions;若选「删除」,需同步删 `LEVEL_TRANSITIONS`/`canTransition`/`getValidTransitions`/`Transition` 接口及 README 流转图脚注,但**保留** `LEVEL_NAMES`/`LEVEL_DESCRIPTIONS`/`ComplexityLevel`(complexity.ts/escalation.ts 仍在用)。

## 4. 测试策略与质量门禁

- 扩 `tests/transitions.test.mjs`:新增「checking/check_fail 下 review.passed 被拒」「reviewing/review_fail 下 journal.archived 被拒」两条负向用例;补「checking/check_pass 下 review.passed 通过」正向用例。
- 若清理死代码:删除或改写任何引用 `canTransition` 的断言(当前 grep 显示 tests 中无直接引用,需复核 transitions.test/policy.test)。
- 全量 `pnpm test`(45 文件,串行)必须绿;`docpath check` 门禁通过。

## 5. 安全、性能与运维风险

- 性能无影响(持锁段内多一次集合判断)。
- 风险:收紧前置可能让历史漂移状态(gate 不在 requiredGate 内)的工作流在转移时报错。缓解:requiredGate 取值需覆盖合法的「重入」来源(如 review_fail→review.passed 再次评审),已在上面契约里预留。

## Open Questions

## 1. 必问问题(阻塞 spec)

1. **死代码处置方式** — `state-machine.ts` 的 `LEVEL_TRANSITIONS`/`canTransition`/`getValidTransitions`/`Transition` 零消费。三选一:
   - (A) 删除,只留运行时一套真相;
   - (B) 保留并标 `@deprecated` + 注释指向 transitions.ts;
   - (C) 反向接线,让 transitionWorkflow 实际查 LEVEL_TRANSITIONS(成本最高,等于重写 FSM)。
2. **本次范围是否含「level 在运行时被忽略」** — L0/L3 当前走同一门禁表。要不要在本任务一并处理(让 quick/L0 跳过 check/review),还是只做 gate 前置 + 死代码,把 level 分流拆成独立 backlog?

## 2. 可延后问题(不阻塞 MVP)

- `guard` 字段纯装饰(从不求值)— 随死代码处置一起决定即可。
- 不可达的 phase/gate 映射(`reviewing/none`、`PHASE_GATE_TO_STATE.journaling`)清理 — 低优先,可延后。
- README 四级流转图与运行时不符 — 文档对齐,可延后到清理任务。

## 3. 需要用户 / 业务确认的假设

- 假设「gate 前置」是真实漏洞而非有意放宽:命令层(review.ts)目前确实自觉重判,FSM 层补强是纵深防御,不改变正常 happy path 行为。
- 假设 `fallbackState()` 的 `level:1` 是历史遗留,可顺手改为 0 或 2(L1 已 deprecated)。

## 4. 需要实验验证的问题

- requiredGate 收紧后,跑一遍现有 45 个测试 + 一次真实 dogfood 生命周期(本仓自身),确认没有合法路径被误拒。
