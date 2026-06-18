## 执行计划

### S1: 实现唯一 task_id 分配
- [x] S1: 实现唯一 task_id 分配
- **描述**: 修改 backlog promote 的 task_id 生成逻辑，检查 active 与 done 目录并追加递增后缀。
- **验收条件**: 无冲突保持原 ID，有冲突时生成不覆盖历史目录的新 ID。
- **依赖**: 无

### S2: 补测试并完成门禁
- [x] S2: 补测试并完成门禁
- **描述**: 增加 backlog promote 冲突测试，运行全量测试、check、review、journal。
- **验收条件**: 新增测试和全量测试通过，docpath check 与 review 通过。
- **依赖**: S1

## 依赖关系图
S1 → S2
