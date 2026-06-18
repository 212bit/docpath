## 执行计划

### S1: 设计操作层命令架构与命令契约
- **描述**: 分析现有的 `go`, `agent`, `check`, `review` 等底层命令，设计新的操作层命令结构。确定命令注册、参数解析、状态推断、审计输出的通用架构。定义 `start`, `step`, `done` 三个命令族的契约和fail-loud边界。
- **验收条件**: 
  - 命令架构设计文档已完成，包含命令注册模式、状态推断逻辑、审计输出格式
  - 命令契约明确：何时推断current step、何时要求显式参数、何时fail-loud
  - 与现有 `go`/`agent` 命令的调用关系清晰
- **依赖**: 无

### S2: 实现 `docpath start <step>` 命令
- **描述**: 实现 `docpath start S1` 作为语义化的步骤启动命令。包装现有的 `agent enter` + `go --step` 逻辑，添加preflight检查（task identity, plan存在性, step合法性），输出auditable状态转换信息。
- **验收条件**: 
  - `docpath start S1` 能正确启动计划中的步骤
  - 命令输出明确显示 resolved task_id, step_id, 和底层lifecycle effect
  - fail-loud when task未绑定、step不存在、或step已完成
  - AC-1: `docpath start S1` starts step S1 through existing lifecycle gates and records an auditable in-progress transition
- **依赖**: S1

### S3: 实现 `docpath step` 子命令族（done/blocked/skipped）
- **描述**: 实现 `docpath step done`, `docpath step blocked`, `docpath step skipped`。支持显式指定step或推断current step（仅当unambiguous时）。调用现有的 `agent step` 底层命令，保持breadcrumb和plan checklist同步。
- **验收条件**: 
  - `docpath step done` 在current step唯一确定时自动推断，否则要求显式参数
  - `docpath step blocked` 和 `docpath step skipped` 正确更新状态
  - 命令输出显示resolved step和status
  - AC-2: `docpath step done` resolves the active step when unambiguous and records the same durable state as the existing low-level command
  - AC-3: `docpath step blocked` and `docpath step skipped` update breadcrumb and plan checklist consistently
- **依赖**: S1

### S4: 实现 `docpath done` 任务完成命令
- **描述**: 实现 `docpath done` 作为任务完成的短命令，保留现有 `agent done` 的check/review/journal门禁序列。不弱化任何gate，只是提供更短的入口。
- **验收条件**: 
  - `docpath done` 按序执行 check, review, journal
  - 与 `agent done` 行为完全一致
  - AC-4: `docpath done` preserves the existing `agent done` gate order
- **依赖**: S1

### S5: 实现恢复命令（resume/retry/unblock）
- **描述**: 实现 `docpath resume <step>`, `docpath retry <step>`, `docpath unblock <step>` 作为标准化的错误恢复路径。这些命令应encode recovery intent到breadcrumb中，但底层仍复用现有的state transition primitives。
- **验收条件**: 
  - 恢复命令能从blocked/failed步骤恢复执行
  - breadcrumb中可见recovery intent
  - 不丢失历史记录
  - AC-5: Recovery commands provide a documented path from blocked/failed steps back to execution without losing breadcrumb history
- **依赖**: S2, S3

### S6: 更新 `next --agent` 推荐逻辑
- **描述**: 修改 `next --agent` 的recommendation logic，在支持的workflow routes（in-progress, blocked, pending-done）中优先推荐新的操作层命令。当状态ambiguous时保持conservative，推荐底层命令或require clarification。
- **验收条件**: 
  - `next --agent` 在常见场景推荐 `start`, `step done`, `done` 等新命令
  - ambiguous状态下保持conservative
  - AC-6: `next --agent` recommends short semantic commands for supported routes and remains conservative when state is ambiguous
- **依赖**: S2, S3, S4, S5

### S7: 添加命令元数据和帮助文档
- **描述**: 更新CLI命令注册，将新命令分类为core workflow commands。编写命令帮助文本，说明用途、参数、与底层命令的关系。更新user-facing和agent-facing文档，使新命令成为推荐主路径。
- **验收条件**: 
  - `docpath help` 中新命令分类正确
  - 每个命令有清晰的帮助文本
  - NFR-5: CLI command metadata/help should classify the new commands as core workflow commands
  - FR-7: Update user-facing and agent-facing docs
- **依赖**: S2, S3, S4, S5

### S8: 编写focused regression tests
- **描述**: 为新命令编写测试，覆盖：命令别名、current-step推断（ambiguous vs unambiguous）、recovery命令语义、next-route推荐、fail-loud分支。确保现有的 `go`, `agent`, session leases, plan sync, check/review tests继续通过。
- **验收条件**: 
  - 新命令的核心路径有测试覆盖
  - ambiguous状态的fail-loud行为有测试
  - 现有测试全部通过
  - FR-6: Add focused regression tests
  - NFR-4: Existing tests continue to pass
- **依赖**: S2, S3, S4, S5, S6

### S9: 完整验证与文档final review
- **描述**: 运行完整的test suite，验证所有验收标准（AC-1到AC-8）。Review所有文档更新，确保新命令成为推荐路径同时保留底层命令的文档。确认兼容性（FR-5, AC-7）。
- **验收条件**: 
  - 所有AC条件通过
  - 所有NFR满足
  - FR-5和AC-7: Existing low-level commands remain callable and compatible
  - AC-8: Focused tests and full validation pass
- **依赖**: S7, S8

## Checklist
- [x] S1: 设计操作层命令架构与命令契约
- [x] S2: 实现 `docpath start <step>` 命令
- [x] S3: 实现 `docpath step` 子命令族（done/blocked/skipped）
- [x] S4: 实现 `docpath done` 任务完成命令
- [x] S5: 实现恢复命令（resume/retry/unblock）
- [x] S6: 更新 `next --agent` 推荐逻辑
- [x] S7: 添加命令元数据和帮助文档
- [x] S8: 编写focused regression tests
- [x] S9: 完整验证与文档final review

## 依赖关系图
```
S1 → S2 → S5 → S6 → S8 → S9
  → S3 ↗      ↗    ↗
  → S4 --------    ↗
                  ↗
S2,S3,S4,S5 → S7 
```

## 实现策略说明

1. **架构优先**: S1确保所有命令遵循统一的设计模式
2. **增量实现**: S2-S5各自实现一个命令族，相互独立可并行
3. **集成验证**: S6-S9确保整体一致性和完整性
4. **兼容性保证**: 所有步骤不修改现有底层命令，只添加新的语义层
