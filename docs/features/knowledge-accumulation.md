---
related:
  - features/architecture-guard.md
  - features/backlog-lifecycle.md
---

# 经验沉淀与持续学习机制 (Knowledge Accumulation)

> DocPath 的核心设计理念之一是**“让每一次开发都成为知识积累，而非一次性消耗”**。
> 本文档定义了从任务过程经验捕获、候选清洗、硬规则晋升，到智能上下文检索消费的完整闭环。

---

## 1. 知识沉淀生命周期 (Knowledge Lifecycle)

DocPath 构建了从**过程态**到**持久态**、再到**消费态**的 4 阶段闭环：

```mermaid
flowchart LR
    A["任务开发 / 踩坑<br/>(Execution)"] -->|quick-done --gotcha<br/>/ journal 收口| B["经验候选池<br/>(lesson-candidates.md)"]
    B -->|docpath learn<br/>(智能分类与清洗)| C["硬规则资产<br/>(.docpath/rules/*.md)"]
    C -->|智能相关性评分 / 自动注入| D["Agent 上下文<br/>(next / reveal / prompt)"]
    D -.->|避免重复踩坑| A
```

---

## 2. 知识捕获通道 (Capture Channels)

### 2.1 任务收口自动提取 (Journal ADR & Gotcha)
在运行 `docpath done` 或 `docpath journal` 时，系统自动完成：
- **架构决策提取**：从 `spec.md` 的 `## 决策简报` 与 `key-decisions` 中提取高置信度 ADR，写入 `.docpath/workspace/decisions.md`。
- **踩坑点提取**：从 `breadcrumb.jsonl` 中识别 `status: blocked` 的步骤及原因，生成初步候选。
- **空正文不入池**：生成候选时，若 `### Lesson` 正文为空、仅空白、只含占位文本（如「待补充」「TBD」「none」），或只有裸选项标签（如「方案 A」「方案A」「方案 B」「Option A」，可含空白）且没有架构决策摘要与阻塞步骤，则不写入 `lesson-candidates.md`。带具体说明的推荐方案（如「方案 A：引入基于 Git diff 的 Guard」），或任何架构决策、阻塞步骤内容，仍按原格式写入。

### 2.2 快车道轻量经验捕获 (`quick-done --gotcha`)
针对微型改动与即时排错（Quick Profile），提供零仪式感的一键捕获通道：

```bash
docpath quick-done --gotcha "修改正则解析多行文本时需避免 $ 匹配行尾导致截断，使用分段 search 截取"
```

这会自动在 `workspace/lesson-candidates.md` 中创建结构化候选块，无需编写复杂的前置 Spec。

---

## 3. 候选池治理与清洗机制 (Candidate Curation)

`workspace/lesson-candidates.md` 作为缓冲池，存放待评估的经验。在执行学习与固化前，DocPath 会执行多维质量过滤：

| 过滤维度 | 规则标准 | 处置动作 |
| :--- | :--- | :--- |
| **漂移/孤儿块** | `task_id` 缺失或为 `unknown` | 自动丢弃 (`skip`) |
| **低信息量模板** | 纯进度统计（如“完成 3/3 步”）、占位符（“待补充”） | 自动过滤 (`skip`) |
| **Seed 样板噪音** | 带有初始模板描述（“方案 A/方案 A”、“保留 backlog 作为来源”） | 自动过滤 (`skip`) |
| **重复项** | 相同 key/task_id 的重复候选 | 去重过滤 (`skip`) |
| **有效经验** | 具备**触发条件**、**期望行为**和**边界防线** | 保留并标记晋升 (`keep`) |

---

## 4. 规则晋升流水线 (`docpath learn`)

`docpath learn` 命令负责将高质量经验固化为工程体系的持久规则：

### 常用命令

```bash
# 1. 预览待固化规则与待清理项（不产生副作用）
docpath learn --dry-run
docpath learn groom

# 2. 清理候选池中的低价值噪音（保留有效候选）
docpath learn prune

# 3. 正式执行经验固化（写入 rules/ 对应文件并清空候选池）
docpath learn
```

### 规则路由机制
- 带有 `target: architecture` 或涉及架构/边界/模块划分的经验 → 晋升至 `.docpath/rules/architecture.md`。
- 带有 `target: style` 或涉及编码规范/防坑/CLI 约定的经验 → 晋升至 `.docpath/rules/style.md`。

---

## 4.1 规则真源健康与规则医生 (`docpath rule doctor` / `docpath doctor --rules`)

为了防止随着工程演进规则正文逐渐滞后于代码事实（例如某历史缺陷早已闭环修复，规则条目却依然声明其为“待修”），DocPath 构建了规则医生体检引擎：

- **需求状态反向校验 (`stale_backlog_assertion`)**：扫描规则正文与 Evidence 中提及的需求断言（如 `R-xxx 待修`、`R-xxx TODO`、`R-xxx 待办`），反向核查对应需求的真实生命周期。若需求实际已处于 `status: done` 或已归档，立即报警提示更新。
- **配置双真源分裂体检 (`split_config_truth`)**：检查项目根目录是否并存 `.docpath/config.yaml` 与 `.docpath/config.json`，防御双真源导致的配置漂移。
- **孤立引用与行数预算体检**：检查 Evidence 中的文件路径有效性，并对规则库行数预算（200 行上限）进行守卫。
- **一键防滞后自愈 (`docpath rule fix` / `docpath rule dedupe`)**：自动将已闭环需求的陈旧标记安全自愈为 `(R-xxx 已闭环修复)`，清理失效引用，实现规则库与真实代码形态的零滞后对齐。

---

## 5. 智能上下文检索与注入 (Context Injection)

沉淀的知识如果只存不读，就会沦为“知识死库”。DocPath 在 Agent 关键入口建立了**基于相关性的智能上下文注入**机制：

### 5.1 关键词相关性打分
在 Agent 启动或恢复任务（`docpath next --agent`）时：
1. 提取当前任务标题 (`task_title`) 与规范摘要 (`specSummary`) 的关键词。
2. 对 `.docpath/workspace/decisions.jsonl` 与规则库进行相关性打分。
3. 优先将强相关的历史架构决策与避坑指南注入当前 Agent 会话的前置上下文中，防止重复犯错。

### 5.2 活文档优先检索
在执行 `docpath reveal --topic <feature>` 或 `docpath context --topic <feature>` 时：
- `docs/` 与 `README.md` 中的活文档获得高优先级权重（+75~+85分）。
- 历史归档的 `backlog/analysis/` 与 `tasks/done/` 自动降权，确保 Agent 优先消费最新的系统设计。

---

## 6. 代码与活文档同步守护 (Living Doc Sync Guard)

为了防止代码不断演进但活文档失修腐化，系统在任务收口（`journal`）阶段执行智能匹配检测：

- **核心模块映射**：
  - `worktree` 模块改动 → 推荐检查 [`docs/features/worktree-workflow.md`](./worktree-workflow.md)
  - `agent/context` 模块改动 → 推荐检查 [`docs/design/agent-integration.md`](../design/agent-integration.md)
  - `session` 模块改动 → 推荐检查 [`docs/design/session-isolation-mvp.md`](../design/session-isolation-mvp.md)
  - `error-codes` 模块改动 → 推荐检查 [`docs/error-codes.md`](../error-codes.md)
- **增量同步提示**：若检测到核心代码变更且未修改 `docs/`，输出精准关联文档提示，引导开发者或 Agent 完成知识沉淀。
