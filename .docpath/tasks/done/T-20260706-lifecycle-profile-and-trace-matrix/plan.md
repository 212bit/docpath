## 执行计划

### S1: 梳理 Lifecycle profile and trace matrix
- [x] S1: 梳理 Lifecycle profile and trace matrix
- **描述**: 根据 spec 明确 FR-1: Lifecycle profile and trace matrix 的实现边界和验收口径。
- **验收条件**: AC-1: docpath deliverables init/status/generate/check supports lifecycle profiles while preserving legacy deliverables list/render/check behavior. docpath trace matrix status/generate/check works without affecting trace show/session/health/anomaly. Lifecycle config is stored in .docpath/lifecycle.yaml and registry in .docpath/lifecycle-registry.json. Regulated profile sources are non-interactive optional declarations with warnings rather than default hard failures. Build and targeted command checks pass.
- **依赖**: 无

### S2: 实现 Lifecycle profile and trace matrix
- [x] S2: 实现 Lifecycle profile and trace matrix
- **描述**: 在现有架构内完成 FR-1: Lifecycle profile and trace matrix 的代码与文档更新。
- **验收条件**: FR-1 Lifecycle profile and trace matrix 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: docpath deliverables init/status/generate/check supports lifecycle profiles while preserving legacy deliverables list/render/check behavior. docpath trace matrix status/generate/check works without affecting trace show/session/health/anomaly. Lifecycle config is stored in .docpath/lifecycle.yaml and registry in .docpath/lifecycle-registry.json. Regulated profile sources are non-interactive optional declarations with warnings rather than default hard failures. Build and targeted command checks pass.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-248 与任务 T-20260706-lifecycle-profile-and-trace-matrix 建立双向关联
- **验收条件**: AC-1: docpath deliverables init/status/generate/check supports lifecycle profiles while preserving legacy deliverables list/render/check behavior. docpath trace matrix status/generate/check works without affecting trace show/session/health/anomaly. Lifecycle config is stored in .docpath/lifecycle.yaml and registry in .docpath/lifecycle-registry.json. Regulated profile sources are non-interactive optional declarations with warnings rather than default hard failures. Build and targeted command checks pass.；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-248 与任务 T-20260706-lifecycle-profile-and-trace-matrix 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
