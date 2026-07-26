## 执行计划

### S1: 梳理 FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
- [x] S1: 梳理 FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
- **描述**: 根据 spec 明确 FR-1: FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口) 的实现边界和验收口径。
- **验收条件**: AC-1: completed 态直发 check.passed/check.failed/review.failed 均被 FSM 拒绝（fail-loud 含建议命令）。
- **依赖**: 无

### S2: 实现 FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
- [x] S2: 实现 FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
- **描述**: 在现有架构内完成 FR-1: FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口) 的代码与文档更新。
- **验收条件**: FR-1 FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: completed 态直发 check.passed/check.failed/review.failed 均被 FSM 拒绝（fail-loud 含建议命令）。；AC-2: docpath task reopen 将 completed 任务转入 executing 并记录 breadcrumb；重开后 check/review/journal 全流程可走通。；AC-3: task.created（新任务）与 journal.archived（重归档）的 completed 来源行为不变；全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-298 与任务 T-20260726-fsm-completed-task-reopen-r-279-r-291-fs 建立双向关联
- **验收条件**: AC-1: completed 态直发 check.passed/check.failed/review.failed 均被 FSM 拒绝（fail-loud 含建议命令）。；AC-2: docpath task reopen 将 completed 任务转入 executing 并记录 breadcrumb；重开后 check/review/journal 全流程可走通。；AC-3: task.created（新任务）与 journal.archived（重归档）的 completed 来源行为不变；全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-298 与任务 T-20260726-fsm-completed-task-reopen-r-279-r-291-fs 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
