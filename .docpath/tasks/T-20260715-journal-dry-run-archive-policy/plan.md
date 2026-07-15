## 执行计划

### S1: 梳理 journal --dry-run 归档预览文字与默认 archive policy 不符
- [x] S1: 梳理 journal --dry-run 归档预览文字与默认 archive policy 不符
- **描述**: 根据 spec 明确 FR-1: journal --dry-run 归档预览文字与默认 archive policy 不符 的实现边界和验收口径。
- **验收条件**: AC-1: `journal --dry-run` 输出显式标注当前 archive policy（默认 skip），
- **依赖**: 无

### S2: 实现 journal --dry-run 归档预览文字与默认 archive policy 不符
- [x] S2: 实现 journal --dry-run 归档预览文字与默认 archive policy 不符
- **描述**: 在现有架构内完成 FR-1: journal --dry-run 归档预览文字与默认 archive policy 不符 的代码与文档更新。
- **验收条件**: FR-1 journal --dry-run 归档预览文字与默认 archive policy 不符 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `journal --dry-run` 输出显式标注当前 archive policy（默认 skip），；AC-2: 例如: `archive policy: skip（默认，不实际归档；canonical evidence 保留）`。；AC-3: 仅当显式传 `--optional-archive=always` 时，dry-run 输出"将归档: ... → ..."；AC-4: 才表述"实际将发生"的归档动作。；AC-5: 回归: 默认 dry-run 文字不再让 agent 误以为"跑 journal 就会物理归档"，；AC-6: 避免为确认行为而读源码。；AC-7: 生成的 spec 可直接进入 `docpath plan`；AC-8: backlog 条目 R-261 与任务 T-20260715-journal-dry-run-archive-policy 建立双向关联
- **验收条件**: AC-1: `journal --dry-run` 输出显式标注当前 archive policy（默认 skip），；AC-2: 例如: `archive policy: skip（默认，不实际归档；canonical evidence 保留）`。；AC-3: 仅当显式传 `--optional-archive=always` 时，dry-run 输出"将归档: ... → ..."；AC-4: 才表述"实际将发生"的归档动作。；AC-5: 回归: 默认 dry-run 文字不再让 agent 误以为"跑 journal 就会物理归档"，；AC-6: 避免为确认行为而读源码。；AC-7: 生成的 spec 可直接进入 `docpath plan`；AC-8: backlog 条目 R-261 与任务 T-20260715-journal-dry-run-archive-policy 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
