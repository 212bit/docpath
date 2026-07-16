## 执行计划

### S1: 梳理 `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。
- [x] S1: 梳理 `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。
- **描述**: 根据 spec 明确 FR-1: `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。 的实现边界和验收口径。
- **验收条件**: AC-1: 多需求混合工作树时，`changes --agent` 输出当前 task canonical evidence 与 outside-selected-task 文件分组，并提示 outside 文件可能不属于当前 task。
- **依赖**: 无

### S2: 实现 `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。
- [x] S2: 实现 `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。
- **描述**: 在现有架构内完成 FR-1: `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。 的代码与文档更新。
- **验收条件**: FR-1 `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `docpath changes --agent` 应把其他 task canonical evidence、backlog 落库、共享文件、普通 source/test/doc 改动列为 outside-selected-task 或等价字段，并明确标注这些文件可能不属于当前 task。
- [x] S3: 实现 FR-2 `docpath changes --agent` 应把其他 task canonical evidence、backlog 落库、共享文件、普通 source/test/doc 改动列为 outside-selected-task 或等价字段，并明确标注这些文件可能不属于当前 task。
- **描述**: 在现有架构内完成 FR-2: `docpath changes --agent` 应把其他 task canonical evidence、backlog 落库、共享文件、普通 source/test/doc 改动列为 outside-selected-task 或等价字段，并明确标注这些文件可能不属于当前 task。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `docpath changes --agent --task <task_id>` 支持为非当前 task 生成 closeout 视图和 commit 建议；能从 canonical task spec/json 中解析 task title 时使用真实标题，解析不到时回退 task id。
- [x] S4: 实现 FR-3 `docpath changes --agent --task <task_id>` 支持为非当前 task 生成 closeout 视图和 commit 建议；能从 canonical task spec/json 中解析 task title 时使用真实标题，解析不到时回退 task id。
- **描述**: 在现有架构内完成 FR-3: `docpath changes --agent --task <task_id>` 支持为非当前 task 生成 closeout 视图和 commit 建议；能从 canonical task spec/json 中解析 task title 时使用真实标题，解析不到时回退 task id。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 `docpath changes --agent --scope <file-list>` 支持基于显式文件集生成 closeout 视图和 commit 建议，避免把未选中文件混入 staged/recommended guidance。
- [x] S5: 实现 FR-4 `docpath changes --agent --scope <file-list>` 支持基于显式文件集生成 closeout 视图和 commit 建议，避免把未选中文件混入 staged/recommended guidance。
- **描述**: 在现有架构内完成 FR-4: `docpath changes --agent --scope <file-list>` 支持基于显式文件集生成 closeout 视图和 commit 建议，避免把未选中文件混入 staged/recommended guidance。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 新增输出必须保持 append-only 兼容：现有 `ready_to_commit`、`groups`、`blocking_reasons`、`recommended_stage_command`、`suggested_commit_message` 语义不破坏。
- [x] S6: 实现 FR-5 新增输出必须保持 append-only 兼容：现有 `ready_to_commit`、`groups`、`blocking_reasons`、`recommended_stage_command`、`suggested_commit_message` 语义不破坏。
- **描述**: 在现有架构内完成 FR-5: 新增输出必须保持 append-only 兼容：现有 `ready_to_commit`、`groups`、`blocking_reasons`、`recommended_stage_command`、`suggested_commit_message` 语义不破坏。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 `changes` 人类输出和 agent YAML 输出都应暴露选定范围/归组摘要；JSON 输出应包含同等结构化字段。
- [x] S7: 实现 FR-6 `changes` 人类输出和 agent YAML 输出都应暴露选定范围/归组摘要；JSON 输出应包含同等结构化字段。
- **描述**: 在现有架构内完成 FR-6: `changes` 人类输出和 agent YAML 输出都应暴露选定范围/归组摘要；JSON 输出应包含同等结构化字段。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 验证验收标准
- [x] S8: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 多需求混合工作树时，`changes --agent` 输出当前 task canonical evidence 与 outside-selected-task 文件分组，并提示 outside 文件可能不属于当前 task。；AC-2: `changes --agent --task <id>` 可针对非当前 task 输出 selected task context 和 commit message 建议。；AC-3: `changes --agent --scope <file>` 只针对显式 scope 文件生成归组/建议，未选中文件不会进入 recommended stage guidance。；AC-4: 单 task 常规 closeout 的现有字段和 readiness/blocking 语义保持兼容。；AC-5: human、agent YAML、JSON 输出均包含 task-aware 归组或 selection 摘要。；AC-6: 覆盖 R-266/R-260 类似混合工作树回归场景。；AC-7: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
- **验收条件**: AC-1: 多需求混合工作树时，`changes --agent` 输出当前 task canonical evidence 与 outside-selected-task 文件分组，并提示 outside 文件可能不属于当前 task。；AC-2: `changes --agent --task <id>` 可针对非当前 task 输出 selected task context 和 commit message 建议。；AC-3: `changes --agent --scope <file>` 只针对显式 scope 文件生成归组/建议，未选中文件不会进入 recommended stage guidance。；AC-4: 单 task 常规 closeout 的现有字段和 readiness/blocking 语义保持兼容。；AC-5: human、agent YAML、JSON 输出均包含 task-aware 归组或 selection 摘要。；AC-6: 覆盖 R-266/R-260 类似混合工作树回归场景。；AC-7: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
- **依赖**: S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
