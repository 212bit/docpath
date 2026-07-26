## 执行计划

### S1: 梳理 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
- [x] S1: 梳理 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
- **描述**: 根据 spec 明确 FR-1: 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械) 的实现边界和验收口径。
- **验收条件**: AC-1: 迁移后各文件行数下降且职责单一化；无循环依赖（structured-heal→task-files 单向）。
- **依赖**: 无

### S2: 实现 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
- [x] S2: 实现 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
- **描述**: 在现有架构内完成 FR-1: 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械) 的代码与文档更新。
- **验收条件**: FR-1 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 迁移后各文件行数下降且职责单一化；无循环依赖（structured-heal→task-files 单向）。；AC-2: 全量套件绿，零行为变更；导入路径全链更新（含 dist 测试导入）。；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-304 与任务 T-20260726-task-files-formatters-context-injection 建立双向关联
- **验收条件**: AC-1: 迁移后各文件行数下降且职责单一化；无循环依赖（structured-heal→task-files 单向）。；AC-2: 全量套件绿，零行为变更；导入路径全链更新（含 dist 测试导入）。；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-304 与任务 T-20260726-task-files-formatters-context-injection 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
