# 规约: Phase 2 — 动态升级引擎与 GSD 上下文编排

**任务 ID**: T-20260528-p2
**状态**: 已确认

## 1. 背景与动机

DocPath Phase 1 完成了核心骨架搭建：`docpath:init` 初始化、四级状态机定义、复杂度评估器。但缺少两个关键的 Level 2 能力：

1. **文档流转链条不通**：从 spec → plan 需要手动写文档，没有工具辅助
2. **上下文无法断点续接**：会话中断后没有机制恢复进度
3. **复杂度误判无兜底**：Level 1 执行中发现问题变复杂，没有升级通道

Phase 2 解决这三个痛点，打通 Level 2 的完整工作流。

## 2. 需求清单

### 功能需求

#### FR-1: docpath:brainstorm 命令
- [ ] FR-1.1: 从用户输入的任务描述出发，调用 LLM 进行 Socratic 式需求拷问
- [ ] FR-1.2: 输出标准 `spec.md` 到 `tasks/T-{id}/spec.md`
- [ ] FR-1.3: 支持指定任务标题和初始描述作为参数
- [ ] FR-1.4: 输出后自动更新 `current.md` 状态为 `spec_written`

#### FR-2: docpath:plan 命令
- [ ] FR-2.1: 读取 `spec.md` 内容，自动拆解为原子级子任务
- [ ] FR-2.2: 输出标准 `plan.md` 到 `tasks/T-{id}/plan.md`
- [ ] FR-2.3: 每个子任务包含：标题、涉及文件、依赖关系、预计工作量
- [ ] FR-2.4: 输出后自动更新 `current.md` 状态为 `planning`

#### FR-3: docpath:continue 命令
- [ ] FR-3.1: 读取 `workspace/breadcrumb.md` 恢复执行上下文
- [ ] FR-3.2: 展示当前进度摘要：已完成/进行中/下一步
- [ ] FR-3.3: 输出可执行的下一步指令

#### FR-4: 动态中途升级引擎
- [ ] FR-4.1: 在 `current.md` 中设计熔断器字段（`escalation.signals`）
- [ ] FR-4.2: Level 1 执行中检测到：文件数 > 3 / 涉及新模块 / 需要设计决策 → 自动触发升级
- [ ] FR-4.3: 升级后自动启动 `docpath:brainstorm` 补全 spec

#### FR-5: GSD 面包屑协议
- [ ] FR-5.1: 定义 `breadcrumb.md` 的标准写入格式
- [ ] FR-5.2: 每次子任务完成后自动更新面包屑
- [ ] FR-5.3: 面包屑包含：已完成步骤清单、下一步快照、关键上下文

### 非功能需求
- [ ] NFR-1: 所有命令支持 `--help` 查看完整用法
- [ ] NFR-2: CLI 输出使用 @clack/prompts 保持一致风格
- [ ] NFR-3: LLM 调用支持可配置端点（兼容 Claude API 和兼容接口）

## 3. 范围界定

### 包含
- docpath:brainstorm / plan / continue 三个全新命令
- 升级引擎的熔断逻辑
- breadcrumb 写入/读取协议
- LLM 调用集成（抽象一层接口，不绑定特定模型）

### 不包含
- Phase 3 的 TDD 强制纪律和 code review
- Phase 3 的 journal 归档
- Phase 4 的 token 优化和 npm 发布

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | LLM 集成方式 | 直接调用 Claude API vs 抽象 LLM 接口 | 抽象 LLM 接口 | 兼容不同后端，DocPath 自身也应遵循渐进式原则 |
| 2 | brainstorm 交互模式 | 一问一答 vs 一次输出 | 一问一答 | Superpowers 的 Socratic 风格更彻底，减少误解 |
| 3 | breadcrumb 格式 | YAML frontmatter vs Markdown 纯文本 | YAML frontmatter + Markdown body | 机器可解析 + 人类可读 |
| 4 | 升级引擎触发方式 | 被动（CLI 轮询）vs 主动（Claude 写文件触发） | 主动写标记文件 | 不消耗额外 Token，Claude 自己决定何时升级 |

## 5. 验收标准

- [ ] AC-1: `docpath:brainstorm "为项目添加日志功能"` → 输出完整 spec.md，包含 5+ 轮交互对话
- [ ] AC-2: `docpath:plan T-xxx` → 从 spec.md 生成 plan.md，含 3+ 个子任务
- [ ] AC-3: `docpath:continue` → 读取面包屑并输出可执行的下一条指令
- [ ] AC-4: 熔断升级：在 temp 项目创建 Level 1 任务，执行中创建 4 个文件 → 触发升级信号
- [ ] AC-5: breadcrumb.md 更新后，docpath:continue 能正确读取进度

---

*此文件由 DocPath brainstrom 阶段生成。下一阶段：docpath:plan → plan.md*
