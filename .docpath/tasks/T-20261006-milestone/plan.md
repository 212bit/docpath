## 执行计划

### S1: 实现并验证 FR-1 增强 `docpath milestone decompose`，支持从正文或结构化输入中一键智能拆解并生成成形 Backlog
- [x] S1: 实现并验证 FR-1 增强 `docpath milestone decompose`，支持从正文或结构化输入中一键智能拆解并生成成形 Backlog
- **描述**: 落地 FR-1: 增强 `docpath milestone decompose`，支持从正文或结构化输入中一键智能拆解并生成成形 Backlog，并完成模块定向自验。
- **验收条件**: AC-1: `docpath milestone decompose` 能从正文或参数智能生成规范化的 Backlog 并完成双向绑定
- **依赖**: 无

### S2: 实现并验证 FR-2 增强 `docpath milestone status / track`，支持截止期健康度预测（On Track/At Risk/Overdue）与里程碑关键阻碍链分析
- [x] S2: 实现并验证 FR-2 增强 `docpath milestone status / track`，支持截止期健康度预测（On Track/At Risk/Overdue）与里程碑关键阻碍链分析
- **描述**: 落地 FR-2: 增强 `docpath milestone status / track`，支持截止期健康度预测（On Track/At Risk/Overdue）与里程碑关键阻碍链分析，并完成模块定向自验。
- **验收条件**: AC-2: `docpath milestone status / track` 能准确计算健康度（on_track/at_risk/overdue）并展示 Top Blockers
- **依赖**: S1

### S3: 实现并验证 FR-3 增强 `docpath milestone release`，自动聚合关联 Task 的 Decision Brief / ADR 至发布简报，并提供 Git Tag 联动建议
- [x] S3: 实现并验证 FR-3 增强 `docpath milestone release`，自动聚合关联 Task 的 Decision Brief / ADR 至发布简报，并提供 Git Tag 联动建议
- **描述**: 落地 FR-3: 增强 `docpath milestone release`，自动聚合关联 Task 的 Decision Brief / ADR 至发布简报，并提供 Git Tag 联动建议，并完成模块定向自验。
- **验收条件**: AC-3: `docpath milestone release` 能自动聚合 Decision Brief / ADR 并生成包含 Git Tag 建议的发布简报
- **依赖**: S2

### S4: 实现并验证 FR-4 新增 `docpath milestone edit` 属性编辑与 `docpath milestone doctor` 完整性巡检治理能力
- [x] S4: 实现并验证 FR-4 新增 `docpath milestone edit` 属性编辑与 `docpath milestone doctor` 完整性巡检治理能力
- **描述**: 落地 FR-4: 新增 `docpath milestone edit` 属性编辑与 `docpath milestone doctor` 完整性巡检治理能力，并完成模块定向自验。
- **验收条件**: AC-4: `docpath milestone edit` 与 `docpath milestone doctor` 运行正常且能诊断断链或异常条目；AC-5: 单元测试覆盖率达标，活文档 `docs/features/milestone-lifecycle.md` 完成同步更新
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
