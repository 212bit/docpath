## 执行计划

### S1: 梳理 upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick）
- [x] S1: 梳理 upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick）
- **描述**: 根据 spec 明确 FR-1: upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick） 的实现边界和验收口径。
- **验收条件**: AC-1: quick 任务升级为 standard 后，spec.md 包含 workflow_profile: standard 头部
- **依赖**: 无

### S2: 实现 upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick）
- [x] S2: 实现 upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick）
- **描述**: 在现有架构内完成 FR-1: upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick） 的代码与文档更新。
- **验收条件**: FR-1 upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick） 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 替换为 standard spec 模板，保留原 title 和需求摘要
- [x] S3: 实现 FR-2 替换为 standard spec 模板，保留原 title 和需求摘要
- **描述**: 在现有架构内完成 FR-2: 替换为 standard spec 模板，保留原 title 和需求摘要。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 输出清晰指引："spec 模板已升级至 standard 格式，请填写 Decision Brief 和验收标准"
- [x] S4: 实现 FR-3 输出清晰指引："spec 模板已升级至 standard 格式，请填写 Decision Brief 和验收标准"
- **描述**: 在现有架构内完成 FR-3: 输出清晰指引："spec 模板已升级至 standard 格式，请填写 Decision Brief 和验收标准"。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 不破坏现有 spec.json 的结构（重新 write-spec 同步）
- [x] S5: 实现 FR-4 不破坏现有 spec.json 的结构（重新 write-spec 同步）
- **描述**: 在现有架构内完成 FR-4: 不破坏现有 spec.json 的结构（重新 write-spec 同步）。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: quick 任务升级为 standard 后，spec.md 包含 workflow_profile: standard 头部；AC-2: spec.md 包含完整的 standard 章节（背景、需求、范围界定、关键决策、重大变更门禁、验收标准）；AC-3: 原 task title 保留在 spec 中；AC-4: 现有 test 全部通过
- **验收条件**: AC-1: quick 任务升级为 standard 后，spec.md 包含 workflow_profile: standard 头部；AC-2: spec.md 包含完整的 standard 章节（背景、需求、范围界定、关键决策、重大变更门禁、验收标准）；AC-3: 原 task title 保留在 spec 中；AC-4: 现有 test 全部通过
- **依赖**: S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
