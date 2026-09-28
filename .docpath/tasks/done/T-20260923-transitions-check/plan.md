## 执行计划

### S1: 实现并验证 transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
- [x] S1: 实现并验证 transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
- **描述**: 完成 FR-1: transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾），随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: `check.passed` / `check.env_exempt` 在**面向用户**的建议路径上输出 `docpath done`，不再输出 `docpath review`；；AC-2: FSM 报错/恢复路径（`workflowEventBlockReason`、`Illegal workflow transition`）的「建议下一步」语义不被破坏——仍给出**当前 phase/gate 下可执行**的命令，不得因改动引入死胡同；；AC-3: 消除实测现场的口径打架：`check` 通过后，正文引导与 `next_hint.recommended_command` 指向同一收口入口；；AC-4: 既有 FSM / transitions 相关测试全通过；新增断言覆盖「check_pass gate 下建议收口入口」；；AC-5: 不改变任何 `EVENT_TARGETS` / `requiredGate` 等门禁合法性判定（只动建议文案）。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-366 与任务 T-20260923-transitions-check 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
