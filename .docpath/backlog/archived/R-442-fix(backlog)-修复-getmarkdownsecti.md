---
id: R-442
title: "fix(backlog): 修复 getMarkdownSection 解析被三级子标题过早截断及 AC 换行断裂缺陷"
kind: fix
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-fix-backlog-getmarkdownsection-ac/spec.md
  decision_brief: |-
    - 当前问题: 实战 R-099 发现 backlog markdown 解析器存在两处缺陷：
    - 目标: fix(backlog): 修复 getMarkdownSection 解析被三级子标题过早截断及 AC 换行断裂缺陷
    - 背景: 来自 backlog R-442
    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A
    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
    - 成本: 中等，按 plan 拆分后逐步验证
    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260929-fix-backlog-getmarkdownsection-ac
  spec: tasks/T-20260929-fix-backlog-getmarkdownsection-ac/spec.md
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
