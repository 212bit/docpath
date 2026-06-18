## 执行计划

### S1: 实现未吸收 lesson 检测
- [x] S1: 实现未吸收 lesson 检测
- **描述**: 让 next 对 lesson-candidates key 与 style/architecture lesson-meta 做差集，仅在存在未吸收候选时推荐 learn。
- **验收条件**: 已吸收候选不再触发 learn，新候选仍触发 learn。
- **依赖**: 无

### S2: 补测试并完成门禁
- [x] S2: 补测试并完成门禁
- **描述**: 增加 next 路由测试并运行测试、check、review、journal。
- **验收条件**: 新增测试和全量测试通过，docpath check 与 review 通过。
- **依赖**: S1

## 依赖关系图
S1 → S2
