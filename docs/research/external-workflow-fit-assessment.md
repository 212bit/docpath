# 外部参考项目能力 DocPath Fit Assessment

> 任务: R-146 / T-20260609-docpath-fit-assessment  
> 日期: 2026-06-09  
> 评估对象: TreeX-X/WorkFlowX、ReJeCtAll/ExpertTeam-Codex  
> 目的: 判断 R-142~R-145 是否应进入 DocPath 核心实现，以及应如何拆分、降级或后置。

## 1. 结论摘要

DocPath 可以吸收外部项目的部分能力，但不应照搬它们的产品形态。

WorkFlowX 更像一个多 Agent 编排配置包，强调 orchestrator、Payload、Hybrid Tree、Worktree 隔离、AC 交叉验证和 token 优化。ExpertTeam-Codex 更像 Codex Skill/Agent 模板包，强调 expert team 路由、团队 Lead、角色职责和可复用专家流程。它们共同证明了两个方向有价值：第一，角色化上下文能降低 Agent 任务理解成本；第二，结构化 Payload 和分层索引能减少上下文污染。

但 DocPath 的核心不是 Prompt/Skill 包，而是文档状态机、CLI 路由、质量门禁和证据闭环。外部能力只有在满足以下条件时才适合进入核心：

- 不绕过 `spec -> plan -> go -> check -> review -> journal`。
- 不新增不可验证的隐式 Agent 流程。
- 所有专家、Payload、交付物、评估结果都必须落盘或进入任务证据索引。
- `status`、`next`、`check`、`review` 必须能感知新增状态或证据。
- 角色和模板只增强上下文，不替代 backlog/task/workspace 的状态真源。

推荐处理顺序：

1. 先改写并推进 `R-143`：结构化 Payload 与 Hybrid Tree 压缩索引，但只做 DocPath 原生的 context/evidence 索引，不引入 MCP 记忆图谱作为核心依赖。
2. 再推进 `R-144`：业务交付物模板库与 deliverables 索引，作为落盘产物规范，支撑后续专家角色输出。
3. 再改写推进 `R-142`：Expert Team/Role 模型降级为 role-based context profile，不直接引入多 Agent 自动编排。
4. 最后视 R-142 的实际结果处理 `R-145`：Codex Skill 入口只做适配层，不进入核心 CLI 状态机。

## 2. 参考项目摘要

### 2.1 WorkFlowX

来源: TreeX-X/WorkFlowX README 与 AGENTS.md。  
抓取时间: 2026-06-09 12:51~12:54 JST。  
链接: [TreeX-X/WorkFlowX](https://github.com/TreeX-X/WorkFlowX)、[AGENTS.md](https://github.com/TreeX-X/WorkFlowX/blob/main/AGENTS.md)。

WorkFlowX 的核心形态是“混合文档驱动的多智能体协作框架”。它以 `orchestratorX` 作为唯一文档写入者，子智能体只读上下文并输出结构化 Payload。公开 README 中明确提到能力包括 Bus Payload、Hybrid Tree、Worktree 隔离、AC 交叉验证、promptMasterX、token 优化和跨平台配置。AGENTS.md 进一步要求开发类任务默认委派给 orchestratorX，并将 `xwhole`、`xlocal`、`xunit` 等模式作为自然语言入口。

对 DocPath 有价值的点：

- 单一写入者思想：与 DocPath “状态只能通过生命周期命令更新”的方向一致。
- Payload 通信：适合作为 Agent 产出到 DocPath 证据层的结构化格式。
- Hybrid Tree：适合作为 spec/plan/context 的压缩索引，而不是替代任务状态机。
- AC 交叉验证：与 `check`、`review` 的证据闭环高度兼容。
- 多模式工作流：可借鉴粒度区分，但 DocPath 已有 Level 0~3，不必新增 xwhole/xlocal/xunit 命令。

不适合直接吸收的点：

- 默认所有开发任务走 orchestratorX，会和 DocPath 的 `next --agent` 路由发生入口竞争。
- Worktree 隔离和 MCP 记忆图谱成本较高，不适合作为核心默认能力。
- Prompt/Skill 配置包的安装形态不应取代 DocPath CLI 和 `.docpath/` 文件状态。

### 2.2 ExpertTeam-Codex

来源: ReJeCtAll/ExpertTeam-Codex README。  
抓取时间: 2026-06-09 12:54 JST。  
链接: [ReJeCtAll/ExpertTeam-Codex](https://github.com/ReJeCtAll/ExpertTeam-Codex)、[README.md](https://github.com/ReJeCtAll/ExpertTeam-Codex/blob/main/README.md)。

ExpertTeam-Codex 的核心形态是安装到 `~/.codex` 的专家团配置，面向 Codex CLI / Codex App 的 Skill 调用方式。README 中列出的核心入口包括 `$expert-team`、`$expert-software`、`$expert-design`、`$expert-product`，团队包括软件开发、设计原型和产品战略。仓库结构包括 `.codex/skills`、`.codex/agents`、`.codex/commands`，角色覆盖 software architect、software engineer、QA engineer、product director、requirement analyst、user researcher、competitive analyst、prototype builder 等。

对 DocPath 有价值的点：

- 专家团路由：适合映射为 DocPath role profile，帮助不同任务阶段获得更专业的上下文。
- Lead 编排：适合沉淀为“角色输出必须落盘并由当前任务收口”的规则。
- 角色模板：适合作为安装资产或 context 模板，不一定需要进入状态机核心。
- 质量门禁概念：可映射到 DocPath 的 `check` 和 `review`，避免新增平行门禁。

不适合直接吸收的点：

- 以 `$skill` 为主入口，会和 DocPath 命令入口形成两套调度系统。
- Skill/Agent 文件安装到 `~/.codex` 是平台适配层，不是跨平台 DocPath 核心。
- 专家团流水线容易变成隐式流程，如果不落盘到 spec/plan/review，就无法被 `status` 和 `next` 恢复。

## 3. DocPath 适配原则

这些原则用于判断外部能力是否能进入核心：

| 原则 | 含义 | 违反后的风险 |
|---|---|---|
| 状态机优先 | 所有任务推进仍以 `spec -> plan -> go -> check -> review -> journal` 为主线 | Agent 可能绕过验收，完成状态不可追溯 |
| 单一状态真源 | `.docpath/workspace/state.json`、task、backlog、breadcrumb 是可恢复状态来源 | Skill/Prompt 内部状态无法跨会话恢复 |
| 命令写状态 | 状态变化由 DocPath lifecycle 命令写入，不鼓励手写运行态文件 | current/workspace 漂移，check 无法校验 |
| 产物落盘 | PRD、Payload、角色报告、deliverable、review 结论必须写入文件或证据索引 | 专家输出停留在聊天中，后续 Agent 无法接续 |
| 门禁复用 | 新能力复用 `check`、`review`、`journal`，不新增平行质量体系 | 用户需要记住多套完成标准 |
| 渐进暴露 | 角色和索引用于裁剪上下文，不默认塞满所有模板 | Token 成本上升，Agent 注意力稀释 |
| 平台适配后置 | Codex/Claude/OpenCode 入口通过安装资产适配，核心不绑定单一 Agent 平台 | DocPath 失去跨 Agent 协议价值 |

## 4. 候选能力评估矩阵

| 候选能力 | 来源 | 解决的问题 | DocPath 现状 | 状态机兼容性 | 收益 | 成本 | 风险 | 结论 |
|---|---|---|---|---|---|---|---|---|
| Expert Team/Role | ExpertTeam-Codex | 单助手缺少专业分工，复杂任务缺少产品/设计/工程/QA视角 | 有 Level、spec、plan、review，但没有角色化上下文 | 中。作为 context profile 兼容；作为自动多 Agent 编排不兼容 | 中高。提升复杂任务分析质量，降低用户表达成本 | 中。需要 role registry、模板、安装资产和测试 | 可能形成绕过 plan/check 的隐式专家流程 | 改写保留。先做 role-based context profile，不做自动编排 |
| role-based context | ExpertTeam-Codex、WorkFlowX | 不同角色需要不同任务视图，避免所有 Agent 看到同一大上下文 | `agent enter` 只有通用 context；dashboard 有多视角但不是 role context | 高。可由 state/spec/plan/evidence 渲染，不改变状态 | 高。对 Agent 恢复和专业审查直接有用 | 中。需要上下文渲染器和未知角色 fail-loud | 模板过多会增加维护成本 | 保留，作为 R-142 的 MVP 核心 |
| Payload | WorkFlowX | 子 Agent 输出自由文本，难以收集、验证和继续执行 | breadcrumb、last-check、review 已结构化一部分，但缺少统一 Agent 输出 Payload | 高。Payload 可以作为 evidence，不改变主 FSM | 高。支撑专家输出、变更摘要、评估结果落盘 | 中。需要 schema、解析、fail-loud 和文档 | schema 过早冻结会限制真实使用 | 优先推进，作为 R-143 的核心 |
| Hybrid Tree/token 压缩索引 | WorkFlowX | 长 spec/plan/docs 造成上下文膨胀，Agent 难以按需读取 | 已有 progressive context、docs index、dashboard docs 预览，但缺少面向任务的压缩索引 | 中高。作为 context 索引兼容；作为外部记忆图谱核心依赖不兼容 | 高。直接改善跨会话和大任务上下文效率 | 中高。需要索引格式、生成策略和漂移检测 | 过度索引会让文档系统变重 | 改写保留。先做文件内 Hybrid Tree，不引入 MCP 记忆图谱核心依赖 |
| Deliverables 模板 | ExpertTeam-Codex | 产品/设计/工程产物格式不稳定，交付物难复用 | spec/plan/review/journal 是流程文档，不覆盖 PRD、竞品、原型审查等业务交付物 | 高。deliverables 可挂到 task evidence，不改 FSM | 中高。让专家角色产出可验收、可索引 | 中。需要模板目录、索引和 check 覆盖 | 模板库膨胀，变成文档 CMS | 保留。R-144 可先做轻量模板和 deliverables 索引 |
| Codex Skill 入口 | ExpertTeam-Codex | Codex 用户希望通过 `$skill` 快速调用专家团 | DocPath 已有安装资产和 Codex/Claude/OpenCode 协议模板 | 中。作为适配层兼容；作为核心入口不兼容 | 中。改善 Codex 使用体验 | 低中。主要是模板和安装 manifest | 绑定 Codex，弱化跨平台定位 | 后置。依赖 R-142，作为 R-145 适配层 |
| AC 交叉验证 | WorkFlowX | 实现者自评不可靠，需要独立验证验收标准 | DocPath 已有 `check` 和 `review`，但 review 可以更结构化对照 AC | 高。可增强 review，不需要新增流程 | 高。提高完成质量和证据可信度 | 中。需要 review 输出结构和测试 | 与现有 review 重叠 | 吸收到 review/check 规则，不单独开大任务 |
| Worktree 隔离 | WorkFlowX | 多 Agent 并行修改时避免文件冲突 | DocPath 当前偏单活跃任务，已有 git dirty/check 关注 | 低中。并行执行不是当前核心 | 中。对复杂并行任务有价值 | 高。涉及 git worktree、冲突检测、恢复 | 显著增加复杂度和误操作风险 | 暂缓。可作为未来并行 Agent 研究，不进入 R-142~R-145 |
| Prompt 优化引擎 | WorkFlowX | 原始需求提示质量不稳定 | DocPath 有 brainstorm/refine/spec/plan，而不是通用 prompt 工具 | 低中。容易偏离 DocPath 产品边界 | 中。对外部 Agent 有帮助 | 中 | 变成通用 prompt 产品 | 拒绝进入核心，可作为外部 skill 或文档建议 |

## 5. R-142~R-145 处理建议

### R-142: 引入 Expert Team/Role 模型与 role-based context

建议: 保留但改写范围。

R-142 不应实现“专家团自动调度系统”。MVP 应该实现 DocPath 原生的 role registry 和 role-based context 渲染：

- `docpath roles list` 或等价入口列出团队和角色。
- `docpath roles context <role>` 从当前 state/spec/plan/check/review/backlog 渲染角色视图。
- 角色输出要求写入 task evidence 或 deliverables，不允许只停留在对话。
- 内置 role 以 product/design/software/qa 为主，但模板数量要克制。
- 未知 role 必须 fail-loud。

推荐新增 Decision Brief 后再实现，因为它涉及 Agent 行为和长期维护成本。

### R-143: 引入结构化 Payload 与 Hybrid Tree 压缩索引

建议: 提前推进，作为 R-142 的基础设施。

R-143 的高信心部分是 Payload 和 context 索引。它能为 role-based context、deliverables、review evidence 提供共同底座。建议拆成两层：

- 第一层: `Payload` schema，覆盖 change summary、role report、evaluation result、requirement change。
- 第二层: `Hybrid Context Index`，从 spec/plan/docs/evidence 生成任务级目录和摘要，不引入外部 MCP 记忆图谱作为默认依赖。

这项能力与 DocPath 的状态机兼容性较高，且能提升现有 `agent enter`、`next`、`review` 的上下文质量。

### R-144: 增加业务交付物模板库与 deliverables 索引

建议: 保留并在 R-143 之后推进。

R-144 应定义“专家角色产物如何落盘”。它不应成为大型模板 CMS，而应先支持少量高频 deliverables：

- PRD / requirement brief
- architecture brief
- QA review report
- competitive analysis
- prototype review
- stakeholder update

每个 deliverable 应有 task 链接、来源 role、生成时间、验收状态和 evidence 指针。`check` 应能发现 active/done 任务中声明但缺失的 deliverables。

### R-145: 增加 Codex Skill 适配器封装 DocPath 专家团入口

建议: 后置，依赖 R-142。

R-145 只能是安装资产/适配层，不能成为核心入口。它的职责是把 Codex `$skill` 调用映射到 DocPath 的 CLI 和 context profile，例如：

- `$docpath-expert-team` 说明如何选择 role。
- `$docpath-role-software-architect` 调用或提示用户运行 `docpath roles context software-architect`。
- Skill 内容必须强调状态机边界和证据落盘。

如果 R-142 尚未实现 role registry，R-145 应阻塞。

## 6. 推荐执行顺序

| 顺序 | backlog | 动作 | 原因 |
|---|---|---|---|
| 1 | R-143 | 改写并 promote | Payload/Hybrid Context 是后续角色和交付物的共同底座 |
| 2 | R-144 | promote | 先定义专家输出如何落盘，避免 R-142 产出只停留在聊天 |
| 3 | R-142 | 改写后 promote | 在已有 Payload 和 deliverables 约束下实现 role-based context，风险更低 |
| 4 | R-145 | 等 R-142 完成后再 promote | Codex Skill 是平台适配，不应领先核心能力 |

## 7. 不建议进入核心的内容

- 默认所有开发任务走单一外部 orchestrator。
- 多 Agent 并行 worktree 执行。
- MCP 记忆图谱作为默认核心依赖。
- 通用 prompt 优化产品。
- 独立于 `check/review` 的新质量门禁体系。
- 只存在于 Skill/Prompt 内部、无法被 DocPath 状态恢复的专家流程。

## 8. 后续落地判定规则

后续任何吸收外部能力的 backlog，都应先回答以下问题：

1. 它增强的是 state、context、action、check、evidence、journal 中的哪一环？
2. 产物是否有稳定落盘路径？
3. `status --agent` 和 `next --agent` 是否能看见它？
4. `check` 或 `review` 是否能验证它？
5. 它是否增加新的长期维护面？如果是，收益是否足以覆盖？
6. 它是否绑定某个 Agent 平台？如果是，能否降级为安装资产而非核心能力？

只有同时满足“状态机兼容、证据可追溯、平台不锁死、维护成本可控”的能力，才适合进入 DocPath 核心。

## 9. 来源与局限

来源：

- TreeX-X/WorkFlowX README: https://github.com/TreeX-X/WorkFlowX
- TreeX-X/WorkFlowX AGENTS.md: https://github.com/TreeX-X/WorkFlowX/blob/main/AGENTS.md
- ReJeCtAll/ExpertTeam-Codex README: https://github.com/ReJeCtAll/ExpertTeam-Codex/blob/main/README.md
- DocPath 本地文档: `docs/research/state-management-comparison.md`、`docs/design/backlog-layer-requirement.md`、`docs/design/harness-lite.md`

局限：

- 本评估基于公开 README/AGENTS 和 DocPath 本地仓库状态，不等同于对外部项目完整源码的逐文件审计。
- ExpertTeam-Codex 的 GitHub 页面抓取曾超时，最终采用 raw README 与搜索结果核验。
- WorkFlowX 的外部能力较多，本评估只覆盖与 R-142~R-145 直接相关的能力。
