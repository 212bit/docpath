---
id: R-328
title: 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流）
status: done
priority: P2
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: 实现已在 dsh-app/dsh-plugin-docpath 落地（M0 包骨架+三级根解析+多会话隔离+工作流 Tab；A 耗时医生
    PerfTab；B 状态机 FsmCard；M4 DocsTab；M5 EventsTab），全部 typecheck/build/vitest
    通过。设计文档已含『里程碑拆分』章节，与实现一致。
  spec: tasks/T-20260911-dsh-plugin-docpath-dsh-tab-docpath/spec.md
  decision_brief: >-
    - 当前问题: DocPath 是纯 CLI 工作流引擎，AGENTS.md 明确「JSON/JSONL 是机器真源，Markdown
    是渲染的人类视图，不作为 Agent 默认输入」。这带来一个结构性缺口：**工作流状态对人类不可见**。当前想看清状态只有两条路——

    - 目标: 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath
    工作流全景（工作流/耗时/文档/事件流）

    - 背景: 来自 backlog R-328

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260911-dsh-plugin-docpath-dsh-tab-docpath
  spec: tasks/T-20260911-dsh-plugin-docpath-dsh-tab-docpath/spec.md
created_at: 2026-09-10
---

## 背景

DocPath 是纯 CLI 工作流引擎，AGENTS.md 明确「JSON/JSONL 是机器真源，Markdown 是渲染的人类视图，不作为 Agent 默认输入」。这带来一个结构性缺口：**工作流状态对人类不可见**。当前想看清状态只有两条路——

1. 跑 `docpath status --agent` / `next --agent` 读 YAML 快照；
2. 直接翻 `.docpath/` 下的 JSON（协议又明令「不要默认读」）。

两条路都不理想：前者是静态快照、无历史对比；后者与协议冲突且文件巨大（`docs-index.json` 实测 1.0MB / 969 条目 / 125 万 token 估算）。

**已实测的痛点（本机 `.docpath/workspace/trace.jsonl`，1699 条命令记录）：**

| 命令 | 次数 | 平均耗时 | 最慢 |
| --- | --- | --- | --- |
| `check` | 110 | **113,793ms** | 241,329ms |
| `done` | 15 | 123,839ms | 661,561ms |
| `review` | 92 | 1,282ms | 4,958ms |
| `go` | 161 | 668ms | 1,687ms |
| `next` | 191 | 366ms | 813ms |
| `backlog` | 328 | 188ms | 1,243ms |

`check` 平均 113 秒、单次实测 61 秒（`durationMs: 61065`，user 2m24s），是唯一量级异常的命令。但**没有界面能看到这个分布**——耗时数据躺在 `trace.jsonl` 里无人消费，`check-history.json` 也只有通过/失败的布尔结果，没有趋势。

**已有前车之鉴**：backlog `R-230「Design UI for DocPath workflow dashboard」` 早在 2026-06-21 就捕获了同样的需求（7 页面：Overview/Workboard/Gates/Events/Backlog/Worktrees），状态为 **dropped**，未落地。其方案是独立 Web 应用 + 暖色设计系统重做，范围过大是被放弃的原因之一。

**本次方案差异**：不做独立 Web 应用，而是做成 **DSH 插件 `dsh-plugin-docpath`**，复用 DSH 已有的侧边栏（betterSidebar）与 Cordis 插件体系，把面板嵌进 Agent 日常工作的界面里——人在哪里写代码，就在哪里看状态。范围收敛为「只读可观测」，不提供写操作（不替代 CLI 的门禁权威）。

**数据面盘点（均已实测确认结构）：**

| 数据 | 路径 | 结构要点 |
| --- | --- | --- |
| 运行时状态 | `.docpath/workspace/state.json` | `{level, workflow_profile, task_id, phase, gate, current_step, started_at, updated_at}` |
| Agent 快照 | `.docpath/workspace/agent-snapshot.json` | 含 `next_valid_events[]` 状态机合法转移、`recommended_command` |
| 门禁结果 | `.docpath/workspace/last-check.json` | `{passed, check_count, checks:[{name,passed,output,category}]}` |
| 门禁历史 | `.docpath/workspace/check-history.json` | 数组，含 `timestamp/passed/failedChecks/gitRef/branch/worktreeDirty` |
| 命令耗时 | `.docpath/workspace/trace.jsonl` | `{ts, session, agent, phase, gate, taskId, cwd, cmd, args, durationMs, exitCode}` |
| 执行面包屑 | `.docpath/workspace/breadcrumb.jsonl` | `{taskId, step, status, context, timestamp}` |
| 决策日志 | `.docpath/workspace/decisions.jsonl` | `{id, taskId, category, context, decision, impact, alternatives[]}` |
| 计划 | `.docpath/tasks/<id>/plan.json` | `{steps:[{id, name, description, acceptance, dependencies, status}]}` |
| 规约 | `.docpath/tasks/<id>/spec.json` | 含 `scope/functional_requirements/acceptance_criteria/decision_brief` |
| 需求池 | `.docpath/backlog/R-*.md` | YAML frontmatter: `id/title/status/priority/level/readiness/links` |
| 文档索引 | `.docpath/docs-index.json` | 969 条目（404 active / 565 archive），`content_terms` 占 62% 体积 |

## 验收

1. **设计文档产出**：`.docpath/tasks/<task>/` 下产出完整设计，覆盖 —— 分层架构（host/client/kernel）、数据契约（每个 Tab 消费哪些文件、字段、兜底策略）、侧边栏 Tab 版式、里程碑拆分、风险与不做的事。
2. **架构合规**：分层遵循 DSH 插件开发预设——`host` 只做文件 IO 与 `ctx.provide` 桥、`kernel` 是零 IO 纯函数且可单测、`client` 只做 UI 渲染；明确写出 cordis 三项契约检查（client.inject 声明 / cordis.patch.yml / host.provide 桥）的落地方式。
3. **数据契约可验证**：每个 Tab 的数据来源必须标注到具体文件路径与字段，并给出 `schema_version` 不匹配或文件缺失时的降级策略；不得凭空设计未实测过的字段。
4. **性能约束明确**：直读 JSON（不起子进程拉 CLI），首屏数据 < 200ms；`docs-index.json` 必须给出减载方案（实测去 `content_terms` 后 1026KB→390KB），不得整包传输。
5. **只读边界**：设计明确插件为只读可观测，不写 `.docpath/`、不绕过 CLI 门禁、不替代 `docpath check` 的权威性。
6. **里程碑可交付**：拆分到「一次验证能验收」的粒度，M0 必须能证明链路通（插件可加载 + 侧边栏可见真实状态）。
7. 本次为**设计交付**，不产出可运行代码；设计经用户确认后再进入实现。

---

## 里程碑拆分

四个 Tab 的后续里程碑划分（与验收 #1/#3/#6 对齐）。**状态更新（2026-09-11）**：M0 / A / B 已提交；M4 / M5 代码已随本设计落地，文档章节于本轮补齐。

| 里程碑 | 内容 | 消费数据源 | 状态 |
| --- | --- | --- | --- |
| **M0** | 包骨架 + 三级根解析 + 多会话隔离 + 工作流 Tab | state.json / plan.json / agent-snapshot.json | ✅ 已提交 |
| **A（耗时医生）** | 门禁健康 + check 预测 + 命令耗时排行 | check-history.json / last-check.json / trace.jsonl | ✅ 已提交（PerfTab） |
| **B（状态机可视化）** | 当前 phase/gate 高亮 + 合法转移 | state.json / agent-snapshot.json | ✅ 已提交（FsmCard，嵌工作流 Tab） |
| **M4（文档）** | docs-index 减载渲染 + 检索 | docs-index.json | ✅ 已提交（DocsTab） |
| **M5（事件流）** | breadcrumb + decisions 时间线 | breadcrumb.jsonl / decisions.jsonl | ✅ 已提交（EventsTab） |

> 注：源码 `DocPathPanel.tsx` 中曾经标注 "M4 填充 / M5 填充" 的占位，已在 M4/M5 实现时删除并替换为真实组件；以下章节即这两处占位对应的设计补全。

### M4 — 文档 Tab（Tab-3）

**目标**：把首屏已减载（剥离 `content_terms`）的 `docs-index.json` 渲染为可检索列表，让"项目里有哪些文档、最近改了什么"在写代码的同一界面里可见。

**数据源与字段**（已实测，不凭空设计）：

- 路径：`{root}/.docpath/docs-index.json`，host 侧 `readDocsIndex()` 已剥离 `content_terms`，仅下发 `DocsIndexEntry`（见 model.ts）。
- 消费字段：`path` / `type` / `scope` / `level` / `title` / `summary` / `updated_at` / `size` / `token_estimate` / `default_read` / `archive`。
- 统计：`docsStats = { total, active, archived }`，由 host 计算后随快照下发。

**版式**（侧栏 ~360px，沿用 `C` 配色与 `pane` 卡片）：

1. 顶部三格统计：总 / 活跃 / 归档（数字 + 标签）。
2. 控制行：关键词输入框（过滤 `title` / `summary` / `path`，全小写包含匹配）+ "含归档"开关（默认只显示 active）。
3. 列表：每条文档一张卡片，含标题（★ 标 `default_read`）、摘要、`type`/`level`/`scope` chip、`token_estimate`、体积、`updated_at`、归档标记；默认按 `updated_at` 倒序。
4. 性能护栏：`RENDER_CAP = 300`，命中上限时提示"仅显示前 300，请收窄关键词"，避免 969 条全量渲染卡顿。

**降级策略**：

- 文件缺失 → `Sourced.health = 'missing'`，Tab 显示"无文档索引（docs-index.json 缺失）"，不报错。
- JSON 损坏 → `health = 'degraded'`，显示"文档索引不可用：{reason}"，不阻塞其他 Tab。
- `schema_version` 不匹配 / 字段缺失：model 用 `??` 兜底（如 `summary` 为空则跳过摘要行），不整页崩溃（NFR-3）。

**性能约束（验收 #4）**：`content_terms` 不进首屏（实测 1026KB→390KB）；检索只命中已下发的元数据，host 不去拉全文。

**实现落点**：`src/view/DocsTab.tsx`；格式化助手 `formatBytes` / `formatDate` 抽进 `src/kernel/stats.ts`（纯函数、可单测、浏览器侧可用）。

### M5 — 事件流 Tab（Tab-4）

**目标**：把"最近发生了什么"做成时间线——执行面包屑 + 决策日志（ADR）合并呈现，按下钻到某次 check/review 之后发生了哪些状态转移与决策。

**数据源与字段**（已实测）：

- 执行面包屑：`{root}/.docpath/workspace/breadcrumb.jsonl`，loader 已 `slice(-300).reverse()`，反序（新→旧）。字段：`taskId` / `step` / `status`（实测取值 `done` / `in_progress` / `blocked`）/ `context` / `timestamp`。
- 决策日志：`{root}/.docpath/workspace/decisions.jsonl`，同反序限 300。字段：`id` / `taskId` / `category` / `context` / `decision` / `impact` / `alternatives[]` / `createdAt`。

**版式**：

1. 顶部提示：事件流 N 条（面包屑 + 决策，归并时间序）。
2. 两类事件行样式区分：
   - **step**：左侧状态圆点（`done`=绿 / `in_progress`=紫 / `blocked`=红），行首 `step` 名 + `context`，下方 `task {taskId} · {status}`，右侧 `MM-DD HH:mm`。
   - **decision**：左侧 `◆`（accent），行首 `id` / `category`，正文 `decision`，下方 `impact`、`task {taskId}`。
3. 归并排序：两类事件按时间戳合并（`Date.parse` 失败者沉底），不区分来源。

**降级策略**：

- 两者皆缺失 → 显示"无事件流（breadcrumb / decisions 均缺失）"。
- 任一 `degraded` 且另一非 ok → 显示不可用原因，不阻塞。
- 时间戳缺失 / 非法：`formatTime` 返回空串，排序沉底，不误排。

**只读边界（验收 #5）**：本 Tab 只渲染、不解析命令语义、不写 `.docpath/` 任何文件。

**实现落点**：`src/view/EventsTab.tsx`；时间格式化 `formatTime` 抽进 `src/kernel/stats.ts`。

### 风险与不做的事（全局）

- **不做**独立 Web 应用 / 写操作入口 / 替代 CLI 门禁（沿用 R-328 范围收敛）。
- **不做**全文检索：检索仅命中 docs-index 元数据，全文由 CLI 侧 `docpath reveal/context` 承担。
- **风险**：`docs-index.json` 体积大（969 条），已靠剥离 `content_terms` + `RENDER_CAP` 双护栏缓解；若条目数持续膨胀，后续可加按 `scope`/`type` 分组折叠。
- **风险**：多会话下各会话独立快照桶（NFR-7），切换会话时 Tab 数据随 `subscribe` 推送刷新，无跨会话串扰。
- **不做**实时刷新之外的推送优化：host 侧 `fs.watch` 去抖 400ms + 心跳 5s 已覆盖写入频率，事件流/文档 Tab 无需额外轮询（client 侧 700ms 轮询兜底）。
