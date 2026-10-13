---
related:
  - getting-started.md
  - product-panorama.md
---

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
* [文档全生命周期管理与演进体系](./architecture/documentation-lifecycle-guide.md) — 架构文档、ADR 决策、活文档防腐与全景时间线还原规范。
* [Breadcrumb 任务级优先架构](./architecture/breadcrumb-task-level-architecture.md) — 单一真源与任务级上下文生命周期。
* [状态机正确性分析](./design/state-machine-correctness-analysis.md) — 状态转移与不可变门禁设计。
* [命令边界模型](./design/command-boundaries.md) — CLI 命令的输入输出与副作用边界。

### 2. 功能与特性 (Features)
* [Backlog 需求工程与全生命周期管理](./features/backlog-lifecycle.md) — 声明式需求卡片、四段式规整、依赖拓扑分析、全周期检索与自动治理。
* [测试影响分析与智能门禁加速体系](./features/test-impact-analysis.md) — 调试期单用例定向测试、构建感知自愈与单次全量原子收口。
* [架构分层与依赖防腐守卫](./features/architecture-guard.md) — 6 层单向依赖规则模型、AST 循环依赖扫描与 `arch check` 体检。
* [Git Worktree 并发工作流](./features/worktree-workflow.md) — 多 Agent 并发开发与资源隔离模型。
* [任务热暂存与无缝恢复 (Task Stash)](./features/task-stash.md) — 工作区即时热暂存、弹出与原子切换。
* [会话隔离设计 (Session Isolation)](./design/session-isolation-mvp.md) — 多会话并发执行与状态隔离。
* [经验沉淀与持续学习机制](./features/knowledge-accumulation.md) — 经验捕获、候选清洗、规则固化与智能消费闭环。

### 3. 工作流与工件策略 (Workflows & Policies)
* [工件策略与阶段门禁](./workflows/artifact-policy.md) — Spec/Plan/Evidence 工件生命周期与存储规范。
* [项目文档放置决策](./design/project-document-placement.md) — 人类真源 (`docs/`) 与 Agent 工作流真源 (`.docpath/`) 的边界。

### 4. 接入与协议 (Integrations)
* [Codex / Claude / OpenCode 适配](./integrations/codex-skill-adapter.md) — 多平台 Agent 协议与 Skill 适配。
* [Agent 集成总览](./design/agent-integration.md) — Agent 生命周期与上下文分发机制。

### 5. 开发者与上手指南 (Guides)
* [快速上手 (Getting Started)](./getting-started.md) — 从安装到首次任务开发。
* [构建与测试 (Build & Test)](./BUILD.md) — 本地构建、单测、端到端测试流程。
* [多技术栈定向测试与门禁效能最佳实践](./guides/multi-stack-testing-efficiency.md) — 跨技术栈（Node/Go/Rust/Python/Java）调试期定向测试与收口门禁去重规范。
* [错误码与排错 (Error Codes)](./error-codes.md) — 常见报错原因与恢复指引。

---

## 文档体系分层与沉淀原则

DocPath 严格区分 **4 层文档资产**，避免运行时噪音与知识腐化：

| 层级 | 路径 | 核心职责 | 消费方式 |
| :--- | :--- | :--- | :--- |
| **1. 实时规则与防踩坑** | `.docpath/rules/` | Agent 编码硬约束与高频 Gotcha 避坑（防犯错） | 每次任务必读 / 自动注入 |
| **2. 活项目文档** | `docs/` | 业务全景、模块契约、架构设计（随代码演进） | 按需查阅 / 主题检索 |
| **3. 任务需求池** | `.docpath/backlog/` | 需求卡片与演进追踪 | 任务立项时消费 |
| **4. 过程态与审计日志** | `.docpath/tasks/done/` & `workspace/` | 任务历史快照与执行审计（冷存储） | 问题回溯时查阅 |
<!-- docpath:block docs-index -->
<!-- 由 `docpath docs graph --fix` 自动生成；块外内容手工维护，请勿编辑本机器区 -->

## 文档关联图谱 (docs graph)

> 全部 29 篇文档，按目录分类；出/入为 docs graph 关联计数。孤立 = 无出链且无入链。

### docs/

- [docs/BUILD.md](./BUILD.md) — Build Guide — 出 2 / 入 2
- [docs/error-codes.md](./error-codes.md) — DocPath 错误码参考 — 出 2 / 入 2
- [docs/getting-started.md](./getting-started.md) — DocPath Getting Started — 出 3 / 入 5
- [docs/product-panorama.md](./product-panorama.md) — DocPath 产品全景文档 (Product Panorama) — 出 2 / 入 3
- [docs/README.md](./README.md) — DocPath 架构与项目文档中心 — 出 2 / 入 0
- [docs/roadmap.md](./roadmap.md) — DocPath — 进度与方向 — 出 4 / 入 0

### docs/architecture/

- [docs/architecture/agent-context-injection-architecture.md](./architecture/agent-context-injection-architecture.md) — Agent 零点击上下文随路注入与智能路由体系架构 — 出 3 / 入 3
- [docs/architecture/breadcrumb-task-level-architecture.md](./architecture/breadcrumb-task-level-architecture.md) — Breadcrumb 任务级优先架构 — 出 2 / 入 3
- [docs/architecture/documentation-lifecycle-guide.md](./architecture/documentation-lifecycle-guide.md) — DocPath 文档全生命周期管理规范与演进体系 — 出 2 / 入 3
- [docs/architecture/tool-evaluation-2026-06.md](./architecture/tool-evaluation-2026-06.md) — DocPath 工具评估报告 — 出 2 / 入 1

### docs/design/

- [docs/design/agent-integration.md](./design/agent-integration.md) — DocPath 2.0 Design: Agent Integration — 出 2 / 入 2
- [docs/design/command-boundaries.md](./design/command-boundaries.md) — DocPath Command Boundaries — 出 2 / 入 2
- [docs/design/project-document-placement.md](./design/project-document-placement.md) — 项目文档放置决策 — 出 2 / 入 2
- [docs/design/refactor-doc-management-plan.md](./design/refactor-doc-management-plan.md) — 重构方案：docpath 转型为「文档管理 + 沉淀 + 一致性校验」 — 出 2 / 入 3
- [docs/design/session-isolation-mvp.md](./design/session-isolation-mvp.md) — Session Isolation MVP — 出 2 / 入 2
- [docs/design/state-machine-correctness-analysis.md](./design/state-machine-correctness-analysis.md) — 状态机正确性分析 (R-203) — 出 2 / 入 1

### docs/features/

- [docs/features/architecture-guard.md](./features/architecture-guard.md) — 架构分层与依赖防腐守卫 (Architecture Layers & Guardrails) — 出 2 / 入 2
- [docs/features/backlog-lifecycle.md](./features/backlog-lifecycle.md) — Backlog 需求工程与全生命周期管理 (Backlog Lifecycle & Engineering) — 出 2 / 入 4
- [docs/features/context-budget-governance.md](./features/context-budget-governance.md) — 上下文 Token 预算透视与健康度治理引擎 — 出 2 / 入 1
- [docs/features/knowledge-accumulation.md](./features/knowledge-accumulation.md) — 经验沉淀与持续学习机制 (Knowledge Accumulation) — 出 2 / 入 4
- [docs/features/living-docs-workflow.md](./features/living-docs-workflow.md) — DocPath 活文档防腐与 Agent 协议联动系统 — 出 0 / 入 2
- [docs/features/milestone-lifecycle.md](./features/milestone-lifecycle.md) — Milestone 里程碑目标规划与闭环管理 (Milestone Lifecycle & Management) — 出 2 / 入 0
- [docs/features/task-stash.md](./features/task-stash.md) — 任务热暂存与上下文恢复 (Task Stash & Switch) — 出 2 / 入 2
- [docs/features/test-impact-analysis.md](./features/test-impact-analysis.md) — 测试影响分析与智能门禁加速体系 (Test Impact Analysis & Smart Gates) — 出 2 / 入 2
- [docs/features/worktree-workflow.md](./features/worktree-workflow.md) — Agent-neutral Git Worktree 并发开发 - 使用指南 — 出 2 / 入 3

### docs/guides/

- [docs/guides/multi-stack-testing-efficiency.md](./guides/multi-stack-testing-efficiency.md) — 多技术栈定向测试与门禁效能最佳实践 — 出 2 / 入 2
- [docs/guides/project-init-prompt.md](./guides/project-init-prompt.md) — 新建项目 DocPath 初始化 Prompt（复制即用） — 出 1 / 入 0

### docs/integrations/

- [docs/integrations/codex-skill-adapter.md](./integrations/codex-skill-adapter.md) — Codex Skill Adapter — 出 2 / 入 2

### docs/workflows/

- [docs/workflows/artifact-policy.md](./workflows/artifact-policy.md) — DocPath Artifact Generation Policy — 出 2 / 入 1

<!-- /docpath:block -->
