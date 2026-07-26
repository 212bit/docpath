## 执行计划

### S1: 梳理 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW
- [x] S1: 梳理 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW
- **描述**: 根据 spec 明确 FR-1: 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW 的实现边界和验收口径。
- **验收条件**: AC-1: src/commands、src/hooks 下不存在对 writeCurrentState 的直接导入（grep 断言或 lint 规则固化）。
- **依赖**: 无

### S2: 实现 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW
- [x] S2: 实现 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW
- **描述**: 在现有架构内完成 FR-1: 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW 的代码与文档更新。
- **验收条件**: FR-1 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: src/commands、src/hooks 下不存在对 writeCurrentState 的直接导入（grep 断言或 lint 规则固化）。；AC-2: 8 处旁路调用点全部改走 mutateCurrentState，现有行为回归测试全绿。；AC-3: 新增并发回归测试：两个并发 mutateCurrentState 做 RMW 不发生 lost update。；AC-4: transitionWorkflow 不因锁重入死锁（现有 FSM 测试保持通过，新增嵌套场景测试）。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-286 与任务 T-20260726-mutatecurrentstate-8-rmw 建立双向关联
- **验收条件**: AC-1: src/commands、src/hooks 下不存在对 writeCurrentState 的直接导入（grep 断言或 lint 规则固化）。；AC-2: 8 处旁路调用点全部改走 mutateCurrentState，现有行为回归测试全绿。；AC-3: 新增并发回归测试：两个并发 mutateCurrentState 做 RMW 不发生 lost update。；AC-4: transitionWorkflow 不因锁重入死锁（现有 FSM 测试保持通过，新增嵌套场景测试）。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-286 与任务 T-20260726-mutatecurrentstate-8-rmw 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
