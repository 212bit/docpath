## 执行计划

### S1: 实现并验证 `getMarkdownSection` 正则 `/^#{1,3}\s+\S/m` 在遇到 `###` 子标题时会误将二级章节截断，导致正文为空触发门禁误报。
- [x] S1: 实现并验证 `getMarkdownSection` 正则 `/^#{1,3}\s+\S/m` 在遇到 `###` 子标题时会误将二级章节截断，导致正文为空触发门禁误报。
- **描述**: 完成 FR-1: `getMarkdownSection` 正则 `/^#{1,3}\s+\S/m` 在遇到 `###` 子标题时会误将二级章节截断，导致正文为空触发门禁误报。；FR-2: `parseBacklogBody` 对多行带缩进换行的 AC 按行硬切导致条目断裂。，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: [ ] `getMarkdownSection` 解析 `##` 章节时正确包含 `###` 子标题内容，仅在遇到下一个 `##` 或 `#` 时截断；AC-2: [ ] `replaceMarkdownSection` 正确处理包含 `###` 子标题的章节替换；AC-3: [ ] AC 解析支持多行缩进内容合并为单条验收标准；AC-4: [ ] 补充对应的单元测试并通过质量门禁；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-442 与任务 T-20260929-fix-backlog-getmarkdownsection-ac 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
