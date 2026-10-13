## 执行计划

### S1: 实现并验证 FR-1 提供 `docpath-milestone-planner` Skill，规范里程碑与 Backlog 垂直切片与适度粒度原则
- [x] S1: 实现并验证 FR-1 提供 `docpath-milestone-planner` Skill，规范里程碑与 Backlog 垂直切片与适度粒度原则
- **描述**: 落地 FR-1: 提供 `docpath-milestone-planner` Skill，规范里程碑与 Backlog 垂直切片与适度粒度原则，并完成模块定向自验。
- **验收条件**: AC-1: `docpath-milestone-planner.md` 包含三层架构标准、自检清单与正反范例
- **依赖**: 无

### S2: 实现并验证 FR-2 增强 `docpath backlog groom`，支持检测同一 Milestone 下的碎片化微型 Backlog 异味并给出合并建议
- [x] S2: 实现并验证 FR-2 增强 `docpath backlog groom`，支持检测同一 Milestone 下的碎片化微型 Backlog 异味并给出合并建议
- **描述**: 落地 FR-2: 增强 `docpath backlog groom`，支持检测同一 Milestone 下的碎片化微型 Backlog 异味并给出合并建议，并完成模块定向自验。
- **验收条件**: AC-2: `docpath backlog groom` 能识别同 Milestone 下的数据层/微型技术步骤碎片并输出建议
- **依赖**: S1

### S3: 实现并验证 FR-3 新增 `docpath backlog merge` 命令行与底层引擎，支持一键将多条微型 Backlog 合并到目标 Backlog 中并自动治理关联
- [x] S3: 实现并验证 FR-3 新增 `docpath backlog merge` 命令行与底层引擎，支持一键将多条微型 Backlog 合并到目标 Backlog 中并自动治理关联
- **描述**: 落地 FR-3: 新增 `docpath backlog merge` 命令行与底层引擎，支持一键将多条微型 Backlog 合并到目标 Backlog 中并自动治理关联，并完成模块定向自验。
- **验收条件**: AC-3: `docpath backlog merge R-A R-B --target R-A` 能正确合并内容、更新 AC、归档源条目并同步 Milestone；AC-4: 单元测试覆盖率达标且全部测试通过；AC-5: 活文档 `docs/features/backlog-lifecycle.md` 完成同步更新
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
