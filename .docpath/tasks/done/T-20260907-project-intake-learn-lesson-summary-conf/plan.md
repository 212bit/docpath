## 执行计划

### S1: 梳理 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
- [x] S1: 梳理 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
- **描述**: 根据 spec 明确 FR-1: 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属 的实现边界和验收口径。
- **验收条件**: AC-1: [ ] 每项裁决结论与依据记录于本条目的 analysis 证据中
- **依赖**: 无

### S2: 实现 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
- [x] S2: 实现 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
- **描述**: 在现有架构内完成 FR-1: 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属 的代码与文档更新。
- **验收条件**: FR-1 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: [ ] 每项裁决结论与依据记录于本条目的 analysis 证据中；AC-2: [ ] 删除项六维全链清理 + fail-loud 防复辟断言；AC-3: [ ] 保留项说明理由并写入 rules，避免下次重复评估；AC-4: [ ] 全量测试与 typecheck 通过；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-316 与任务 T-20260907-project-intake-learn-lesson-summary-conf 建立双向关联
- **验收条件**: AC-1: [ ] 每项裁决结论与依据记录于本条目的 analysis 证据中；AC-2: [ ] 删除项六维全链清理 + fail-loud 防复辟断言；AC-3: [ ] 保留项说明理由并写入 rules，避免下次重复评估；AC-4: [ ] 全量测试与 typecheck 通过；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-316 与任务 T-20260907-project-intake-learn-lesson-summary-conf 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
