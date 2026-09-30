## 执行计划

### S1: 实现并验证 FR-1 ZCode 原生 SQLite 遥测直连适配器
- [x] S1: 实现并验证 FR-1 ZCode 原生 SQLite 遥测直连适配器
- **描述**: 落地 FR-1: ZCode 原生 SQLite 遥测直连适配器，并完成模块定向自验。
- **验收条件**: AC-1: 实现 `ZCodeTelemetryAdapter` 深度适配器，支持自动探测并直连 `~/.zcode/cli/db/db.sqlite`（解析 `model_usage` 与 `turn_usage`）及 rollout JSONL
- **依赖**: 无

### S2: 实现并验证 FR-2 多轮累加 Token 真实度量
- [x] S2: 实现并验证 FR-2 多轮累加 Token 真实度量
- **描述**: 落地 FR-2: 多轮累加 Token 真实度量，并完成模块定向自验。
- **验收条件**: AC-2: 精确提取多轮累计 Token（`input_tokens`、`output_tokens`、`computed_total_tokens`、`cache_read_input_tokens` 缓存命中）与模型规格；AC-3: 在 `docpath monitor`（全局与 `--current`）中集成 ZCode 真实度量，展现缓存命中率（Cache Hit Ratio）与多轮会话真实消耗；AC-4: 完成单元测试覆盖并在全量门禁中通过验证；AC-1: ZCode 原生 SQLite 遥测直连适配器 满足功能要求并通过测试；AC-2: 多轮累加 Token 真实度量 满足功能要求并通过测试；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-453 与任务 T-20260930-zcode-sqlite-token 建立双向关联
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
