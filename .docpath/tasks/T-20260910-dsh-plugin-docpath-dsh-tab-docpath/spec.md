# T-20260910-dsh-plugin-docpath-dsh-tab-docpath - 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流）

> backlog_id: R-328
> backlog_source: docpath backlog capture
> 交付性质：**设计交付**（本任务不产出可运行代码，产出设计文档，经用户确认后进入实现）

## 1. 背景与动机

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

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-328-summary.md

## 2. 需求清单

### 功能需求

- [ ] FR-1: 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。
- [ ] FR-2: 为每个 Tab 标注消费的具体文件路径与字段，并给出 `schema_version` 不匹配 / 文件缺失时的降级策略；**不得设计未实测过的字段**。
- [ ] FR-3: 当前任务卡 —— `state.json` + `agent-snapshot.json` + `plan.json` 合成「任务标题 / phase / gate / 当前步骤 / 步骤清单（含 status）/ 进度 / `recommended_command` / `next_valid_events`」。
- [ ] FR-4: 可观测面板 —— `trace.jsonl` 按 `cmd` 聚合 `{n, avg, p50, p95, max}`，标注量级异常（如 `check` 113s）；`check-history.json` 渲染门禁通过率趋势；支持按时间窗过滤。
- [ ] FR-5: `docs-index.json` 减载浏览 —— 首屏剥离 `content_terms`（1026KB→390KB），按 `scope`/`type`/`archive` 过滤，搜索走 host 侧 kernel 匹配而非整体下发。
- [ ] FR-6: `breadcrumb.jsonl` + `decisions.jsonl` 反序时间线，展示 `step/status/context` 与 ADR（`category/decision/impact`），支持按 `taskId` 过滤。
- [ ] FR-7: host 侧 `fs.watch` 监听 `.docpath/` 去抖（200ms）+ 兜底心跳（2s），跨 Electron 边界经快照广播；插件卸载时释放监听器。
- [ ] FR-8: client 优先 `betterSidebar.registerTab`，未组合时降级 `slots.register('conversation.view')`；中英文本地化（`locale.register`）。

### 非功能需求

- [ ] NFR-1: 插件绝不写 `.docpath/` 任何文件，不绕过门禁，不替代 `docpath check` 的权威性。
- [ ] NFR-2: 直读 JSON 不起子进程；首屏快照 < 200ms；`docs-index` 必须减载，不得整包传输。
- [ ] NFR-3: 任何单个数据源读取失败只降级该 Tab 并标记 `degraded`，不整体崩溃；`schema_version` 不匹配时尽力解析。
- [ ] NFR-4: 满足 cordis 三项契约检查 —— `client.inject` 声明依赖、`cordis.patch.yml` 存在且声明 insert、`host.provide` 桥可用。
- [ ] NFR-5: kernel 层纯函数单测覆盖解析/聚合/统计；不依赖真实 `.docpath/` 也能测（fixture 驱动）。
- [ ] NFR-6: 面板是**辅助观察工具**，不复制 CLI 的决策逻辑，不提供写操作入口。

## 3. 范围界定

### 包含

- 设计文档：分层架构、数据契约（逐 Tab 到字段级）、UI 版式、里程碑拆分、风险登记。
- 参照实现 `dsh-plugin-harness-lens`（同构、已跑通）确定构建与注册方式。
- 基于本机实测数据（`trace.jsonl` 1699 条、`docs-index.json` 969 条目）给出性能预算。

### 不包含

- **不产出可运行代码**（本次为设计交付，用户确认后再实现）。
- 不做写操作（不提供 `go`/`agent step`/`check` 等触发按钮）。
- 不做多项目聚合（首版只观察当前工程根；`~/.docpath/projects.sqlite` 全局注册表留作后续）。
- 不做远程/协作/告警。
- 不做独立 Web 应用（这是 R-230 被 dropped 的原因）。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 交付形态 | A. 独立 Web 应用 / B. DSH 侧边栏插件 | **B** | R-230 选 A 已 dropped（范围过大）；B 复用已有侧边栏与插件体系，人在哪写代码就在哪看状态，且天然只读 |
| 3 | 数据来源 | A. 调 CLI `--agent` / B. 直读 `.docpath/` JSON | **B** | 面板高频刷新不能每次起子进程（`status` 实测 358ms/次）；直读 < 50ms 且字段更全。schema 耦合由 kernel 容错兜底 |
| 4 | Tab 组织 | A. 单页 / B. 分 Tab | **B** | 用户明确选择分 Tab：工作流 / 耗时 / 文档 / 事件流，四类数据密度与刷新频率不同 |
| 5 | docs-index 传输 | A. 整包下发 / B. 剥离 `content_terms` + host 侧检索 | **B** | 实测 `content_terms` 占 62% 体积（1026KB→390KB），且只服务全文检索；检索下沉到 host 避免传 1MB |
| 6 | 写能力 | A. 可触发命令 / B. 纯只读 | **B** | 保持 CLI 门禁权威，避免插件成为绕过门禁的旁路；也是 NFR-1 硬约束 |
| 7 | 本次交付范围 | A. 设计+实现 / B. 仅设计 | **B** | 用户明确选择「先出设计方案文档」，确认后再实现 |

## 4.1 重大变更门禁

### 是否涉及重大变更

否。本次为设计交付，不改动 `src/`、不改数据契约、不动工作流语义；产出物为 `.docpath/tasks/<task>/` 下的设计文档。

## 5. 验收标准

- [ ] AC-1: 设计文档覆盖 FR-1～FR-8 全部条目，分层架构明确标出 host/client/kernel 各自职责与禁止事项。
- [ ] AC-2: 数据契约逐 Tab 标注到具体文件路径 + 字段名（如 `trace.jsonl.durationMs`），并给出缺失/版本不匹配的降级策略；**所有字段均来自实测，无臆造**。
- [ ] AC-3: 性能预算有实测依据 —— 首屏 < 200ms、`docs-index` 减载至 ≤ 390KB，并写明减载手段。
- [ ] AC-4: cordis 三项契约检查（client.inject / cordis.patch.yml / host.provide）在设计中逐条给出落地方式。
- [ ] AC-5: 明确写出只读边界与「不做什么」，含 R-230 失败归因的复用。
- [ ] AC-6: 里程碑拆分到「一次验证能验收」的粒度，M0 能证明插件可加载 + 侧边栏可见真实状态。
- [ ] AC-7: 设计经用户确认，未确认前不进入实现。
