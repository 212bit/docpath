## 执行计划

### S1: 梳理 `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。
- [x] S1: 梳理 `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。
- **描述**: 根据 spec 明确 FR-1: `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。 的实现边界和验收口径。
- **验收条件**: AC-1: active task 的 canonical `spec.md/spec.json` 出现 structured hash drift 时，`docpath review` 退出非零。
- **依赖**: 无

### S2: 实现 `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。
- [x] S2: 实现 `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。
- **描述**: 在现有架构内完成 FR-1: `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。 的代码与文档更新。
- **验收条件**: FR-1 `docpath review` 在收集 changed files 前检测 active task canonical `spec.md/spec.json` 和 `plan.md/plan.json` 的 structured markdown hash drift。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 检测到 drift 时，`docpath review` 退出非零，不写入 review evidence、不推进 workflow，并输出包含 `机器真理源不同步` 的明确错误。
- [x] S3: 实现 FR-2 检测到 drift 时，`docpath review` 退出非零，不写入 review evidence、不推进 workflow，并输出包含 `机器真理源不同步` 的明确错误。
- **描述**: 在现有架构内完成 FR-2: 检测到 drift 时，`docpath review` 退出非零，不写入 review evidence、不推进 workflow，并输出包含 `机器真理源不同步` 的明确错误。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 drift 输出必须包含具体 drift 文件、hash 差异摘要和可执行修复建议：Markdown 为准时使用 `docpath write-spec --stdin` 或 `docpath write-plan --stdin`，JSON 为准时使用 `docpath render --view spec|plan`。
- [x] S4: 实现 FR-3 drift 输出必须包含具体 drift 文件、hash 差异摘要和可执行修复建议：Markdown 为准时使用 `docpath write-spec --stdin` 或 `docpath write-plan --stdin`，JSON 为准时使用 `docpath render --view spec|plan`。
- **描述**: 在现有架构内完成 FR-3: drift 输出必须包含具体 drift 文件、hash 差异摘要和可执行修复建议：Markdown 为准时使用 `docpath write-spec --stdin` 或 `docpath write-plan --stdin`，JSON 为准时使用 `docpath render --view spec|plan`。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 无 drift 的 clean review 行为保持不变，包括 review skill gate、finding_scope 和 evidence 写入。
- [x] S5: 实现 FR-4 无 drift 的 clean review 行为保持不变，包括 review skill gate、finding_scope 和 evidence 写入。
- **描述**: 在现有架构内完成 FR-4: 无 drift 的 clean review 行为保持不变，包括 review skill gate、finding_scope 和 evidence 写入。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: active task 的 canonical `spec.md/spec.json` 出现 structured hash drift 时，`docpath review` 退出非零。；AC-2: drift review 输出包含 `机器真理源不同步`、具体 `spec.md/spec.json` 路径和 `docpath write-spec --stdin` / `docpath render --view spec` 修复建议。；AC-3: active task 的 canonical `plan.md/plan.json` 出现 structured hash drift 时，输出等价的 `write-plan` / `render --view plan` 修复建议。；AC-4: 无 drift 的 review 现有测试保持通过。；AC-5: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
- **验收条件**: AC-1: active task 的 canonical `spec.md/spec.json` 出现 structured hash drift 时，`docpath review` 退出非零。；AC-2: drift review 输出包含 `机器真理源不同步`、具体 `spec.md/spec.json` 路径和 `docpath write-spec --stdin` / `docpath render --view spec` 修复建议。；AC-3: active task 的 canonical `plan.md/plan.json` 出现 structured hash drift 时，输出等价的 `write-plan` / `render --view plan` 修复建议。；AC-4: 无 drift 的 review 现有测试保持通过。；AC-5: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
- **依赖**: S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
