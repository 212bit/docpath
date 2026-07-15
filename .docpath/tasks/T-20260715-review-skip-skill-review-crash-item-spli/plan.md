## 执行计划

### S1: 梳理 review --skip-skill-review 重复传参 crash: item.split is not a function
- [x] S1: 梳理 review --skip-skill-review 重复传参 crash: item.split is not a function
- **描述**: 根据 spec 明确 FR-1: review --skip-skill-review 重复传参 crash: item.split is not a function 的实现边界和验收口径。
- **验收条件**: AC-1: `normalizeSkillSkipList` 对非 string item 做防御（`String(item)` 或过滤），或用 `Array.isArray` 校验。
- **依赖**: 无

### S2: 实现 review --skip-skill-review 重复传参 crash: item.split is not a function
- [x] S2: 实现 review --skip-skill-review 重复传参 crash: item.split is not a function
- **描述**: 在现有架构内完成 FR-1: review --skip-skill-review 重复传参 crash: item.split is not a function 的代码与文档更新。
- **验收条件**: FR-1 review --skip-skill-review 重复传参 crash: item.split is not a function 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `normalizeSkillSkipList` 对非 string item 做防御（`String(item)` 或过滤），或用 `Array.isArray` 校验。；AC-2: CLI 层对 `--skip-skill-review` 重复 flag / 缺值给出明确错误（"skill 名不能为空"），而非 crash。；AC-3: 顶层 catch（R-248 范畴）对这类参数错误应给出具体错误信息，而非"未预期的错误"。；AC-4: 回归: 重复传 `--skip-skill-review` 不再 crash，给出可操作错误或正确归并。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-254 与任务 T-20260715-review-skip-skill-review-crash-item-spli 建立双向关联
- **验收条件**: AC-1: `normalizeSkillSkipList` 对非 string item 做防御（`String(item)` 或过滤），或用 `Array.isArray` 校验。；AC-2: CLI 层对 `--skip-skill-review` 重复 flag / 缺值给出明确错误（"skill 名不能为空"），而非 crash。；AC-3: 顶层 catch（R-248 范畴）对这类参数错误应给出具体错误信息，而非"未预期的错误"。；AC-4: 回归: 重复传 `--skip-skill-review` 不再 crash，给出可操作错误或正确归并。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-254 与任务 T-20260715-review-skip-skill-review-crash-item-spli 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
