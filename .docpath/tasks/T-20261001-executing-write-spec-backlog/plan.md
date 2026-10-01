## 执行计划

### S1: 实现并验证 FR-1 修复 executing 路由去自环
- [x] S1: 实现并验证 FR-1 修复 executing 路由去自环
- **描述**: 落地 FR-1: 修复 executing 路由去自环，并完成模块定向自验。
- **验收条件**: AC-1: 修复 executing 路由去自环 满足功能要求并通过测试
- **依赖**: 无

### S2: 实现并验证 FR-2 write-spec 支持 Backlog 标题自愈
- [x] S2: 实现并验证 FR-2 write-spec 支持 Backlog 标题自愈
- **描述**: 落地 FR-2: write-spec 支持 Backlog 标题自愈，并完成模块定向自验。
- **验收条件**: AC-2: write-spec 支持 Backlog 标题自愈 满足功能要求并通过测试；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-468 与任务 T-20261001-executing-write-spec-backlog 建立双向关联
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
