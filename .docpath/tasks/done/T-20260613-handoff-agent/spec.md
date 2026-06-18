# T-20260613-prompt-omx - 实现 docpath prompt --style omx

## 1. 背景与动机

现在 `docpath status --agent` 输出的是 YAML 格式，Agent 需要自己解析。OMX 使用结构化 Markdown prompt，包含当前状态、上下文索引、推荐动作。

**目标**：新增 `docpath prompt` 命令，输出 OMX 风格的结构化 Markdown prompt，让 Agent 可以直接使用。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型
- [ ] FR-2: 输出格式为结构化 Markdown，包含：当前状态（Phase/Gate/Progress）、上下文索引（Trunk/Leaves）、推荐动作（Next Action/Command）、必需文件、当前焦点
- [ ] FR-3: 在 `src/cli.ts` 中注册命令，命令名 `prompt`，描述"输出结构化 prompt（支持 OMX 风格）"，选项 `--style <omx>`（默认 `omx`）

### 非功能需求

- NFR-1: 不改动现有状态机逻辑
- NFR-2: 不改动 `agent-output.ts` 的输出格式
- NFR-3: 输出是纯 Markdown，不是 YAML
- NFR-4: 复用现有数据结构，不重复计算

## 3. 范围界定

**包含**：
- 新增 `src/commands/prompt.ts` 文件
- 在 `src/cli.ts` 中注册 `prompt` 命令
- 输出 OMX 风格的 Markdown

**不包含**：
- 修改 `agent-output.ts` 的逻辑
- 支持其他 style（如 `universal`、`codex`）— 留作后续扩展
- 运行时注入 hooks（留作后续增强）

## 4. 关键决策

- D-1: 格式设计 — 使用 Markdown 二级标题（`##`）分隔 section，使用列表（`-`）展示文件和索引，使用代码块（`` ` ``）高亮命令
- D-2: 数据复用 — 调用 `generateAgentOutput()` 获取数据，解析 YAML → AgentOutput 对象，格式化为 Markdown
- D-3: 扩展性 — `--style` 参数为后续支持其他风格预留扩展点，现阶段只实现 `omx` 风格

## 5. 验收标准

- [ ] AC-1: 命令可执行：`docpath prompt --style omx`
- [ ] AC-2: 输出是结构化 Markdown，包含 5 个 section（状态、上下文索引、推荐动作、必需文件、当前焦点），格式清晰，Agent 可以直接理解
- [ ] AC-3: 数据正确，与 `docpath status --agent` 的数据一致，但输出格式是 Markdown 而不是 YAML
- [ ] AC-4: 不影响现有命令，`docpath status --agent` 输出不变，`agent-output.ts` 逻辑不变
