## 执行计划

### S1: 实现并验证 write-spec 覆盖写告警
- [x] S1: 实现并验证 write-spec 覆盖写告警
- **描述**: 完成 FR-1: write-spec 覆盖写告警；FR-2: 非规范 Decision Brief 位置检测，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 1) 目标 spec.md 已存在且内容不同时，write-spec 打印覆盖告警（覆盖行数 / FR-AC 条目增减）并提示差异，必要时要求 --force 确认；2) 检测到 `## 6. 决策简报`/`## decision_brief` 等非规范 ADR 章节时，提示应置于 `## 4.1 重大变更门禁 > ### Decision Brief`；3) 上述两种情形各有回归测试钉住行为。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-449 与任务 T-20261003-write-spec-decision-brief 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
