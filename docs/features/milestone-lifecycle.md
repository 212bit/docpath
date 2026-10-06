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
| `docpath milestone add "<title>"` | 规划 | 创建新里程碑实体（`--ver <v>`, `--priority <P0-P3>`, `--target-date <YYYY-MM-DD>`, `--owner <owner>`） |
| `docpath milestone decompose <id>` | 拆解 | 智能拆解生成关联子需求（支持从正文列表自动提取，或通过 `--items` 传入） |
| `docpath milestone bind <id> <R-###...>` | 关联 | 将已有 Backlog 条目归入指定里程碑 |
| `docpath milestone unbind <id> <R-###...>` | 解绑 | 从指定里程碑移除已关联的需求 |
| `docpath milestone edit <id>` | 属性编辑 | 更新里程碑元数据（`--title`, `--status`, `--priority`, `--target-date`, `--owner`, `--ver`） |
| `docpath milestone doctor` | 健康巡检 | 检查里程碑与需求血缘完整性（悬空引用、空里程碑、逾期风险、孤儿需求） |
| `docpath milestone status [id]` | 跟踪大盘 | 查看健康度预测 (`on_track`/`at_risk`/`overdue`)、Top Blockers 关键阻碍链与需求明细 |
| `docpath milestone verify <id>` | 验收门禁 | 校验关联需求是否 100% 闭环且验收准则满足 |
| `docpath milestone accept <id>` | 验收确认 | 确认阶段性验收（`--force` 强制跳过未完成项） |
| `docpath milestone release <id>` | 正式发布 | 聚合 ADRs、生成发布简报 `docs/releases/`、提供 Git Tag 建议并追加 `CHANGELOG.md` |
| `docpath milestone list` | 概览 | 展示当前规划中里程碑与历史发布简报 |
| `docpath milestone timeline` | 时间线 | 生成全局 Mermaid 系统架构与版本演进大盘 |
| `docpath backlog pick --milestone <id>` | 敏捷选单 | 仅在指定里程碑范围内按收益分值智能挑选最高优先就绪需求 |
| `docpath next --agent` | 智能路由 | 在关联需求 100% 达成后自动感知并推荐 `docpath milestone verify M-###` 验收闭环 |

---

## 3. 高级治理与健康度分析

### 3.1 智能拆解与正文解析 (`docpath milestone decompose`)
除了直接传参 `--items` 外，`decompose` 支持直接解析里程碑 Markdown 正文中的需求清单：
```markdown
## 2. 📋 关联需求清单 (Backlog Scope)
- [ ] [feature] [P0] 动态路由配置引擎
- [ ] [infra] [P1] 限流与熔断中间件
- [ ] [bug] [P2] 修复长连接超时断开问题
```
运行 `docpath milestone decompose M-001` 即可自动提取并生成对应 `kind` 与 `priority` 的 `R-###` Backlog 条目。

### 3.2 健康度预测与关键阻碍链 (`docpath milestone status / track`)
里程碑看板提供多维度智能分析：
- **健康度预测 (Health Status)**：
  - 🟢 `on_track` (正常推进)：进度与剩余天数充足。
  - 🟡 `at_risk` (进度预警)：临近截止期（≤14天）但完成度偏低，或无活跃进行中需求。
  - 🔴 `overdue` (进度逾期)：目标日期已过且未达成阶段性验收。
- **Top Blockers 关键阻碍链分析**：
  自动分析关联 Backlog 之间的依赖关系 (`links.depends_on`)，高亮阻塞下游需求数量最多的核心阻碍项，指导团队先啃硬骨头。

### 3.3 属性编辑与巡检治理 (`docpath milestone edit / doctor`)
- **`docpath milestone edit M-001`**：动态调整目标日期、负责人、优先级或目标版本号。
- **`docpath milestone doctor`**：一键检测并定位全库血缘异常，包括：
  1. 悬空需求引用 (Milestone 指向不存在的 `R-###`)；
  2. 空里程碑告警 (长期未拆解或关联需求的里程碑)；
  3. 逾期未交付里程碑提示；
  4. 孤儿需求 (Backlog `links.milestone` 指向不存在的里程碑)。

### 3.4 架构决策沉淀与 Git Tag 联动 (`docpath milestone release`)
执行发布闭环时，系统自动收集本里程碑交付任务中沉淀的 Decision Brief / ADR 架构决策，并在发布简报中输出 Git Tag 建议：
```bash
git tag -a v1.2.0 -m "核心架构升级"
git push origin v1.2.0
```

---

## 4. Agent 协同与选单联动

### 4.1 里程碑范围化选单 (`docpath backlog pick --milestone M-###`)
通过 `--milestone M-###` 约束选单与拉起范围，帮助 Agent 与开发者专注完成特定阶段性目标：
```bash
# 查看 M-001 里程碑下的关键路径与智能选单
docpath backlog pick --milestone M-001

# Agent 机器视图
docpath backlog pick --milestone M-001 --agent

# 自动从 M-001 里程碑中选中最高收益需求并直接拉起任务
docpath backlog pick --milestone M-001 --start
```

### 4.2 智能路由里程碑验收联动 (`docpath next --agent`)
当某个进行中的里程碑其所有关联需求均已达到 `done` 状态时，`docpath next --agent` 和 `docpath status --agent` 会在任务完成后主动推断并输出验收提示：
```yaml
agent_view: next
next_action: 里程碑 M-001 (基础底座升级) 的所有关联需求已全部闭环，建议执行里程碑集成验收
recommended_command: docpath milestone verify M-001
exit_criteria: 里程碑 M-001 验收通过并可执行发布闭环
```
无需人工手动核对需求清单，即可实现大目标从规划拆解到验收发布的自动化闭环。
