## 执行计划

### S1: 梳理 backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致
- [x] S1: 梳理 backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致
- **描述**: 根据 spec 明确 FR-1: backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致 的实现边界和验收口径。
- **验收条件**: AC-1: backlog edit --acceptance/--background 只更新对应的 section，不重置另一个 section 为 placeholder。 * promote 成熟度检查失败信息精确指出是 '背景' 章节还是 '验收' 章节有 placeholder。 * 失败时建议使用 --body-file 全量重写正文。 * 补充 unit tests 验证上述功能。
- **依赖**: 无

### S2: 实现 backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致
- [x] S2: 实现 backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致
- **描述**: 在现有架构内完成 FR-1: backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致 的代码与文档更新。
- **验收条件**: FR-1 backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: backlog edit --acceptance/--background 只更新对应的 section，不重置另一个 section 为 placeholder。 * promote 成熟度检查失败信息精确指出是 '背景' 章节还是 '验收' 章节有 placeholder。 * 失败时建议使用 --body-file 全量重写正文。 * 补充 unit tests 验证上述功能。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-282 与任务 T-20260717-backlog-edit-acceptance-background-promo 建立双向关联
- **验收条件**: AC-1: backlog edit --acceptance/--background 只更新对应的 section，不重置另一个 section 为 placeholder。 * promote 成熟度检查失败信息精确指出是 '背景' 章节还是 '验收' 章节有 placeholder。 * 失败时建议使用 --body-file 全量重写正文。 * 补充 unit tests 验证上述功能。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-282 与任务 T-20260717-backlog-edit-acceptance-background-promo 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
