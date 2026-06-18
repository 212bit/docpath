# 执行计划

## 依赖关系图

```
S1 → S2 → S3 → S4 → S5 → S6 → S7
```

---

### S1: 新增 `install` 命令框架
- **描述**: 在 `src/commands/install.ts` 创建 `docpath install <target>` 命令，支持 claude/opencode/universal 三个目标。注册到 `src/index.ts` CLI。
- **验收条件**: `docpath install --help` 可用，能识别 target 参数，空跑不报错
- **依赖**: 无
- **预估**: 20 分钟

### S2: 实现模板内容 — 工作流文档
- **描述**: 创建 `templates/workflows/` 目录，编写 6 个工作流模板: boot.md, start-task.md, l1-light-task.md, l2-standard-task.md, debug.md, handoff.md
- **验收条件**: 每个模板内容完整自描述，覆盖标准流程步骤
- **依赖**: S1
- **预估**: 40 分钟

### S3: 实现模板内容 — Skills 文档
- **描述**: 创建 `templates/skills/` 目录，编写 5 个 skill 模板: workflow-skill.md, spec-skill.md, tdd-skill.md, review-skill.md, debug-skill.md
- **验收条件**: 每个 skill 文档描述清晰，包含触发条件、步骤、输出
- **依赖**: S1
- **预估**: 30 分钟

### S4: 实现模板内容 — 入口协议与 Slash 命令
- **描述**: 创建 `templates/protocols/` (CLAUDE.md, AGENTS.md) 和 `templates/commands/` (6 个 docpath-*.md) 模板。模板支持 target 变量替换。
- **验收条件**: 模板内容正确引用 DocPath 工作流和 skills
- **依赖**: S2, S3
- **预估**: 30 分钟

### S5: install 命令完整实现
- **描述**: 在 `install.ts` 中实现: 根据 target 参数，复制协议/工作流/skills/commands 模板到项目对应目录。支持 `--force` 覆盖。加入项目检测 (复用 detect.ts)。
- **验收条件**: `docpath install claude` 在干净项目中正确生成所有文件；重复运行提示已存在
- **依赖**: S4
- **预估**: 30 分钟

### S6: Agent 指令输出增强 ✅
- **描述**: 给 `status` 和 `context` 命令添加 `--agent` flag，输出 YAML 格式机器可读状态 (state/next_action/recommended_command/required_context/must_update/exit_criteria)
- **验收条件**: `docpath status --agent` 输出合法 YAML，包含 next_action 字段
- **依赖**: S5
- **预估**: 25 分钟
- **提交**: 6bb9e28

### S7: 验证与文档
- **描述**: 端到端验证: 在 temp 目录测试 `install claude/opencode/universal`，确认生成文件正确。更新 README。运行 `pnpm typecheck && pnpm build`。运行 `docpath check`。
- **验收条件**: 所有 install 目标生成正确；typecheck/build 通过；无退化
- **依赖**: S6
- **预估**: 20 分钟

---

## 总预估: ~3 小时 (175 分钟)
