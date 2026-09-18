## 执行计划

### S1: 实现并验证 Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内
- [x] S1: 实现并验证 Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内
- **描述**: 完成 FR-1: Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: next --agent 输出精简到核心路由字段（state, next_action, recommended_command, step_id），token 消耗减少 60% 以上。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-339 与任务 T-20260912-ultra-compact-agent-200-token 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
