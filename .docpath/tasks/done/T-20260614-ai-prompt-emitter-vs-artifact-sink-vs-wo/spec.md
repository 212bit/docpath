# T-20260614-ai-prompt-emitter-vs-artifact-sink-vs-wo - 明确 AI 辅助命令边界：prompt emitter vs artifact sink vs workflow gate

> backlog_id: R-173
> backlog_source: docpath backlog capture

## 1. 背景与动机

用户反思 `docpath brainstorm --input`、`docpath plan`、`docpath refine`、`docpath write-spec` 等命令的真实价值：如果 CLI 调用隐藏 LLM，会与当前 Claude/Codex 会话上下文断裂；如果 CLI 不调用 LLM，又容易被误解为模板命令。DocPath 需要明确 CLI、slash command、skill、artifact sink 与 workflow gate 的边界。

推进过程中还暴露了两个直接相关的问题：

- 全量取消忽略 `.docpath` 会暴露 runtime/install artifacts，导致 git closeout 失控。
- `docpath plan --dry-run` 实际写入 plan/state，并复用了上一个任务的 completed plan，这与 dry-run 和 prompt/artifact 边界相冲突。

核心原则：DocPath CLI 不替当前 Agent 会话思考；CLI 提供 prompt contract、artifact sink、workflow gate 和 evidence closeout。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 建立 AI 辅助命令边界分类：`prompt emitter`、`artifact sink`、`workflow gate`。
- [ ] FR-2: 明确 `brainstorm`、`plan`、`refine`、`analyze` 的 prompt contract / dry-run / Agent 协议语义，不暗示隐藏 LLM 会生成最终内容。
- [ ] FR-3: 明确 `write-spec`、`write-plan`、`write-design`、`write-analysis` 是 artifact sink，负责校验、落盘、同步结构化证据。
- [ ] FR-4: 保持 `status`、`next`、`go`、`agent enter/step/done`、`check`、`review`、`changes` 为 deterministic workflow gate。
- [ ] FR-5: 将 slash command / skill 定位为用户触发 AI 内容生成的主入口，CLI 作为底层协议与状态工具。
- [ ] FR-6: 修复或收紧 `docpath plan --dry-run` 语义，确保 dry-run 不写文件、不推进状态、不复用 stale current plan。
- [ ] FR-7: 保持 `.docpath` 默认 ignored，canonical evidence 只通过 `docpath changes --agent` 推荐的精确路径 force-add。

### 非功能需求

- [ ] NFR-1: 保持现有命令兼容，不做破坏性 rename。
- [ ] NFR-2: 不引入隐藏 LLM、网络依赖或跨会话 AI 生成。
- [ ] NFR-3: 文档、help、skill、slash command 与安装模板语义一致。
- [ ] NFR-4: 新增或修正行为必须有本地测试覆盖。

## 3. 范围界定

### 包含

- 命令边界设计文档或等价说明。
- AI 辅助命令和 write-* 命令 help 文案调整。
- Codex/OpenCode/Claude/AGENTS 协议和 skill/slash command 文案调整。
- `docpath plan --dry-run` 副作用与 stale plan 复用问题的修复或明确 fail-loud。
- Git evidence 策略说明：默认 ignore `.docpath`，精确 force-add canonical evidence。
- 相关测试。

### 不包含

- 不删除现有命令。
- 不做破坏性命令 rename。
- 不让 CLI 调用隐藏 LLM 生成最终 spec/plan/design。
- 不让 `agent done` 自动执行 git add/commit/push。
- 不全量 unignore `.docpath`。
- 不把 `.docpath/tasks/current/*` alias evidence 作为默认提交对象。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | AI 内容生成入口 | CLI hidden LLM / 当前 Agent 会话 / 外部服务 | 当前 Agent 会话 | 保持上下文连续，避免隐藏会话断裂 |
| 2 | CLI 职责 | 生成最终内容 / prompt+sink+gate | prompt+sink+gate | DocPath 的核心价值是状态、证据、验证和审计 |
| 3 | Git evidence 策略 | 全量 unignore `.docpath` / 精确 canonical evidence | 精确 canonical evidence | 避免 runtime/install artifacts 污染提交范围 |
| 4 | 兼容策略 | 直接 rename/delete / 文案和 alias 渐进收敛 | 渐进收敛 | 降低迁移成本 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: AI 辅助 CLI 命令边界不清，容易让用户误以为 CLI 自己负责 AI 推理；同时 `plan --dry-run` 出现副作用并复用 stale plan，说明 prompt emitter 和 artifact sink 边界没有被严格执行。
- 目标: 让 CLI、slash command、skill、artifact sink、workflow gate 的职责边界清晰、兼容、可测试。
- 背景: 用户明确提出反思 CLI 命令是否有意义，并指出核心价值可能是状态机与 prompt 控制，而不是通过 CLI 调用 AI。
- 可选方案: A 保持现状只补说明；B 文档/help/protocol 重新定位命令边界并修复 dry-run 副作用；C 大规模 rename 为 `prompt` / `artifact` 子命令；D 删除 AI 辅助 CLI。
- 推荐方案: 采用 B。先保留兼容命令，更新语义、协议和测试，修复明显违反 dry-run/边界的行为；Phase 2 再考虑 alias 或命令 IA 调整。
- 不做什么: 不删除命令，不破坏 rename，不调用隐藏 LLM，不自动 Git 写操作，不全量 unignore `.docpath`。
- 成本: 中等，涉及命令 help、plan/analyze/brainstorm/refine/write-* 行为边界、协议模板、skill 文案和测试。
- 风险: 文案调整不完整会造成 Agent 入口漂移；修复 plan dry-run 可能影响现有测试；过度抽象命令 IA 会扩大范围。
- 回滚方案: 保留命令行为兼容，撤回文档/help/protocol 调整；若 dry-run 修复有风险，可先 fail-loud 阻止副作用。
- 用户确认: 2026-06-14 用户同意 canonical evidence allowlist 方向，并同意继续推进 R-173。

## 5. 验收标准

- [ ] AC-1: 有明确命令边界说明，覆盖 prompt emitter、artifact sink、workflow gate。
- [ ] AC-2: `brainstorm`、`plan`、`refine`、`analyze` 的 help/protocol 不再暗示隐藏 LLM 生成最终内容。
- [ ] AC-3: `write-*` 命令被明确描述为 artifact sink。
- [ ] AC-4: `docpath plan --dry-run` 不写 plan、不推进状态、不复用 stale current plan；如暂不能生成真实计划，则 fail-loud。
- [ ] AC-5: Agent protocol / skill / slash command 模板将 AI 内容生成主入口放在当前 Agent 会话。
- [ ] AC-6: Git evidence 文档保持 `.docpath` 默认 ignored，并要求只 force-add 精确 canonical evidence。
- [ ] AC-7: 相关自动化测试、`docpath check`、`docpath review` 通过。
