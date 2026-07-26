## 执行计划

### S1: 梳理 spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
- [x] S1: 梳理 spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
- **描述**: 根据 spec 明确 FR-1: spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警 的实现边界和验收口径。
- **验收条件**: AC-1: 结构化字段写路径唯一（JSON）；MD 对应段落由渲染器幂等生成，重复渲染零 diff。
- **依赖**: 无

### S2: 实现 spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
- [x] S2: 实现 spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
- **描述**: 在现有架构内完成 FR-1: spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警 的代码与文档更新。
- **验收条件**: FR-1 spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 结构化字段写路径唯一（JSON）；MD 对应段落由渲染器幂等生成，重复渲染零 diff。；AC-2: check/review 全部 desync 检测点改为自动重渲染，不再输出「请手动运行 write-* 同步」类提示。；AC-3: 人工叙述段落在重渲染后逐字保留。；AC-4: 崩溃/中断场景（JSON 已写、MD 未写）下，下一次任意 gate 命令自动收敛；一致性回归测试覆盖。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-287 与任务 T-20260726-spec-plan-md-managed-block-desync 建立双向关联
- **验收条件**: AC-1: 结构化字段写路径唯一（JSON）；MD 对应段落由渲染器幂等生成，重复渲染零 diff。；AC-2: check/review 全部 desync 检测点改为自动重渲染，不再输出「请手动运行 write-* 同步」类提示。；AC-3: 人工叙述段落在重渲染后逐字保留。；AC-4: 崩溃/中断场景（JSON 已写、MD 未写）下，下一次任意 gate 命令自动收敛；一致性回归测试覆盖。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-287 与任务 T-20260726-spec-plan-md-managed-block-desync 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
