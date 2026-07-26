## 执行计划

### S1: 梳理 config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源
- [x] S1: 梳理 config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源
- **描述**: 根据 spec 明确 FR-1: config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源 的实现边界和验收口径。
- **验收条件**: AC-1: yaml 与 json 并存时，顶层同名字段 yaml 胜；json 独有字段仍可见；yaml 独有字段（init 写入类）经 readDocPathConfig 可见（S5 事故类根除）。
- **依赖**: 无

### S2: 实现 config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源
- [x] S2: 实现 config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源
- **描述**: 在现有架构内完成 FR-1: config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源 的代码与文档更新。
- **验收条件**: FR-1 config 读取合一: readDocPathConfig 统一 yaml 优先+json 回退, 根除按字段选真源 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: yaml 与 json 并存时，顶层同名字段 yaml 胜；json 独有字段仍可见；yaml 独有字段（init 写入类）经 readDocPathConfig 可见（S5 事故类根除）。；AC-2: readDeclaredDocumentScanPaths 行为不变（既有测试全绿），实现改走统一出口、无字段级特判。；AC-3: 仅 config.json 存在（历史工作区）行为完全不变；review_skill_gate/artifacts 既有 fixture 测试全绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-294 与任务 T-20260726-config-readdocpathconfig-yaml-json 建立双向关联
- **验收条件**: AC-1: yaml 与 json 并存时，顶层同名字段 yaml 胜；json 独有字段仍可见；yaml 独有字段（init 写入类）经 readDocPathConfig 可见（S5 事故类根除）。；AC-2: readDeclaredDocumentScanPaths 行为不变（既有测试全绿），实现改走统一出口、无字段级特判。；AC-3: 仅 config.json 存在（历史工作区）行为完全不变；review_skill_gate/artifacts 既有 fixture 测试全绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-294 与任务 T-20260726-config-readdocpathconfig-yaml-json 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
