## 执行计划

### S1: 梳理 write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致
- [x] S1: 梳理 write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致
- **描述**: 根据 spec 明确 FR-1: write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致 的实现边界和验收口径。
- **验收条件**: AC-1: A: write-plan 在 phase=executing/checking 时不得回退到 planning；仅更新 plan.md/plan.json，保留当前 phase。回归: executing 阶段跑 write-plan，确认 phase 不变。
- **依赖**: 无

### S2: 实现 write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致
- [x] S2: 实现 write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致
- **描述**: 在现有架构内完成 FR-1: write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致 的代码与文档更新。
- **验收条件**: FR-1 write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: A: write-plan 在 phase=executing/checking 时不得回退到 planning；仅更新 plan.md/plan.json，保留当前 phase。回归: executing 阶段跑 write-plan，确认 phase 不变。；AC-2: A 备选: 提供 `docpath write-plan --no-transition` 仅写文件不动状态机。；AC-3: B1/B2: 修 A 后验证 sha256 与 current/canonical 漂移告警消失；额外建议 check 检测到 sha256 漂移时给出 `--fix-drift` 重算 plan.json 的修复提示。；AC-4: B3: 确认 step done / write-plan 同步写 breadcrumb，消除 plan/breadcrumb 漂移。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-251 与任务 T-20260706-write-plan-planning-plan-md-plan-json 建立双向关联
- **验收条件**: AC-1: A: write-plan 在 phase=executing/checking 时不得回退到 planning；仅更新 plan.md/plan.json，保留当前 phase。回归: executing 阶段跑 write-plan，确认 phase 不变。；AC-2: A 备选: 提供 `docpath write-plan --no-transition` 仅写文件不动状态机。；AC-3: B1/B2: 修 A 后验证 sha256 与 current/canonical 漂移告警消失；额外建议 check 检测到 sha256 漂移时给出 `--fix-drift` 重算 plan.json 的修复提示。；AC-4: B3: 确认 step done / write-plan 同步写 breadcrumb，消除 plan/breadcrumb 漂移。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-251 与任务 T-20260706-write-plan-planning-plan-md-plan-json 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
