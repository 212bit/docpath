## 执行计划

### S1: 梳理 多项目总览
- [x] S1: 梳理 多项目总览
- **描述**: 根据 spec 明确 FR-1: 多项目总览 的实现边界和验收口径。
- **验收条件**: AC-1: `docpath dashboard` 启动后，多项目总览展示项目数、活跃任务数、阻塞项目数、最近失败 gate、registry health 和 install health 摘要。
- **依赖**: 无

### S2: 实现 多项目总览
- [x] S2: 实现 多项目总览
- **描述**: 在现有架构内完成 FR-1: 多项目总览 的代码与文档更新。
- **验收条件**: FR-1 多项目总览 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 项目切换与单项目钻取
- [x] S3: 实现 FR-2 项目切换与单项目钻取
- **描述**: 在现有架构内完成 FR-2: 项目切换与单项目钻取。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 当前路线与健康状态展示
- [x] S4: 实现 FR-3 当前路线与健康状态展示
- **描述**: 在现有架构内完成 FR-3: 当前路线与健康状态展示。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 Backlog 体验升级
- [x] S5: 实现 FR-4 Backlog 体验升级
- **描述**: 在现有架构内完成 FR-4: Backlog 体验升级。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 Tasks 体验升级
- [x] S6: 实现 FR-5 Tasks 体验升级
- **描述**: 在现有架构内完成 FR-5: Tasks 体验升级。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 Messages / Events 视图
- [x] S7: 实现 FR-6 Messages / Events 视图
- **描述**: 在现有架构内完成 FR-6: Messages / Events 视图。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 实现 FR-7 UI 状态与响应式
- [x] S8: 实现 FR-7 UI 状态与响应式
- **描述**: 在现有架构内完成 FR-7: UI 状态与响应式。
- **验收条件**: FR-7 已实现，并保持现有工作流兼容。
- **依赖**: S7

### S9: 实现 FR-8 只读 API 契约
- [x] S9: 实现 FR-8 只读 API 契约
- **描述**: 在现有架构内完成 FR-8: 只读 API 契约。
- **验收条件**: FR-8 已实现，并保持现有工作流兼容。
- **依赖**: S8

### S10: 实现 FR-9 测试与构建
- [x] S10: 实现 FR-9 测试与构建
- **描述**: 在现有架构内完成 FR-9: 测试与构建。
- **验收条件**: FR-9 已实现，并保持现有工作流兼容。
- **依赖**: S9

### S11: 验证验收标准
- [x] S11: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `docpath dashboard` 启动后，多项目总览展示项目数、活跃任务数、阻塞项目数、最近失败 gate、registry health 和 install health 摘要。；AC-2: 当前启动 cwd 未注册时仍作为 local project 可见；已注册项目按 `last_seen_at` / name 排序；stale/unavailable/unknown schema 项目有明确状态。；AC-3: 项目切换后，Dashboard/Backlog/Tasks/Gates/Events 读取所选项目数据；unknown root 返回错误且不读取任意路径。；AC-4: 单项目首页展示 phase、gate、current step、task、next action、recommended command、gate policy、install health 和最近 gate 状态。；AC-5: Backlog 页面支持项目维度、搜索、状态/优先级/readiness 筛选、列表和详情摘要。；AC-6: Tasks 页面支持跨项目分组和单项目任务详情，展示当前任务、步骤状态、canonical/current 状态和 closeout 信号。；AC-7: Events/消息视图展示所选项目近期事件摘要，并对读取数量设上限；跨项目只展示摘要。；AC-8: UI 覆盖 loading、empty、error、partial data、unknown/deleted project、permission/read error 和 responsive 状态。；AC-9: API 保持只读，拒绝非 GET/HEAD 方法，不暴露命令执行 endpoint。；AC-10: UI brief、design preview、design approval 已写入当前任务；实现后完成 visual acceptance。；AC-11: `pnpm run build:test`、`pnpm run build:dashboard`、`pnpm run typecheck`、相关 dashboard tests 和 `docpath check` 通过。
- **验收条件**: AC-1: `docpath dashboard` 启动后，多项目总览展示项目数、活跃任务数、阻塞项目数、最近失败 gate、registry health 和 install health 摘要。；AC-2: 当前启动 cwd 未注册时仍作为 local project 可见；已注册项目按 `last_seen_at` / name 排序；stale/unavailable/unknown schema 项目有明确状态。；AC-3: 项目切换后，Dashboard/Backlog/Tasks/Gates/Events 读取所选项目数据；unknown root 返回错误且不读取任意路径。；AC-4: 单项目首页展示 phase、gate、current step、task、next action、recommended command、gate policy、install health 和最近 gate 状态。；AC-5: Backlog 页面支持项目维度、搜索、状态/优先级/readiness 筛选、列表和详情摘要。；AC-6: Tasks 页面支持跨项目分组和单项目任务详情，展示当前任务、步骤状态、canonical/current 状态和 closeout 信号。；AC-7: Events/消息视图展示所选项目近期事件摘要，并对读取数量设上限；跨项目只展示摘要。；AC-8: UI 覆盖 loading、empty、error、partial data、unknown/deleted project、permission/read error 和 responsive 状态。；AC-9: API 保持只读，拒绝非 GET/HEAD 方法，不暴露命令执行 endpoint。；AC-10: UI brief、design preview、design approval 已写入当前任务；实现后完成 visual acceptance。；AC-11: `pnpm run build:test`、`pnpm run build:dashboard`、`pnpm run typecheck`、相关 dashboard tests 和 `docpath check` 通过。
- **依赖**: S10

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8
- [x] S9
- [x] S10
- [ ] S11

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11
