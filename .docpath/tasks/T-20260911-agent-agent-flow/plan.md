## 执行计划

### S1: 梳理 agent 辅助开发流程摩擦收口：agent_flow 配置面统一降级
- [x] S1: 梳理 agent 辅助开发流程摩擦收口：agent_flow 配置面统一降级
- **描述**: 根据 spec 明确 FR-1~FR-7 的实现边界和验收口径。
- **验收条件**: spec 已含 7 个 FR + 9 个 AC + 4.1 Decision Brief 完整
- **依赖**: 无

### S2: 实现 FR-1 + FR-6 + FR-7（配置面 + evidence 类型 + CJK 解引用）
- [x] S2: 实现 FR-1 + FR-6 + FR-7（配置面 + evidence 类型 + CJK 解引用）
- **描述**: 实现 `config.ts` agent_flow 类型、`workspace-evidence.ts` 窄 union 校验器、`git-dirty-guard.ts` CJK 路径解引用（`-c core.quotePath=false`）；同时 `major-change.ts` 的 `parseChangedPaths` 也需要同步解引用。
- **验收条件**: AC-1, AC-6, AC-7 通过
- **依赖**: S1

### S3: 实现 FR-2 + FR-3 + FR-4 + FR-5（门禁降级 + 计划压缩 + 完成度 + go 恢复）
- [x] S3: 实现 FR-2 + FR-3 + FR-4 + FR-5（门禁降级 + 计划压缩 + 完成度 + go 恢复）
- **描述**: major-change advisory 降级、plan 单步压缩、完成度 claimed-done 语义、`go --accept-dirty` 恢复旗标；每个改动需含相应 test case。
- **验收条件**: AC-2, AC-3, AC-4, AC-5 通过
- **依赖**: S2

### S4: 验证验收标准
- [x] S4: 验证验收标准
- **描述**: 跑全量 typecheck + test + docpath check + review；确认 agent_flow 配置下所有门禁如 spec 声明；确认非 agent_flow 行为不变。
- **验收条件**: AC-8 通过（typecheck/test/check 全绿）
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
