## 执行计划

### S1: 梳理 review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查
- [x] S1: 梳理 review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查
- **描述**: 根据 spec 明确 FR-1: review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查 的实现边界和验收口径。
- **验收条件**: AC-1: AC-1: 活跃任务内树干净但任务有提交时, docpath review 的 router requirements 覆盖任务累计 diff 的 TS/JS 文件, 不再 not_required。
- **依赖**: 无

### S2: 实现 review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查
- [x] S2: 实现 review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查
- **描述**: 在现有架构内完成 FR-1: review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查 的代码与文档更新。
- **验收条件**: FR-1 review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: AC-1: 活跃任务内树干净但任务有提交时, docpath review 的 router requirements 覆盖任务累计 diff 的 TS/JS 文件, 不再 not_required。；AC-2: AC-2: 无活跃任务 (或 started_at 缺失) 时 review 行为与现状一致 (scope=all)。；AC-3: AC-3: router 指纹 task 口径与 review.ts 一致——同一任务同一 git 状态下指纹稳定, 新提交后指纹变化。；AC-4: AC-4: review 后新提交 ⇒ done 拒绝复用并重审; 无 head 字段的旧证据仍按时间窗复用。；AC-5: AC-5: pnpm test 全绿; write-review-skill 在 task 口径下走通 (指纹/文件集匹配)。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-276 与任务 T-20260716-review-skill-router-diff-commit-first 建立双向关联
- **验收条件**: AC-1: AC-1: 活跃任务内树干净但任务有提交时, docpath review 的 router requirements 覆盖任务累计 diff 的 TS/JS 文件, 不再 not_required。；AC-2: AC-2: 无活跃任务 (或 started_at 缺失) 时 review 行为与现状一致 (scope=all)。；AC-3: AC-3: router 指纹 task 口径与 review.ts 一致——同一任务同一 git 状态下指纹稳定, 新提交后指纹变化。；AC-4: AC-4: review 后新提交 ⇒ done 拒绝复用并重审; 无 head 字段的旧证据仍按时间窗复用。；AC-5: AC-5: pnpm test 全绿; write-review-skill 在 task 口径下走通 (指纹/文件集匹配)。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-276 与任务 T-20260716-review-skill-router-diff-commit-first 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
