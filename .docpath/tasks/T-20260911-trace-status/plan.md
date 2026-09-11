## 执行计划

### S1: 实现并验证 仪式成本度量：trace/status 增加仪式密度、弹回率、门禁时延占比三指标
- **描述**: 完成 FR-1: 仪式成本度量：trace/status 增加仪式密度、弹回率、门禁时延占比三指标，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: trace 或 status --agent 输出单任务三指标（仪式密度/弹回率/门禁时延占比）；2. 支持跨任务聚合（按 quick/标准 档位分组的中位数统计）；3. 数据源仅用现有 breadcrumb.jsonl 与 git diff，不引入新状态文件；4. 纯只读观测，不改变任何门禁或工作流行为。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-329 与任务 T-20260911-trace-status 建立双向关联
- **依赖**: 无

## Checklist
- [ ] S1

## 依赖关系图
S1
