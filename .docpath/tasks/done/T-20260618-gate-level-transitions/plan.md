## 执行计划

### S1: 给 EVENT_TARGETS 加 requiredGate 字段并在 transitionWorkflow 强制
- **描述**: 在 `src/engine/transitions.ts` 的 `TransitionTarget` 接口加可选 `requiredGate?: GateStatus[]`;为 `review.passed`/`review.failed` 设 `['check_pass','review_pass','review_fail']`、`journal.archived` 设 `['review_pass']`。在 `transitionWorkflow` 持锁段、phase 校验之后追加 gate 前置校验,不满足时抛 fail-loud 错误(沿用「允许门禁 + 建议下一步」格式)。
- **验收条件**: checking/check_fail 下 review.passed 被拒并报清晰错误;checking/check_pass 下 review.passed 通过;未声明 requiredGate 的事件行为不变。
- **依赖**: 无

### S2: 删除 state-machine.ts 中的死转移代码
- **描述**: 删除 `LEVEL_TRANSITIONS`、`LEVEL_2_TRANSITIONS`、`canTransition`、`getValidTransitions`、`Transition` 接口及其 `guard` 字段。保留 `ComplexityLevel`、`LEVEL_NAMES`、`LEVEL_DESCRIPTIONS`(complexity.ts/escalation.ts 仍在用)及 phase/gate 归一化全部逻辑。全仓 grep 复核无残留引用。
- **验收条件**: tsc --noEmit 通过;grep 确认无 LEVEL_TRANSITIONS/canTransition/getValidTransitions 残留引用;归一化与运行时 FSM 不受影响。
- **依赖**: 无

### S3: 补充转移测试
- **描述**: 扩 `tests/transitions.test.mjs`:新增「checking/check_fail 下 review.passed 被拒」「checking/check_pass 下 review.passed 通过」「reviewing/review_fail 下 journal.archived 被拒」用例。复核 transitions/policy 测试无对已删函数的引用。
- **验收条件**: 新增用例覆盖正/负向 gate 前置;pnpm test 全绿(45+ 文件)。
- **依赖**: S1, S2

### S4: 全量校验与文档对齐
- **描述**: 跑 pnpm test + docpath check;若 README 四级流转图脚注需对齐则同步(低优先,可注记到 R-204)。清理 /tmp 临时文件。
- **验收条件**: docpath check 通过;pnpm test 全绿;无临时文件残留。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S3 → S4
S2 → S3
