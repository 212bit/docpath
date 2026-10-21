## 执行计划

### S1: 实现并验证 check 缓存键纳入工具链指纹：Node 版本变化必须使绿色证据失效
- [x] S1: 实现并验证 check 缓存键纳入工具链指纹：Node 版本变化必须使绿色证据失效
- **描述**: 完成 FR-1: check 缓存键纳入工具链指纹：Node 版本变化必须使绿色证据失效，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: code_scope_digest 与 category_digest 计算时混入工具链指纹（node 版本|platform|arch）；last-check.json 记录 toolchain 字段；指纹变化时缓存必然 miss 并重跑；指纹不变时缓存仍命中（不倒退性能）；单测覆盖同指纹命中/异指纹失效/证据字段落盘。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-502 与任务 T-20261021-check-node 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
