## 执行计划

### S1: 实现并验证 在 `git-dirty-guard.ts` 中增强活跃任务判定，当 phase 为 `planning` 但当前 `state.task_id` 匹配且已存在执行事件（如 breadcrumb 中已发生过 `step.started`），或为同一任务的重规划重入时，判定为活跃任务。
- [x] S1: 实现并验证 在 `git-dirty-guard.ts` 中增强活跃任务判定，当 phase 为 `planning` 但当前 `state.task_id` 匹配且已存在执行事件（如 breadcrumb 中已发生过 `step.started`），或为同一任务的重规划重入时，判定为活跃任务。
- **描述**: 完成 FR-1: 在 `git-dirty-guard.ts` 中增强活跃任务判定，当 phase 为 `planning` 但当前 `state.task_id` 匹配且已存在执行事件（如 breadcrumb 中已发生过 `step.started`），或为同一任务的重规划重入时，判定为活跃任务。；FR-2: 处于活跃任务期内的同任务 tracked 变更（非未跟踪的新增噪音文件）自动放行，不再强制拦截要求 `--accept-dirty`。；FR-3: 补充单元测试验证重规划场景下 `docpath go` 的放行行为，并通过质量门禁。，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 同任务在执行中途重规划回到 `planning` 状态后，`docpath go --step <step>` 对本任务已跟踪修改自动放行；AC-2: 未开工的全新任务在 `planning` 状态下如果有外部 dirty 变更，仍严格拦截防污染；AC-3: 补充对应的单元测试并通过质量门禁；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-444 与任务 T-20260929-feat-guard-dirty-guard 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
