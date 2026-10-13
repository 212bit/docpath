---
related:
  - features/knowledge-accumulation.md
  - features/task-stash.md
---

# Backlog 需求工程与全生命周期管理 (Backlog Lifecycle & Engineering)

> DocPath 需求工程系统是面向 Agent 与人类协同的**去中心化、声明式需求管理底座**。
> 满足轻量化需求捕获、结构化演进、依赖拓扑分析、全生命周期检索、自动化巡检治理与任务流闭环。

---

## 1. 设计哲学与核心价值

在传统开发中，需求池往往脱离代码库（存在于 Jira/飞书/GitHub Issues），导致 AI Agent 难以实时读取上下文、容易丢失真实进展或产生同号/重复冲突。

DocPath 采用 **“一条需求一文件，需求即代码资产”** 的设计理念：
- **Git 纳管与版本受控**：存放在 `.docpath/backlog/`，需求伴随代码分支同步演进与合并。
- **纯文本与机器真源**：Frontmatter + Markdown 结构化正文，既对人类可读，又对 Agent 严格解析。
- **双状态机解耦**：水平需求状态机（Backlog FSM）与垂直任务执行状态机（Task FSM）独立解耦，仅在 `promote` 与 `done` 边界原子衔接。
- **高性能与零冲突**：单文件权威计数器实现 $O(1)$ ID 分配，跨 Worktree 全局文件排他锁（`.id-allocation.lock`）与共享注册表彻底杜绝毫秒级撞号与计数器覆写冲突。

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Backlog 需求池 (.docpath/backlog/)               │
│  R-001 (proposed) ──> R-002 (accepted) ──> R-003 (planned)            │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ docpath backlog promote / start
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Task 执行层 (.docpath/tasks/current/)           │
│  drafting ──> planning ──> executing (S1..Sn) ──> reviewing ──> done   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ docpath done / step-pass --commit
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     归档与闭环 (.docpath/backlog/archived/)             │
│  R-003 (done / dropped) 自动归档，索引 backlog.md 自动自愈同步          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 需求条目数据模型 (Item Schema)

每个需求文件命名为 `R-###-<slug>.md`（例如 `R-425-backlog-edit.md`），由 YAML Frontmatter 与 Markdown 正文组成：

```yaml
---
id: R-425
title: Backlog 状态编辑、索引自动巡检自愈与归档去重闭环
kind: feature          # feature | fix | refactor | perf | debt | spike | chore
status: active         # proposed | accepted | planned | active | done | dropped
priority: P1           # P0 (紧急) | P1 (高) | P2 (中) | P3 (低)
level: 2               # 复杂度 0-3 (0: 极微, 1: 单步/快速, 2: 标准, 3: 架构级)
source: human          # 需求来源标注 (docpath backlog capture, human 等)
readiness: confirmed   # raw | shaped | analyzed | confirmed
created_at: 2026-09-28
links:
  parent: R-400        # 父级需求 ID (Epic 关联)
  depends_on:          # 前置依赖列表
    - R-420
  blocks:              # 阻塞的后置需求
    - R-430
  task: T-20260928-backlog-2 # 关联的 Task ID (未 promote 时为 null)
  spec: tasks/T-20260928-backlog-2/spec.md
evidence:
  brainstorm: null     # 澄清历史证据
  analysis: null       # 深度分析报告
  decision_brief: null # 关键决策备忘
  user_confirmed: "User approved in CLI" # Level 3 / 重大变更用户确认
---

## 1. 背景与业务价值
- 现象与痛点描述

## 2. 核心功能要点
- [ ] FR-1: 支持 docpath backlog edit --status 修改状态

## 3. 严格验收标准
- [ ] AC-1: status 字段合法性校验
- [ ] AC-2: 终态条目自动触发归档

## 4. 边界与约束
- Non-Goals: 不修改已归档的历史条目 ID
```

---

## 3. 状态机与成熟度梯级

### 3.1 状态转移矩阵 (Status Transitions)

DocPath 采用严格防腐的单向流转状态机：

| 当前状态 | 允许目标状态 | 说明 |
|---|---|---|
| `proposed` | `accepted`, `active`, `dropped`, `done` | 初始草拟态；支持 fast-track 直达 `active` 或旁路 `done` |
| `accepted` | `planned`, `active`, `dropped`, `done` | 需求已确认接受，进入待排期 |
| `planned` | `active`, `dropped`, `done` | 已排期，等待 Agent 认领 |
| `active` | `done`, `dropped` | 正在垂直 Task 中开发执行中 |
| `done` | 无（终态） | 任务完成，自动归档至 `archived/` |
| `dropped` | `proposed` | 已废弃，可随时复活回 `proposed` |

> [!NOTE]
> **旁路闭环支持 (Bypass Closeout)**：对于由 `docpath quick` 或其他轻量路径完成的需求，支持直接通过 `docpath backlog done <id> --task <task_id>` 或 `docpath backlog edit <id> --status done` 闭环并关联执行证据。

### 3.2 需求成熟度 (Readiness)

- **`raw`**：仅有标题或粗略想法，正文包含待补充占位符。
- **`shaped`**：完成四段式规范化（背景、功能要点、AC 验收标准、约束边界）。
- **`analyzed`**：完成架构与依赖分析，具备初步技术方案。
- **`confirmed`**：用户或团队已明确确认（Level 3 复杂度强制要求）。

---

## 4. 核心命令与操作指南

### 4.1 捕获与录入 (Capture & Add)
```bash
# 快速捕获原始需求 (raw)
docpath backlog capture "支持多模型协同路由" --priority P1 --kind feature

# 快速添加已成形需求 (shaped)
docpath backlog add "优化索引构建性能" --priority P2 --level 1 \
  --background "索引构建超过 200ms" --acceptance "耗时降低至 50ms 以内"
```

### 4.2 结构化规整与编辑 (Shape & Edit)
```bash
# 规范化为四段式标准模版
docpath backlog shape R-426 --kind fix --background "修复死锁" --acceptance "并发无死锁"

# 编辑属性（支持批量 ID、状态、优先级、依赖）
docpath backlog edit R-426 --priority P0 --level 2
docpath backlog edit R-425,R-426 --status planned
```

### 4.3 列表、检索与详情 (List, Search & Show)
```bash
# 活跃需求列表
docpath backlog list

# 仅查看已归档历史需求 (done / dropped)
docpath backlog list --archived

# 全量查看（活跃 + 已归档）
docpath backlog list --all

# 状态过滤（查询 done / dropped 终态时自动穿透已归档库）
docpath backlog list --status done

# 详情展示（无论活跃或已归档均支持无缝读取，标明存储区与物理路径）
docpath backlog show R-425

# 归档库定向检索
docpath backlog search "索引自愈" --archived

# 全生命周期多维检索（活跃 + 归档）
docpath backlog search "索引自愈" --include-archived --status done

# 全景度量与健康统计
docpath backlog stats
```

### 4.4 依赖拓扑图谱与卡点分析 (Graph & Topology)
```bash
# 查看依赖图谱（ASCII / Mermaid / Agent JSON）
docpath backlog graph
docpath backlog graph --mermaid

# 依赖瓶颈与关键路径自动识别
# stats 与 graph 自动计算 Critical Path 与 Top Blockers
```

### 4.5 深度治理、切片合并与自动自愈 (Groom, Merge & Hygiene)
```bash
# 巡检需求池健康度（检查断链、循环依赖、模糊 AC、跨渠道漏洞、微型步骤碎片与水平技术分层异味）
docpath backlog groom

# 一键自动治理修复悬空依赖与一致性冗余副本
docpath backlog groom --fix

# 智能合并多条微型/技术分层 Backlog 为单个独立可交付特性
docpath backlog merge R-006,R-007,R-008 --target R-006 --title "采购申请数据持久层与服务契约"
```

### 4.6 推进与提升 (Promote & Done)
```bash
# 提升需求至活跃任务（自动生成 spec.md seed 与隔离工作流）
docpath backlog promote R-426 --draft

# 批量状态推进
docpath backlog accept R-425,R-426
docpath backlog plan R-425,R-426
docpath backlog drop R-420 --reason "方案已过时"
```

---

## 5. 架构保障与防腐机制

1. **$O(1)$ 权威单文件计数器 (`.id-counter`)**：
   - 避免每次分配 ID 都全量遍历磁盘目录，将分配时间压缩在 1ms 以内。
2. **跨 Worktree 共享注册表 (`.registry.json`)**：
   - 多 Agent 在不同 Git Worktree 并发 `capture` 时，自动同步已声明 ID，杜绝撞号。
3. **撞号安全阀与归档去重闭环**：
   - 当 `archived/` 存在同名同 ID 条目时，若内容一致则自动安全清理活跃区冗余副本；若内容不一致则记录留痕防覆盖。
4. **`backlog.md` 毫秒级时间戳比对与自愈**：
   - `docpath check` 自动巡检 `backlog.md` 与实际文件修改时间，落后时自动秒级刷新，防止索引陈旧。
5. **跨 Worktree 全局文件排他锁 (`.id-allocation.lock`)**：
   - 定位主 checkout 的 `.docpath/backlog/.id-allocation.lock` 进行跨 Worktree 排他加锁，杜绝多 Agent 并发捕获时的毫秒级同号竞争。
6. **人机协同轻量认领 (`docpath adopt` / `docpath go --adopt`)**：
   - 开发者或 Agent 在工作区随手编辑代码后，可直接通过 `docpath adopt [title]` 或 `docpath go --adopt` 零阻断将工作区变更认领进执行流并记入事件流。
