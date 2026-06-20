## 执行计划

### S1: 梳理 `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。
- [x] S1: 梳理 `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。
- **描述**: 根据 spec 明确 FR-1: `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。 的实现边界和验收口径。
- **验收条件**: AC-1: `docpath review --dry-run` 在 TS/JS changed source files 下输出 `review_skill_gate.required` contract，包含 skill/language/scope/files/fingerprint/source/write command。
- **依赖**: 无

### S2: 实现 `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。
- [x] S2: 实现 `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。
- **描述**: 在现有架构内完成 FR-1: `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。 的代码与文档更新。
- **验收条件**: FR-1 `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 Router 识别源代码文件集并绑定 `review --scope`，支持 `all`, `staged`, `last_commit`；第一版只纳入 `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` 源文件，排除 lockfile、生成物、文档、配置和常见 build/dependency 目录。
- [x] S3: 实现 FR-2 Router 识别源代码文件集并绑定 `review --scope`，支持 `all`, `staged`, `last_commit`；第一版只纳入 `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` 源文件，排除 lockfile、生成物、文档、配置和常见 build/dependency 目录。
- **描述**: 在现有架构内完成 FR-2: Router 识别源代码文件集并绑定 `review --scope`，支持 `all`, `staged`, `last_commit`；第一版只纳入 `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` 源文件，排除 lockfile、生成物、文档、配置和常见 build/dependency 目录。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `docpath review --dry-run` 输出稳定的 `review_skill_gate` preview contract，包含 status、scope、requirements、skill、language、role、frameworks metadata、files、CLI-generated diff_fingerprint、skill_source_path、write command、missing/invalid evidence 和 skips。
- [x] S4: 实现 FR-3 `docpath review --dry-run` 输出稳定的 `review_skill_gate` preview contract，包含 status、scope、requirements、skill、language、role、frameworks metadata、files、CLI-generated diff_fingerprint、skill_source_path、write command、missing/invalid evidence 和 skips。
- **描述**: 在现有架构内完成 FR-3: `docpath review --dry-run` 输出稳定的 `review_skill_gate` preview contract，包含 status、scope、requirements、skill、language、role、frameworks metadata、files、CLI-generated diff_fingerprint、skill_source_path、write command、missing/invalid evidence 和 skips。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 标准 `docpath review` 在缺失 required DocPath-owned review skill 或缺失 required skill evidence 时必须 fail-loud；不能自动用 generic skill 或 baseline scanner 兜底。
- [x] S5: 实现 FR-4 标准 `docpath review` 在缺失 required DocPath-owned review skill 或缺失 required skill evidence 时必须 fail-loud；不能自动用 generic skill 或 baseline scanner 兜底。
- **描述**: 在现有架构内完成 FR-4: 标准 `docpath review` 在缺失 required DocPath-owned review skill 或缺失 required skill evidence 时必须 fail-loud；不能自动用 generic skill 或 baseline scanner 兜底。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 新增 agent-agnostic `docpath write-review-skill` artifact sink；命令实时复算 Router requirement，校验 skill/language/scope/files/status/findings，并由 CLI 写入 diff_fingerprint，agent 不提供 fingerprint。
- [x] S6: 实现 FR-5 新增 agent-agnostic `docpath write-review-skill` artifact sink；命令实时复算 Router requirement，校验 skill/language/scope/files/status/findings，并由 CLI 写入 diff_fingerprint，agent 不提供 fingerprint。
- **描述**: 在现有架构内完成 FR-5: 新增 agent-agnostic `docpath write-review-skill` artifact sink；命令实时复算 Router requirement，校验 skill/language/scope/files/status/findings，并由 CLI 写入 diff_fingerprint，agent 不提供 fingerprint。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 扩展 `review.json` 语义字段，支持 `skill_reviews[]`, `skill_review_skips[]`, `skill_review_gate`；skill review status 只允许 `pass | fail`，aggregate 可表达 `pass_with_skips`。
- [x] S7: 实现 FR-6 扩展 `review.json` 语义字段，支持 `skill_reviews[]`, `skill_review_skips[]`, `skill_review_gate`；skill review status 只允许 `pass | fail`，aggregate 可表达 `pass_with_skips`。
- **描述**: 在现有架构内完成 FR-6: 扩展 `review.json` 语义字段，支持 `skill_reviews[]`, `skill_review_skips[]`, `skill_review_gate`；skill review status 只允许 `pass | fail`，aggregate 可表达 `pass_with_skips`。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 实现 FR-7 CLI 校验 evidence schema 和语义 invalid：scope mismatch、文件覆盖不完整或越界、fingerprint 过期、`pass` 搭配 `severity:error` finding、`status:fail` 均导致 review fail。
- [x] S8: 实现 FR-7 CLI 校验 evidence schema 和语义 invalid：scope mismatch、文件覆盖不完整或越界、fingerprint 过期、`pass` 搭配 `severity:error` finding、`status:fail` 均导致 review fail。
- **描述**: 在现有架构内完成 FR-7: CLI 校验 evidence schema 和语义 invalid：scope mismatch、文件覆盖不完整或越界、fingerprint 过期、`pass` 搭配 `severity:error` finding、`status:fail` 均导致 review fail。。
- **验收条件**: FR-7 已实现，并保持现有工作流兼容。
- **依赖**: S7

### S9: 实现 FR-8 支持按 skill 粒度 skip：`docpath review --skip-skill-review <skill> --reason <reason>`；skip 必须绑定当前 requirement 中存在的 skill 且 reason 非空；skip 可让 gate 通过，但 evidence 必须显示 `pass_with_skips`，不能伪装完全通过。
- [x] S9: 实现 FR-8 支持按 skill 粒度 skip：`docpath review --skip-skill-review <skill> --reason <reason>`；skip 必须绑定当前 requirement 中存在的 skill 且 reason 非空；skip 可让 gate 通过，但 evidence 必须显示 `pass_with_skips`，不能伪装完全通过。
- **描述**: 在现有架构内完成 FR-8: 支持按 skill 粒度 skip：`docpath review --skip-skill-review <skill> --reason <reason>`；skip 必须绑定当前 requirement 中存在的 skill 且 reason 非空；skip 可让 gate 通过，但 evidence 必须显示 `pass_with_skips`，不能伪装完全通过。。
- **验收条件**: FR-8 已实现，并保持现有工作流兼容。
- **依赖**: S8

### S10: 实现 FR-9 新增 DocPath-owned 默认 review skill resources：`.docpath/review-skills/typescript/SKILL.md` 和 `.docpath/review-skills/javascript/SKILL.md`；每个 skill 必须包含 Scope、Review Checklist、Evidence Contract 三块。
- [x] S10: 实现 FR-9 新增 DocPath-owned 默认 review skill resources：`.docpath/review-skills/typescript/SKILL.md` 和 `.docpath/review-skills/javascript/SKILL.md`；每个 skill 必须包含 Scope、Review Checklist、Evidence Contract 三块。
- **描述**: 在现有架构内完成 FR-9: 新增 DocPath-owned 默认 review skill resources：`.docpath/review-skills/typescript/SKILL.md` 和 `.docpath/review-skills/javascript/SKILL.md`；每个 skill 必须包含 Scope、Review Checklist、Evidence Contract 三块。。
- **验收条件**: FR-9 已实现，并保持现有工作流兼容。
- **依赖**: S9

### S11: 实现 FR-10 支持默认安装 TS/JS review skills，并允许配置关闭 Review Skill Gate；配置关闭时 review output 应显示 disabled，gate 启用且命中 supported source files 时缺失 skill 仍 fail-loud。
- [x] S11: 实现 FR-10 支持默认安装 TS/JS review skills，并允许配置关闭 Review Skill Gate；配置关闭时 review output 应显示 disabled，gate 启用且命中 supported source files 时缺失 skill 仍 fail-loud。
- **描述**: 在现有架构内完成 FR-10: 支持默认安装 TS/JS review skills，并允许配置关闭 Review Skill Gate；配置关闭时 review output 应显示 disabled，gate 启用且命中 supported source files 时缺失 skill 仍 fail-loud。。
- **验收条件**: FR-10 已实现，并保持现有工作流兼容。
- **依赖**: S10

### S12: 验证验收标准
- [x] S12: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `docpath review --dry-run` 在 TS/JS changed source files 下输出 `review_skill_gate.required` contract，包含 skill/language/scope/files/fingerprint/source/write command。；AC-2: 标准 `docpath review` 在缺失 required skill 文件时 fail-loud。；AC-3: 标准 `docpath review` 在缺失 required skill evidence 时 fail-loud。；AC-4: `docpath write-review-skill` 可写入有效 TypeScript/JavaScript skill evidence，并让对应 skill gate pass。；AC-5: scope mismatch、文件覆盖不完整、fingerprint 过期、`pass + severity:error`、`status: fail` 均导致 review fail。；AC-6: `--skip-skill-review <skill> --reason <reason>` 可让 gate 通过，并在 `review.json` 中记录 `pass_with_skips` 语义。；AC-7: TypeScript/JavaScript review skill resources 默认安装或由模板覆盖，且每个 skill 包含 Scope、Review Checklist、Evidence Contract。；AC-8: Baseline scanner 保留，baseline error findings 仍会阻塞 review，且不能替代 skill review。；AC-9: 聚焦测试覆盖 router、write-review-skill、skip、install assets；`pnpm test`、`docpath check`、`docpath review` 通过或明确记录无法运行原因。
- **验收条件**: AC-1: `docpath review --dry-run` 在 TS/JS changed source files 下输出 `review_skill_gate.required` contract，包含 skill/language/scope/files/fingerprint/source/write command。；AC-2: 标准 `docpath review` 在缺失 required skill 文件时 fail-loud。；AC-3: 标准 `docpath review` 在缺失 required skill evidence 时 fail-loud。；AC-4: `docpath write-review-skill` 可写入有效 TypeScript/JavaScript skill evidence，并让对应 skill gate pass。；AC-5: scope mismatch、文件覆盖不完整、fingerprint 过期、`pass + severity:error`、`status: fail` 均导致 review fail。；AC-6: `--skip-skill-review <skill> --reason <reason>` 可让 gate 通过，并在 `review.json` 中记录 `pass_with_skips` 语义。；AC-7: TypeScript/JavaScript review skill resources 默认安装或由模板覆盖，且每个 skill 包含 Scope、Review Checklist、Evidence Contract。；AC-8: Baseline scanner 保留，baseline error findings 仍会阻塞 review，且不能替代 skill review。；AC-9: 聚焦测试覆盖 router、write-review-skill、skip、install assets；`pnpm test`、`docpath check`、`docpath review` 通过或明确记录无法运行原因。
- **依赖**: S11

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8
- [x] S9
- [x] S10
- [x] S11
- [ ] S12

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11 → S12
