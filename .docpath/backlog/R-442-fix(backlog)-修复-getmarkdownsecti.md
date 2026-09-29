---
id: R-442
title: "fix(backlog): 修复 getMarkdownSection 解析被三级子标题过早截断及 AC 换行断裂缺陷"
kind: fix
status: proposed
priority: P1
level: 1
source: docpath backlog add
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-29
---

## 背景

实战 R-099 发现 backlog markdown 解析器存在两处缺陷：
1. `getMarkdownSection` 正则 `/^#{1,3}\s+\S/m` 在遇到 `###` 子标题时会误将二级章节截断，导致正文为空触发门禁误报。
2. `parseBacklogBody` 对多行带缩进换行的 AC 按行硬切导致条目断裂。

## 验收

- [ ] `getMarkdownSection` 解析 `##` 章节时正确包含 `###` 子标题内容，仅在遇到下一个 `##` 或 `#` 时截断
- [ ] `replaceMarkdownSection` 正确处理包含 `###` 子标题的章节替换
- [ ] AC 解析支持多行缩进内容合并为单条验收标准
- [ ] 补充对应的单元测试并通过质量门禁
