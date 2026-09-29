---
related:
  - design/refactor-doc-management-plan.md
  - architecture/documentation-lifecycle-guide.md
---

# 项目文档放置决策

## Decision

DocPath 项目中的人类真源与 Agent 工作流真源**分开放置**，边界如下：

- **`docs/`** —— 供产品、工程、干系人直接阅读的**人类项目真源**。
- **`.docpath/`** —— Agent 工作流真源（规则、任务状态、证据），由 DocPath 命令持有。

这条边界回答的是「一份项目文档该放哪里」。它与任何具体工作流功能无关，
在需求梳理、任务执行、归档各阶段均适用。

## `docs/` —— 人类项目真源

- `docs/README.md`：活文档中心入口与索引。
- `docs/requirements.md`：已拍板的需求真源。*（约定路径；当前项目未启用）*
- `docs/architecture/`：系统架构与跨模块设计说明。
- `docs/design/`：命令契约、工件模型等设计文档。
- `docs/features/`：面向使用者的功能说明。
- `docs/workflows/`：工作流策略与工件策略。
- `docs/error-codes.md`：错误码对照表。

可选，仅在复杂度需要时创建：

- `docs/phase-<n>-development-scope.md`：阶段范围基线，描述阶段目标、
  纳入/排除范围、能力分组、依赖、mock/真实边界与 backlog 拆分锚点。
  它是 backlog 生成的输入，**不是任务队列**，不得承载执行状态。
  *（约定路径；当前项目未启用）*
- `docs/open-questions.md`：当开放问题需要在需求文档之外独立跟踪
  owner/status 时使用。*（约定路径；当前项目未启用）*
- `docs/decisions/*.md`：当重大决策需要独立讨论历史时使用；最终架构结论
  仍须汇总进 ADR。*（约定路径；当前项目未启用）*

## `.docpath/` —— Agent 工作流真源

- `.docpath/rules/architecture.md`：架构真源，含模块边界、依赖方向、ADR、
  禁止跨越的边界。
- `.docpath/rules/style.md`：项目特有的编码差异约定（可选）。
- `.docpath/backlog/`：结构化需求池。
- `.docpath/tasks/`：任务证据（spec / plan / review / journal）。
- `.docpath/workspace/`：运行时状态与渲染视图。

## Boundaries

- **不把 checklist、handoff、phase backlog 草稿当作必需项目工件。**
  门的执行由 DocPath check 机器化保证；持久项目事实归属
  `requirements.md` 或 `architecture.md`。
- **backlog 质量在结构化 backlog 条目上校验**，不靠散落的 md 草案。
- **运行时状态不得手写**（`state.json` / `current.md` / `breadcrumb.md`）。
- 进入开发前，项目级需求梳理的最小交付包是两件套：
  `requirements.md`（已拍板需求真源）与 `architecture.md`
  （模块边界、依赖方向、ADR、禁止事项）。`open-questions.md`、
  `decisions/*.md`、`style.md` 仅在复杂度需要时拆出。

## 现状核对（2026-09-23）

| 约定路径 | 状态 |
| --- | --- |
| `docs/requirements.md` | 未启用 |
| `docs/phase-<n>-development-scope.md` | 未启用 |
| `docs/open-questions.md` | 未启用 |
| `docs/decisions/*.md` | 未启用 |
| `.docpath/rules/architecture.md` | ✅ 在用 |
| `.docpath/rules/style.md` | ✅ 在用 |

未启用的路径是**可选约定**，不是缺失项：本项目当前以 `docs/` 下的
`design/` / `features/` / `architecture/` 等活文档承载人类真源，
以 `.docpath/rules/` 承载 Agent 真源，已满足本决策的边界要求。

## Provenance

本决策原为 `docs/design/project-intake-artifact-model.md` 的
"Project Document Placement" 一节，与已下线的 `docpath project`
平行工作流（2026-09-08 移除）同处一份文档。该工作流下线后，
本节作为**独立于该功能的通用放置决策**被提炼保留，intake 专属内容
（目录布局、状态机、命令契约、溯源模型）随原文档一并删除。
