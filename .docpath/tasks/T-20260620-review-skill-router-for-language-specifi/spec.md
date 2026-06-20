# T-20260620-review-skill-router-for-language-specifi - Review Skill Router for language-specific agent review

> backlog_id: R-001
> backlog_source: docpath backlog add
> major_change: yes
> user_confirmation: 2026-06-20 用户明确确认“同意，利用docpath 进行开发”

## 1. 背景与动机

`docpath review` 当前已有 baseline scanner，但它只能做通用、浅层、确定性的检查。语言级 review 需要大量语义规则、惯例、风险清单和证据格式。如果全部固化到 CLI，会让 CLI 变得臃肿且难维护；如果完全依赖 agent 自发 review，又容易漏文件、跑偏、证据不可验证。

本任务引入确定性的 Review Skill Router：CLI 不直接执行语言级深度审查，而是在 `docpath review` 正常流程中识别 changed source files、选择必需的 DocPath-owned review skill、输出 agent-readable contract，并校验 agent 通过 `write-review-skill` 写入的结构化证据。第一版只实现语言层 TypeScript/JavaScript，框架层只作为可扩展元数据预留。

重要边界：review skill 文件放在 DocPath 管理的位置，由 CLI contract 显式触发，不依赖 Codex 的自动 skill 触发机制。Codex 自动 skill 可以是后续镜像或便利层，但不能成为 gate truth。

## 2. 需求清单

### 功能需求

- [ ] FR-1: `docpath review` 默认接入 Review Skill Router；仅在命中已支持语言的 changed source files 时触发，第一版支持 TypeScript 和 JavaScript。
- [ ] FR-2: Router 识别源代码文件集并绑定 `review --scope`，支持 `all`, `staged`, `last_commit`；第一版只纳入 `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` 源文件，排除 lockfile、生成物、文档、配置和常见 build/dependency 目录。
- [ ] FR-3: `docpath review --dry-run` 输出稳定的 `review_skill_gate` preview contract，包含 status、scope、requirements、skill、language、role、frameworks metadata、files、CLI-generated diff_fingerprint、skill_source_path、write command、missing/invalid evidence 和 skips。
- [ ] FR-4: 标准 `docpath review` 在缺失 required DocPath-owned review skill 或缺失 required skill evidence 时必须 fail-loud；不能自动用 generic skill 或 baseline scanner 兜底。
- [ ] FR-5: 新增 agent-agnostic `docpath write-review-skill` artifact sink；命令实时复算 Router requirement，校验 skill/language/scope/files/status/findings，并由 CLI 写入 diff_fingerprint，agent 不提供 fingerprint。
- [ ] FR-6: 扩展 `review.json` 语义字段，支持 `skill_reviews[]`, `skill_review_skips[]`, `skill_review_gate`；skill review status 只允许 `pass | fail`，aggregate 可表达 `pass_with_skips`。
- [ ] FR-7: CLI 校验 evidence schema 和语义 invalid：scope mismatch、文件覆盖不完整或越界、fingerprint 过期、`pass` 搭配 `severity:error` finding、`status:fail` 均导致 review fail。
- [ ] FR-8: 支持按 skill 粒度 skip：`docpath review --skip-skill-review <skill> --reason <reason>`；skip 必须绑定当前 requirement 中存在的 skill 且 reason 非空；skip 可让 gate 通过，但 evidence 必须显示 `pass_with_skips`，不能伪装完全通过。
- [ ] FR-9: 新增 DocPath-owned 默认 review skill resources：`.docpath/review-skills/typescript/SKILL.md` 和 `.docpath/review-skills/javascript/SKILL.md`；每个 skill 必须包含 Scope、Review Checklist、Evidence Contract 三块。
- [ ] FR-10: 支持默认安装 TS/JS review skills，并允许配置关闭 Review Skill Gate；配置关闭时 review output 应显示 disabled，gate 启用且命中 supported source files 时缺失 skill 仍 fail-loud。

### 非功能需求

- [ ] NFR-1: 保持 baseline scanner；baseline scanner 的 error findings 仍阻塞 review，且不能替代语言 skill review evidence。
- [ ] NFR-2: 第一版不新增状态机 gate，仍沿用现有 review pass/fail 机制；skip 语义仅记录在 `review.json` 和 review output。
- [ ] NFR-3: Router 和 `write-review-skill` 必须实时复算 requirement，不依赖持久化预生成 contract。
- [ ] NFR-4: Gate/evidence 命令必须 agent-agnostic；skill 文件第一版可面向 Codex 文案优化，但 gate truth 不依赖 Codex 自动触发目录。
- [ ] NFR-5: 输出字段稳定、可测试，并尽量沿用现有 review/check/schema/test 风格。

## 3. 范围界定

### 包含

- `docpath review` Router/gate 集成。
- `docpath review --dry-run` preview contract。
- 新 `docpath write-review-skill` 命令或等价注册入口。
- `review.json` schema/evidence 扩展。
- TypeScript/JavaScript language router。
- DocPath-owned review skill default assets。
- 配置开关。
- 聚焦测试覆盖 router、evidence validation、skip、install/assets。

### 不包含

- Rust/Go/Python 等更多语言。
- 框架级 skill routing 的实际推断和 gate。
- CLI 自己执行自然语言深度 code review。
- 依赖 Codex 自动触发 skills。
- 新增状态机 gate 或更改 closeout 状态枚举。
- 对配置、lockfile、生成物、文档做 language skill gate。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Review skill source | Codex 自动 skill 目录 / DocPath-owned review skill 目录 | 采用 DocPath-owned review skill 目录 | Gate 必须由 CLI 显式触发和验证，避免自动触发不可控 |
| 2 | CLI 与 agent 分工 | CLI 内置所有语言规则 / agent 自发 review / Router + evidence contract | 采用 Router + evidence contract | CLI 保持确定性，agent 执行语言语义 review，证据可复算 |
| 3 | 第一版语言覆盖 | 多语言全覆盖 / TS+JS first | 采用 TS+JS first | 先覆盖本项目高价值源文件并控制维护成本 |
| 4 | 缺失 evidence 行为 | 通用兜底 / warn / fail-loud | 采用 fail-loud | 标准 review gate 必须阻塞，除非显式 skill-level skip |
| 5 | 状态机 | 新增 gate 状态 / 仅扩展 review evidence | 第一版仅扩展 review evidence | 降低状态机迁移风险，先验证语义闭环 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: CLI 内置全部语言规则不现实；agent 自发 review 容易漏 scope、漏文件、证据不可复算。
- 目标: 把语言 review 变成 CLI 确定性路由 + agent 执行 skill + CLI 校验证据的闭环。
- 背景: 用户通过 grill 确认 deterministic Review Skill Router、TS/JS first、blocking gate、skill-granular skip、CLI evidence sink、DocPath-owned skill source。
- 可选方案: 继续 baseline-only；把所有语言规则写进 CLI；依赖 Codex 自动 skill；采用 Router + evidence contract。
- 推荐方案: 在 `docpath review` 正常流程中加入 Review Skill Router，使用 DocPath-owned review skill 文件和 `write-review-skill` sink。
- 不做什么: 不把所有语言规则写进 CLI；不依赖 Codex 自动 skill；不在第一版加入框架推断或新状态机 gate。
- 成本: review 流程更严格，新增命令、schema 和测试；维护 review skill assets。
- 风险: 首次使用时缺 evidence 会 fail-loud；skip 可能被滥用；fingerprint/scope 校验实现需避免误报。
- 回滚方案: 通过配置关闭 skill gate，或回滚本任务提交恢复 baseline-only review。
- 用户确认: 用户已确认该重大变更，并明确“同意，利用docpath 进行开发”。

## 5. 验收标准

- [ ] AC-1: `docpath review --dry-run` 在 TS/JS changed source files 下输出 `review_skill_gate.required` contract，包含 skill/language/scope/files/fingerprint/source/write command。
- [ ] AC-2: 标准 `docpath review` 在缺失 required skill 文件时 fail-loud。
- [ ] AC-3: 标准 `docpath review` 在缺失 required skill evidence 时 fail-loud。
- [ ] AC-4: `docpath write-review-skill` 可写入有效 TypeScript/JavaScript skill evidence，并让对应 skill gate pass。
- [ ] AC-5: scope mismatch、文件覆盖不完整、fingerprint 过期、`pass + severity:error`、`status: fail` 均导致 review fail。
- [ ] AC-6: `--skip-skill-review <skill> --reason <reason>` 可让 gate 通过，并在 `review.json` 中记录 `pass_with_skips` 语义。
- [ ] AC-7: TypeScript/JavaScript review skill resources 默认安装或由模板覆盖，且每个 skill 包含 Scope、Review Checklist、Evidence Contract。
- [ ] AC-8: Baseline scanner 保留，baseline error findings 仍会阻塞 review，且不能替代 skill review。
- [ ] AC-9: 聚焦测试覆盖 router、write-review-skill、skip、install assets；`pnpm test`、`docpath check`、`docpath review` 通过或明确记录无法运行原因。
