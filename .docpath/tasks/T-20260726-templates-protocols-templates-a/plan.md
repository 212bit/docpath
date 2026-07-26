## 执行计划

### S1: 梳理 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
- [x] S1: 梳理 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
- **描述**: 根据 spec 明确 FR-1: 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛) 的实现边界和验收口径。
- **验收条件**: AC-1: 手写层唯一（templates/protocols/ 4 flavor 参数化），templates 根层协议文件删除+防复辟断言。
- **依赖**: 无

### S2: 实现 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
- [x] S2: 实现 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
- **描述**: 在现有架构内完成 FR-1: 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛) 的代码与文档更新。
- **验收条件**: FR-1 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 手写层唯一（templates/protocols/ 4 flavor 参数化），templates 根层协议文件删除+防复辟断言。；AC-2: install 各 target 资产等价迁移（AGENTS 写死名修复），install/doctor 测试全绿。；AC-3: protocols/OPENCODE 补齐 worktree 章节，R-290 修正在 4 份源保持。；AC-4: init 与 install 同源；全量套件绿。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-297 与任务 T-20260726-templates-protocols-templates-a 建立双向关联
- **验收条件**: AC-1: 手写层唯一（templates/protocols/ 4 flavor 参数化），templates 根层协议文件删除+防复辟断言。；AC-2: install 各 target 资产等价迁移（AGENTS 写死名修复），install/doctor 测试全绿。；AC-3: protocols/OPENCODE 补齐 worktree 章节，R-290 修正在 4 份源保持。；AC-4: init 与 install 同源；全量套件绿。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-297 与任务 T-20260726-templates-protocols-templates-a 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
