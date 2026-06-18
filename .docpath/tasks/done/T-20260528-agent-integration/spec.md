# 规约: Agent Integration (Phase 1+2)

> 基于 `docs/design/agent-integration.md` 的 MVP 实现

## 背景

DocPath 需要面向 AI Agent 的接口层，使其能被 Claude Code / OpenCode 等工具原生使用。
设计文档定义了 4 个阶段，本任务聚焦 Phase 1（入口协议）和 Phase 2（Slash 命令包装器）。

## 功能需求

### FR-1: 入口协议文件生成
- `docpath install <target>` 命令为 Claude / OpenCode / Universal 生成协议文件
- 生成目标:
  - **claude**: `.claude/CLAUDE.md` (引用 DocPath 规则)
  - **opencode**: `.opencode/AGENTS.md`
  - **universal**: `.docpath/CLAUDE.md` + `.docpath/AGENTS.md`
- 协议文件引用 DocPath 的工作流、skills、和当前状态

### FR-2: 工作流文档生成
- 在 `.docpath/workflows/` 下生成标准工作流:
  - `boot.md` — 进入项目安全协议
  - `start-task.md` — 启动新任务
  - `l1-light-task.md` — L1 轻量任务
  - `l2-standard-task.md` — L2 标准任务
  - `debug.md` — 结构化调试
  - `handoff.md` — 交接协议

### FR-3: Skills 文档生成
- 在 `.docpath/skills/` 下生成:
  - `workflow-skill.md` — 工作流使用指引
  - `spec-skill.md` — 需求规约技能
  - `tdd-skill.md` — TDD 技能 (Phase 3 启用)
  - `review-skill.md` — 审查技能
  - `debug-skill.md` — 调试技能

### FR-4: Slash 命令包装器 (Phase 2)
- 生成 `.claude/commands/docpath-*.md` 文件:
  - `docpath-boot.md`, `docpath-start.md`, `docpath-next.md`
  - `docpath-check.md`, `docpath-review.md`, `docpath-handoff.md`
- 可选生成 `.opencode/commands/` 等效文件

### FR-5: Agent 指令输出增强
- `docpath status --agent` 输出机器可读 YAML (state/next_action/recommended_command/required_context)
- `docpath context --agent` 输出当前上下文摘要

## 约束

- 保持 DocPath 轻量，不引入重依赖
- Phase 1/2 仅生成文件，不做硬性门禁
- 工作流文档应自描述，Agent 读一个文件即可执行
- `docpath init` 保持现有功能，`install` 是独立命令

## 验收标准

- [ ] `docpath install claude` 生成 `.claude/CLAUDE.md` + workflow + skills + commands
- [ ] `docpath install opencode` 生成 `.opencode/AGENTS.md` + workflow + skills + commands
- [ ] `docpath install universal` 生成通用协议文件
- [ ] `docpath status --agent` 输出 YAML 格式状态
- [ ] 生成的工作流文档内容完整、自描述
- [ ] `pnpm typecheck && pnpm build` 通过
- [ ] 现有命令行为不退化
