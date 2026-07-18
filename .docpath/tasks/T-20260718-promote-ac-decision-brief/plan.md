## 执行计划

### S1: 梳理 promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
- [x] S1: 梳理 promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
- **描述**: 根据 spec 明确 FR-1: promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾 的实现边界和验收口径。
- **验收条件**: AC-1: 修复 AC 行双前缀问题，如果 backlog 验收标准行中已包含 AC- 前缀则去重。 * 修复 Decision Brief 当前问题解析垃圾值问题，正确解析背景章节首行正文（排除标题本身）。 * 变更类型默认全部不勾选，防误触。 * 补充测试保障质量。
- **依赖**: 无

### S2: 实现 promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
- [x] S2: 实现 promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
- **描述**: 在现有架构内完成 FR-1: promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾 的代码与文档更新。
- **验收条件**: FR-1 promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 修复 AC 行双前缀问题，如果 backlog 验收标准行中已包含 AC- 前缀则去重。 * 修复 Decision Brief 当前问题解析垃圾值问题，正确解析背景章节首行正文（排除标题本身）。 * 变更类型默认全部不勾选，防误触。 * 补充测试保障质量。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-284 与任务 T-20260718-promote-ac-decision-brief 建立双向关联
- **验收条件**: AC-1: 修复 AC 行双前缀问题，如果 backlog 验收标准行中已包含 AC- 前缀则去重。 * 修复 Decision Brief 当前问题解析垃圾值问题，正确解析背景章节首行正文（排除标题本身）。 * 变更类型默认全部不勾选，防误触。 * 补充测试保障质量。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-284 与任务 T-20260718-promote-ac-decision-brief 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
