---
related:
  - features/backlog-lifecycle.md
  - features/knowledge-accumulation.md
---

# Milestone 里程碑目标规划与闭环管理 (Milestone Lifecycle & Management)

> DocPath 里程碑引擎是面向宏观目标治理的**大目标规划、拆解分解、大盘跟踪与阶段性验收发布闭环底座**。
> 满足阶段性目标规划 (M-###)、智能拆解生成 Backlog (R-###)、关联需求大盘看板、门禁式验收测试与版本发布自动化。

---

## 1. 设计哲学与核心价值

DocPath 里程碑将“前置宏观规划”与“后置发布收敛”打通为完整的全生命周期闭环：
- **目标驱动 (Objective-Driven)**：采用独立的 `M-###` 编号实体，明确定义 Objective 核心目标与 Milestone Acceptance Criteria (MAC)。
- **自顶向下拆解 (Decomposition)**：将大型里程碑分解为粒度适宜的四段式 Backlog (`R-###`)，并通过 `milestone: M-###` 字段双向绑定。
- **全景看板与燃尽分析 (Dashboard & Board)**：实时聚合关联需求完成度、验收准则满足情况及未解阻碍分析。
- **阶段性门禁验收与发布闭环 (Acceptance & Release)**：在所有关键 Backlog 闭环后执行里程碑验收，自动生成版本发布简报 `docs/releases/vX.Y.Z.md` 并同步更新根目录 `CHANGELOG.md`。

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     1. 目标规划 (docpath milestone add)                │
│  M-001 (planned) ──> 定义 Objective + 验收标准 (MAC-1..MAC-n)          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ docpath milestone decompose / bind
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     2. Backlog 拆解与关联 (R-###)                      │
│  R-101 (P0) + R-102 (P1) + R-103 (P2) 自动双向关联至 M-001              │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ docpath milestone status / board
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     3. 敏捷推进与大盘跟踪 (Executing)                  │
│  实时计算完成百分比、需求状态分布、燃尽状态与阻碍项                    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ docpath milestone verify / accept
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     4. 阶段性验收与发布闭环 (Release)                  │
│  校验 MAC 与需求完成度 ──> 生成 docs/releases/ 并同步 CHANGELOG.md    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. CLI 命令参考手册

| 命令 | 阶段 | 说明与常用参数 |
| :--- | :--- | :--- |
| `docpath milestone add "<title>"` | 规划 | 创建新里程碑实体（`--ver <v>`, `--priority <P0-P3>`, `--target-date <YYYY-MM-DD>`） |
| `docpath milestone decompose <id>` | 拆解 | 拆解生成关联的子需求（`--items '[{"title":"...","kind":"feature"}]'`） |
| `docpath milestone bind <id> <R-###...>` | 关联 | 将已有 Backlog 条目归入指定里程碑 |
| `docpath milestone unbind <id> <R-###...>` | 解绑 | 从指定里程碑移除已关联的需求 |
| `docpath milestone status [id]` | 跟踪 | 查看里程碑进度看板、完成度%、需求明细与阻塞项 |
| `docpath milestone verify <id>` | 验收门禁 | 校验关联需求是否 100% 闭环且验收准则满足 |
| `docpath milestone accept <id>` | 验收确认 | 确认阶段性验收（`--force` 强制跳过未完成项） |
| `docpath milestone release <id>` | 正式发布 | 生成结构化发布简报 `docs/releases/` 并追加 `CHANGELOG.md` |
| `docpath milestone list` | 概览 | 展示当前规划中里程碑与历史发布简报 |
| `docpath milestone timeline` | 时间线 | 生成全局 Mermaid 系统架构与版本演进大盘 |
