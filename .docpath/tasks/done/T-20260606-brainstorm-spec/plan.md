## 执行计划

### S1: 梳理 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出
- [x] S1: 梳理 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出
- **描述**: 根据 spec 明确 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出 的实现边界和验收口径。
- **验收条件**: `brainstorm --input "做一个导出功能" --dry-run` 输出澄清问题、默认假设和 `## 1. 背景与动机` 等 spec 章节
- **依赖**: 无

### S2: 实现 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出
- [x] S2: 实现 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出
- **描述**: 在现有架构内完成 `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出 的代码与文档更新。
- **验收条件**: `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
