## 执行计划

### S1: 添加 completed stale-step 回归测试
- [x] S1: 添加 completed stale-step 回归测试
- **描述**: 在 `tests/next.test.mjs` 构造 completed/review_pass + stale in-progress breadcrumb/open plan step 场景，断言 `next --agent` 不推荐 `agent step` 或 `go`，并保留 executing in-progress step 既有行为。
- **验收条件**: 测试在修复前能复现错误路由，修复后通过。
- **依赖**: 无

### S2: 修复 completed 状态路由优先级
- [x] S2: 修复 completed 状态路由优先级
- **描述**: 调整 `src/utils/agent-output/formatters.ts` 中 route 推断顺序或 active-step 过滤，让 completed 状态先走 completed closeout/next-work 分支，忽略 stale in-progress step。
- **验收条件**: completed/review_pass 不再输出 `docpath agent step --step ... --status done`；执行态 in-progress step 仍保留原推荐；相关测试、check、review 通过。
- **依赖**: S1

## Checklist
- [x] S1
- [ ] S2

## 依赖关系图
S1 → S2
