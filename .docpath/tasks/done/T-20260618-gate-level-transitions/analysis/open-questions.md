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
