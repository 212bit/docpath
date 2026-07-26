## 执行计划

### S1: 实现并验证 backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)
- [x] S1: 实现并验证 backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)
- **描述**: 完成 FR-1: backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 仅 backlog 簿记脏文件时 quick/promote/agent enter/go 全部放行；混有业务脏文件仍拦。；AC-2: 既有 dirty-guard 语义测试全绿 + 新增簿记放行/混合拦截两用例。；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-313 与任务 T-20260726-backlog-accept-edit-capture-dirty-guard- 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
