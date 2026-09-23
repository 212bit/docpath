## 执行计划

### S1: 实现并验证 收口口径对齐（第一批）：清理残余三连推荐文案
- [x] S1: 实现并验证 收口口径对齐（第一批）：清理残余三连推荐文案
- **描述**: 完成 FR-1: 收口口径对齐（第一批）：清理残余三连推荐文案，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: `src/commands/worktree/query.ts` 的 `suggested_action` 不再输出三连，改为推荐 `docpath done`（并统一箭头写法）；；AC-2: `src/commands/check.ts` 通过后的下一步引导改为 `docpath done`，并保留「单独排查可运行 docpath check」的语义；；AC-3: `src/commands/check/evidence.ts` 在 `check.passed` / `check.env_exempt` 事件写入的 `currentStep` 文案改为指向 `docpath done`；；AC-4: `src/commands/task.ts` reopen 后的闭环提示改为 `docpath done`；；AC-5: `src/utils/closeout-route.ts` 文件头注释与已改实现（第 56 行已推荐 `docpath done`）一致；；AC-6: 相关既有测试更新且全量 `docpath check` 通过；改动不触及门禁合法性判定逻辑（`isWorkflowGateCommandAllowed` 等）。；AC-7: 生成的 spec 可直接进入 `docpath plan`；AC-8: backlog 条目 R-365 与任务 T-20260923-task 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
