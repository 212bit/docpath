## 执行计划

### S1: 实现并验证 过滤 decisions.jsonl 中内部审计与过程流水，只下发实质架构红线
- [x] S1: 实现并验证 过滤 decisions.jsonl 中内部审计与过程流水，只下发实质架构红线
- **描述**: 完成 FR-1: 过滤 decisions.jsonl 中内部审计与过程流水，只下发实质架构红线，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: next/status 中的 active_guardrails 不再出现风险升级等流水，只输出实质架构指令，测试全部通过；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-374 与任务 T-20260923-decisions-jsonl 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
