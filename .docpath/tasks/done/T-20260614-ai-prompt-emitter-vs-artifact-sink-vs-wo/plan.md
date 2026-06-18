## 执行计划

### S1: 固化命令边界与现有行为证据
- **描述**: 梳理 `brainstorm`、`plan`、`refine`、`analyze`、`write-*`、`next`、`changes` 的当前 help、行为和测试，确认 prompt emitter、artifact sink、workflow gate 的边界差异，并记录 `plan --dry-run` 副作用与 stale plan 复用问题。
- **验收条件**: 形成受影响文件清单；明确哪些行为只改文案、哪些行为需要代码修复；保留兼容性边界。
- **依赖**: 无

### S2: 修复 dry-run 与 stale plan 边界问题
- **描述**: 收紧 `docpath plan --dry-run`，确保 dry-run 不写文件、不推进状态、不复用旧 current plan；必要时让无法生成真实 plan 的路径 fail-loud，并覆盖 promotion 后 current plan alias 缺失场景。
- **验收条件**: `plan --dry-run` 无副作用；新任务不会继承上一个任务的 completed checklist；相关回归测试失败前可复现、修复后通过。
- **依赖**: S1

### S3: 更新命令语义与文档边界
- **描述**: 更新 AI 辅助命令和 `write-*` 命令的 help、README/设计文档或 command-boundaries 文档，明确 prompt emitter、artifact sink、workflow gate 的定义和示例。
- **验收条件**: 用户能从 CLI help 与文档判断每类命令是否 deterministic、是否写状态、是否需要当前 Agent 推理；不暗示隐藏 LLM。
- **依赖**: S1

### S4: 同步 Agent 协议、skill 与 slash command 模板
- **描述**: 更新 AGENTS/CODEX/CLAUDE/OPENCODE 协议、Codex skill、templates/commands 中涉及 brainstorm/plan/refine/analyze/write-* 的文案，将 AI 内容生成主入口放在当前 Agent 会话。
- **验收条件**: 安装模板与仓库内协议一致；slash/skill 文案不会引导 Agent 期待 CLI 隐藏生成最终内容；Git closeout 仍要求精确 canonical evidence。
- **依赖**: S3

### S5: 验证、review 与 closeout
- **描述**: 补充或更新自动化测试，运行针对性测试、全量测试、`docpath check`、`docpath review`、`docpath changes --agent`，修复发现的问题并完成任务归档。
- **验收条件**: 测试和 DocPath 门禁通过；R-173 进入 completed/review_pass；提交范围只包含源代码、测试、协议和 canonical evidence。
- **依赖**: S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 -> S2 -> S5
S1 -> S3 -> S4 -> S5
