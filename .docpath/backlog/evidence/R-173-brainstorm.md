# R-173 Brainstorm Evidence - AI 辅助命令边界

## 背景

用户反思 DocPath CLI 中 `brainstorm --input`、`plan`、`refine`、`write-spec`、`write-design` 等命令的真实价值：如果这些命令调用另一个隐藏 LLM，会与当前 Claude/Codex 会话上下文断裂；如果不调用 LLM，又容易被误解成只是模板生成器。

## 核心判断

DocPath CLI 的核心价值不是替 Agent 思考，而是让 Agent 的工作可路由、可验证、可恢复、可审计。

AI 辅助命令应拆成三类边界：

- `prompt emitter`: CLI 输出结构化 prompt contract 或协议，不负责最终推理。
- `artifact sink`: CLI 接收当前 Agent 会话生成的内容，校验、落盘、同步结构化证据。
- `workflow gate`: CLI 负责状态推进、门禁检查、证据完整性、下一步路由和 closeout。

## 推荐方向

- 不让 DocPath CLI 调用隐藏 LLM 生成最终内容。
- 当前 Agent 会话负责需求澄清、推理、方案比较和内容生成。
- Slash command / skill 应成为用户触发 AI 内容生成的主入口。
- `brainstorm`、`plan`、`refine`、`analyze` 应重新定位为 prompt contract 或低层协议命令。
- `write-spec`、`write-plan`、`write-design`、`write-analysis` 应明确为 artifact sink。
- `status`、`next`、`go`、`agent enter/step/done`、`check`、`review`、`changes` 应保持 deterministic workflow gate。

## Git closeout 发现

在推进 R-173 时，`.gitignore` 删除 `.docpath` 根规则导致大量 `.docpath/workspace`、`.docpath/commands`、`.docpath/bin`、历史 task/backlog 文件暴露为 untracked，`docpath changes --agent` 因此阻塞。

结论：DocPath Git 策略应保留 `.docpath` 默认 ignored，并只通过 `docpath changes --agent` 推荐的精确 canonical evidence 路径进行 `git add -f`，而不是全量 unignore `.docpath`。

## 非目标

- 不删除现有 AI 辅助命令。
- 不做破坏性 rename。
- 不引入隐藏 LLM 调用。
- 不让 `agent done` 自动执行 git add/commit/push。
- 不把 `.docpath/tasks/current/*` alias evidence 作为默认提交对象。

## 用户确认

- 2026-06-14 用户同意采用 canonical evidence allowlist 方向。
- 2026-06-14 用户同意继续推进 R-173。

## 待形成 Decision Brief

- 当前问题: AI 辅助 CLI 命令边界不清，容易让用户误以为 CLI 自己负责 AI 推理，且与当前 Agent 会话上下文断裂。
- 目标: 让 CLI、slash command、skill、artifact sink、workflow gate 的职责边界清晰可测试。
- 推荐方案: 保留兼容命令，优先更新 help/protocol/slash skill 语义，把 AI 内容生成主入口放在当前 Agent 会话内。
- 回滚方案: 保留现有命令行为，仅撤回文档和 help 文案调整。
