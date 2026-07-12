## 执行计划

### S1: 梳理 loadAgentOutputContext() 获取 spec 摘要
- [x] S1: 梳理 loadAgentOutputContext() 获取 spec 摘要
- **描述**: 根据 spec 明确 FR-1: loadAgentOutputContext() 获取 spec 摘要 的实现边界和验收口径。
- **验收条件**: AC-1: docpath next --agent 输出包含 context_injection.spec_summary（当前有活跃 spec 时）
- **依赖**: 无

### S2: 实现 loadAgentOutputContext() 获取 spec 摘要
- [x] S2: 实现 loadAgentOutputContext() 获取 spec 摘要
- **描述**: 在现有架构内完成 FR-1: loadAgentOutputContext() 获取 spec 摘要 的代码与文档更新。
- **验收条件**: FR-1 loadAgentOutputContext() 获取 spec 摘要 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 loadAgentOutputContext() 获取最近 5 条 decisions
- [x] S3: 实现 FR-2 loadAgentOutputContext() 获取最近 5 条 decisions
- **描述**: 在现有架构内完成 FR-2: loadAgentOutputContext() 获取最近 5 条 decisions。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 agent-output YAML 包含 context_injection 区块
- [x] S4: 实现 FR-3 agent-output YAML 包含 context_injection 区块
- **描述**: 在现有架构内完成 FR-3: agent-output YAML 包含 context_injection 区块。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 spec 不存在时 spec_summary 为 null
- [x] S5: 实现 FR-4 spec 不存在时 spec_summary 为 null
- **描述**: 在现有架构内完成 FR-4: spec 不存在时 spec_summary 为 null。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 decisions.jsonl 不存在或为空时 recent_decisions 为 []
- [x] S6: 实现 FR-5 decisions.jsonl 不存在或为空时 recent_decisions 为 []
- **描述**: 在现有架构内完成 FR-5: decisions.jsonl 不存在或为空时 recent_decisions 为 []。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 不影响现有 YAML 字段，向后兼容
- [x] S7: 实现 FR-6 不影响现有 YAML 字段，向后兼容
- **描述**: 在现有架构内完成 FR-6: 不影响现有 YAML 字段，向后兼容。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 验证验收标准
- [x] S8: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: docpath next --agent 输出包含 context_injection.spec_summary（当前有活跃 spec 时）；AC-2: docpath next --agent 输出包含 context_injection.recent_decisions（有 decisions.jsonl 时）；AC-3: spec 不存在时 spec_summary 为 null；AC-4: decisions.jsonl 为空时 recent_decisions 为 []；AC-5: 现有 YAML 字段完全不变
- **验收条件**: AC-1: docpath next --agent 输出包含 context_injection.spec_summary（当前有活跃 spec 时）；AC-2: docpath next --agent 输出包含 context_injection.recent_decisions（有 decisions.jsonl 时）；AC-3: spec 不存在时 spec_summary 为 null；AC-4: decisions.jsonl 为空时 recent_decisions 为 []；AC-5: 现有 YAML 字段完全不变
- **依赖**: S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
