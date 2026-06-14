# R-173 Analysis - AI 辅助命令边界

## Requirements

### 目标

明确 DocPath 中 AI 辅助命令的职责边界，避免用户和 Agent 误以为 CLI 会在另一个上下文中替当前会话完成需求澄清、方案推理或内容生成。

### 角色与触发场景

- 用户在 Claude/Codex/OpenCode 会话中提出模糊需求，需要 brainstorm、analysis、refine、spec、plan。
- Agent 需要知道什么时候调用 deterministic CLI，什么时候应该在当前会话内完成推理。
- DocPath 维护者需要设计命令、help、slash command、skill 与 protocol 的稳定边界。

### 功能需求候选

- FR-1: 将命令分为 `prompt emitter`、`artifact sink`、`workflow gate` 三类，并在文档/help/protocol 中稳定表达。
- FR-2: `brainstorm`、`plan`、`refine`、`analyze` 不应被描述为隐藏 LLM 生成器，应定位为 prompt contract、dry-run payload 或 Agent 协议入口。
- FR-3: `write-spec`、`write-plan`、`write-design`、`write-analysis` 应明确为 artifact sink，负责校验、落盘、同步结构化证据。
- FR-4: `status`、`next`、`go`、`agent enter/step/done`、`check`、`review`、`changes` 应保持 deterministic workflow gate。
- FR-5: Slash command / skill 应成为用户触发 AI 内容生成的主入口，CLI 作为底层协议和状态工具。
- FR-6: Git closeout 继续采用只读检查与精确 canonical evidence 纳入，不全量 unignore `.docpath`。

### 非功能需求

- 保持现有命令兼容，不做破坏性 rename。
- 不引入网络或隐藏 LLM 依赖。
- 输出语义要能通过本地测试验证。
- 协议文档和安装模板必须同步，避免不同 Agent 行为漂移。

## Product

### 用户价值

用户可以把 DocPath 理解为可靠的 workflow engine，而不是另一个不可见 AI 会话。Agent 也能更稳定地区分“该思考生成内容”和“该调用 CLI 推进状态”。

### 成功指标

- 用户能从 help/protocol 中看出哪些命令是 deterministic，哪些命令需要当前 Agent 推理。
- Agent 不再把 `docpath brainstorm --input` 或 `docpath plan` 当作隐藏 AI 生成最终内容。
- 新任务的 spec/plan 仍能通过现有 DocPath 流程生成和验证。

### 范围边界

包含：

- 命令分类与命名语义文档。
- 关键命令 help 文案调整。
- Slash command / skill / protocol 文案调整。
- 必要测试覆盖。

不包含：

- 删除现有命令。
- 大规模 CLI rename。
- 自动调用 LLM。
- 自动执行 git add/commit/push。

## Technical

### 受影响区域

- AI 辅助命令：`brainstorm`、`plan`、`refine`、`analyze`。
- Artifact sink 命令：`write-spec`、`write-plan`、`write-design`、`write-analysis`。
- Agent protocol：AGENTS/CODEX/CLAUDE/OPENCODE 模板与 Codex skill。
- Slash command 模板：`templates/commands/*` 与安装后的 `.docpath/commands/*` 相关文案。
- Routing 输出：必要时让 `next --agent` 区分 `recommended_command`、`agent_action`、`artifact_sink` 语义。

### 设计约束

- CLI 不调用隐藏 LLM 生成最终内容。
- CLI 可以输出 prompt contract、schema、建议写入命令和验证结果。
- 当前 Agent 会话负责多轮澄清、推理、内容生成和取舍说明。
- `.docpath` 默认保持 ignored，canonical evidence 通过 `docpath changes --agent` 给出的精确路径 force-add。

### 测试策略

- CLI help/agent output 快照或断言测试。
- `next --agent` 在 backlog/predev/active/completed 状态下的推荐语义测试。
- `changes --agent` 对 ignored canonical evidence 与 alias evidence 的回归测试。
- 协议模板安装检查。

## Risks

- 只改文档不改 help，会继续误导用户。
- 只改 help 不改 skill/slash command，会导致不同 Agent 入口语义漂移。
- 过早 rename 命令会破坏已有使用路径。
- 过度形式化 prompt emitter 可能让 CLI 看起来仍在“替 AI 思考”。
- `.docpath` Git 策略如果改成全量 unignore，会暴露 runtime/install artifacts 并污染 closeout。

## Open Questions

### 阻塞实现的问题

- 第一阶段是否只做文案/协议/help/测试，不改命令行为？
- `docpath plan` 是否保留现有行为但改文案，还是新增 `docpath prompt plan` alias？
- `next --agent` 是否需要新增结构化字段，例如 `agent_action` 与 `artifact_sink`？

### 非阻塞问题

- 长期是否引入 `docpath prompt <kind>` 和 `docpath artifact write <kind>` 分层命令？
- 是否为每个命令维护 command-boundaries matrix？

## Decision Brief Draft

- 当前问题: AI 辅助 CLI 命令边界不清，容易造成隐藏 LLM、上下文断裂、模板命令价值不明等误解。
- 目标: 让 CLI、slash command、skill、artifact sink、workflow gate 的职责边界清晰、兼容、可测试。
- 推荐方案: Phase 1 保留命令兼容，优先更新 help/protocol/slash/skill 文案和 command-boundaries 文档；必要时补充结构化 route 字段。Phase 2 再考虑 alias 或命令 IA 调整。
- 不做什么: 不删除命令，不破坏 rename，不调用隐藏 LLM，不自动 Git 写操作，不全量 unignore `.docpath`。
- 回滚方案: 撤回文档/help/protocol 调整即可，命令行为保持兼容。
- 用户确认: 2026-06-14 用户同意 canonical evidence allowlist 方向，并同意继续推进 R-173。
