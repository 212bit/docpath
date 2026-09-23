# DocPath 架构与项目文档中心

> 本目录为 DocPath 项目的**持久化活文档（Living Docs）**真源。面向人类开发者与 Agent，沉淀系统的全景架构、核心功能、设计决策与开发指南。

---

## 目录全景 (Taxonomy)

```
docs/
├── architecture/          # 系统整体架构、核心设计、状态机模型
├── features/              # 按业务与核心功能模块划分的活文档
├── design/                # 深度设计提案与演进分析 (Design Specs)
├── workflows/             # 工作流规范、工件策略与门禁
├── integrations/          # 多平台/多 Agent 协议适配指南
├── getting-started.md     # 快速上手与使用教程
├── product-panorama.md    # 产品全景与能力矩阵
├── error-codes.md         # 错误码与排错指南
└── BUILD.md               # 构建与测试指南
```

---

## 快速导航

### 1. 系统架构 (Architecture)
* [Agent 零点击上下文随路注入与智能路由体系架构](./architecture/agent-context-injection-architecture.md) — 零点击随路下发、路径亲和性路由、Token 预算熔断与防破坏架构不变量。
* [文档全生命周期管理与演进体系](file:///Users/mac/project/docpath/docs/architecture/documentation-lifecycle-guide.md) — 架构文档、ADR 决策、活文档防腐与全景时间线还原规范。
* [Breadcrumb 任务级优先架构](file:///Users/mac/project/docpath/docs/architecture/breadcrumb-task-level-architecture.md) — 单一真源与任务级上下文生命周期。
* [状态机正确性分析](file:///Users/mac/project/docpath/docs/design/state-machine-correctness-analysis.md) — 状态转移与不可变门禁设计。
* [命令边界模型](file:///Users/mac/project/docpath/docs/design/command-boundaries.md) — CLI 命令的输入输出与副作用边界。

### 2. 功能与特性 (Features)
* [Git Worktree 并发工作流](file:///Users/mac/project/docpath/docs/features/worktree-workflow.md) — 多 Agent 并发开发与资源隔离模型。
* [会话隔离设计 (Session Isolation)](file:///Users/mac/project/docpath/docs/design/session-isolation-mvp.md) — 多会话并发执行与状态隔离。
* [经验沉淀与持续学习机制](file:///Users/mac/project/docpath/docs/features/knowledge-accumulation.md) — 经验捕获、候选清洗、规则固化与智能消费闭环。

### 3. 工作流与工件策略 (Workflows & Policies)
* [工件策略与阶段门禁](file:///Users/mac/project/docpath/docs/workflows/artifact-policy.md) — Spec/Plan/Evidence 工件生命周期与存储规范。
* [项目文档放置决策](./design/project-document-placement.md) — 人类真源 (`docs/`) 与 Agent 工作流真源 (`.docpath/`) 的边界。

### 4. 接入与协议 (Integrations)
* [Codex / Claude / OpenCode 适配](file:///Users/mac/project/docpath/docs/integrations/codex-skill-adapter.md) — 多平台 Agent 协议与 Skill 适配。
* [Agent 集成总览](file:///Users/mac/project/docpath/docs/design/agent-integration.md) — Agent 生命周期与上下文分发机制。

### 5. 开发者与上手指南 (Guides)
* [快速上手 (Getting Started)](file:///Users/mac/project/docpath/docs/getting-started.md) — 从安装到首次任务开发。
* [构建与测试 (Build & Test)](file:///Users/mac/project/docpath/docs/BUILD.md) — 本地构建、单测、端到端测试流程。
* [错误码与排错 (Error Codes)](file:///Users/mac/project/docpath/docs/error-codes.md) — 常见报错原因与恢复指引。

---

## 文档体系分层与沉淀原则

DocPath 严格区分 **4 层文档资产**，避免运行时噪音与知识腐化：

| 层级 | 路径 | 核心职责 | 消费方式 |
| :--- | :--- | :--- | :--- |
| **1. 实时规则与防踩坑** | `.docpath/rules/` | Agent 编码硬约束与高频 Gotcha 避坑（防犯错） | 每次任务必读 / 自动注入 |
| **2. 活项目文档** | `docs/` | 业务全景、模块契约、架构设计（随代码演进） | 按需查阅 / 主题检索 |
| **3. 任务需求池** | `.docpath/backlog/` | 需求卡片与演进追踪 | 任务立项时消费 |
| **4. 过程态与审计日志** | `.docpath/tasks/done/` & `workspace/` | 任务历史快照与执行审计（冷存储） | 问题回溯时查阅 |
