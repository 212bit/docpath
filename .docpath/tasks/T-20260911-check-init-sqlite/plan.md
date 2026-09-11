## 执行计划

### S1: 梳理 check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
- [x] S1: 梳理 check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
- **描述**: 根据 spec 明确 FR-1: check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根） 的实现边界和验收口径。
- **验收条件**: AC-1: 1) tests/check-cache.test.mjs：digest 稳定性三态断言 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。
- **依赖**: 无

### S2: 实现 check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
- [x] S2: 实现 check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
- **描述**: 在现有架构内完成 FR-1: check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根） 的代码与文档更新。
- **验收条件**: FR-1 check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根） 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 1) tests/check-cache.test.mjs：digest 稳定性三态断言 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-331 与任务 T-20260911-check-init-sqlite 建立双向关联
- **验收条件**: AC-1: 1) tests/check-cache.test.mjs：digest 稳定性三态断言 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-331 与任务 T-20260911-check-init-sqlite 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
