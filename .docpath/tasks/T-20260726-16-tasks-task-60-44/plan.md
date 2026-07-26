## 执行计划

### S1: 梳理 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
- [x] S1: 梳理 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
- **描述**: 根据 spec 明确 FR-1: 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44) 的实现边界和验收口径。
- **验收条件**: AC-1: 16 项命令注册/实现/元数据/模板移除，CLI 调用报未知命令；metadata 计数 60→44（含 tasks deprecated 转发 45）。
- **依赖**: 无

### S2: 实现 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
- [x] S2: 实现 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
- **描述**: 在现有架构内完成 FR-1: 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44) 的代码与文档更新。
- **验收条件**: FR-1 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 16 项命令注册/实现/元数据/模板移除，CLI 调用报未知命令；metadata 计数 60→44（含 tasks deprecated 转发 45）。；AC-2: src 内零残留死引用（grep 断言）；transitions 路由前缀清理 tdd。；AC-3: task drift/sync 子动作可用，tasks 转发+弃用提示；协议 canonical 与 root 副本同步更新。；AC-4: 全量套件绿（被删命令的测试同步移除/改写）。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-299 与任务 T-20260726-16-tasks-task-60-44 建立双向关联
- **验收条件**: AC-1: 16 项命令注册/实现/元数据/模板移除，CLI 调用报未知命令；metadata 计数 60→44（含 tasks deprecated 转发 45）。；AC-2: src 内零残留死引用（grep 断言）；transitions 路由前缀清理 tdd。；AC-3: task drift/sync 子动作可用，tasks 转发+弃用提示；协议 canonical 与 root 副本同步更新。；AC-4: 全量套件绿（被删命令的测试同步移除/改写）。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-299 与任务 T-20260726-16-tasks-task-60-44 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
