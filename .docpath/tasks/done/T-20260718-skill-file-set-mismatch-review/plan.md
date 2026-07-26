## 执行计划

### S1: 梳理 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
- [x] S1: 梳理 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
- **描述**: 根据 spec 明确 FR-1: 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review 的实现边界和验收口径。
- **验收条件**: AC-1: 在 `ReviewEvidence` 和 `LastCheckEvidence` 结构中引入 `task_id` 属性，并在生成证据时写入。
- **依赖**: 无

### S2: 实现 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
- [x] S2: 实现 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
- **描述**: 在现有架构内完成 FR-1: 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review 的代码与文档更新。
- **验收条件**: FR-1 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 在 `ReviewEvidence` 和 `LastCheckEvidence` 结构中引入 `task_id` 属性，并在生成证据时写入。；AC-2: 读取证据时，如果发现其 `task_id` 与当前的活跃 `task_id` 存在冲突/不匹配，则判定为失效并返回 `null`。；AC-3: 保留对无 `task_id` 的历史陈旧/测试证据的向后兼容，不强制失效。；AC-4: 提供完整的自动化单元测试验证隔离行为。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-285 与任务 T-20260718-skill-file-set-mismatch-review 建立双向关联
- **验收条件**: AC-1: 在 `ReviewEvidence` 和 `LastCheckEvidence` 结构中引入 `task_id` 属性，并在生成证据时写入。；AC-2: 读取证据时，如果发现其 `task_id` 与当前的活跃 `task_id` 存在冲突/不匹配，则判定为失效并返回 `null`。；AC-3: 保留对无 `task_id` 的历史陈旧/测试证据的向后兼容，不强制失效。；AC-4: 提供完整的自动化单元测试验证隔离行为。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-285 与任务 T-20260718-skill-file-set-mismatch-review 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
