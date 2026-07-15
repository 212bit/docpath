## 执行计划

### S1: 梳理 review-skill file set mismatch 阻塞正常代码（0 错误仍被卡）
- [x] S1: 梳理 review-skill file set mismatch 阻塞正常代码（0 错误仍被卡）
- **描述**: 根据 spec 明确 FR-1: review-skill file set mismatch 阻塞正常代码（0 错误仍被卡） 的实现边界和验收口径。
- **验收条件**: AC-1: review 检测到 file set mismatch 时，给出明确指引：要么提示"重生成 evidence: docpath write-review-skill --skill <skill> ... --stdin"，要么提供 `--fix-skill-evidence` 就地重建。
- **依赖**: 无

### S2: 实现 review-skill file set mismatch 阻塞正常代码（0 错误仍被卡）
- [x] S2: 实现 review-skill file set mismatch 阻塞正常代码（0 错误仍被卡）
- **描述**: 在现有架构内完成 FR-1: review-skill file set mismatch 阻塞正常代码（0 错误仍被卡） 的代码与文档更新。
- **验收条件**: FR-1 review-skill file set mismatch 阻塞正常代码（0 错误仍被卡） 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: review 检测到 file set mismatch 时，给出明确指引：要么提示"重生成 evidence: docpath write-review-skill --skill <skill> ... --stdin"，要么提供 `--fix-skill-evidence` 就地重建。；AC-2: 或：区分"证据元数据问题"与"代码缺陷"——前者降级为告警+修复提示，不阻塞 review；只有 current_diff/baseline 的真实 finding 才阻塞。；AC-3: 回归: 代码 0 错误时，file set mismatch 不再强制阻塞 review（给出修复提示即可）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-255 与任务 T-20260715-review-skill-file-set-mismatch-0 建立双向关联
- **验收条件**: AC-1: review 检测到 file set mismatch 时，给出明确指引：要么提示"重生成 evidence: docpath write-review-skill --skill <skill> ... --stdin"，要么提供 `--fix-skill-evidence` 就地重建。；AC-2: 或：区分"证据元数据问题"与"代码缺陷"——前者降级为告警+修复提示，不阻塞 review；只有 current_diff/baseline 的真实 finding 才阻塞。；AC-3: 回归: 代码 0 错误时，file set mismatch 不再强制阻塞 review（给出修复提示即可）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-255 与任务 T-20260715-review-skill-file-set-mismatch-0 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
