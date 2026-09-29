## 执行计划

### S1: 实现并验证 FR-1 `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。
- [x] S1: 实现并验证 FR-1 `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。
- **描述**: 落地 FR-1: `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。，并完成模块定向自验。
- **验收条件**: AC-1: `extractFunctionalRequirements` 仅从 `## 功能需求` 或显式 FR 列表中提取需求，背景列表不参与 FR fallback（回退为单一需求 FR-1）
- **依赖**: 无

### S2: 实现并验证 FR-2 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。
- [x] S2: 实现并验证 FR-2 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。
- **描述**: 落地 FR-2: 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。，并完成模块定向自验。
- **验收条件**: AC-2: `docpath plan` 增加 `--force` 选项，强制覆盖已有 `plan.md`；AC-3: 当 `spec.json` 变更时给出提示或自动更新计划；AC-4: 补充对应的单元测试并通过质量门禁；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-443 与任务 T-20260929-feat-plan-fr-docpath-plan-force 建立双向关联
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
