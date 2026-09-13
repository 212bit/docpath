---
id: R-328
title: 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流）
status: done
priority: P2
level: 2
source: docpath backlog capture
readiness: analyzed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-328-summary.md
  spec: tasks/T-20260910-dsh-plugin-docpath-dsh-tab-docpath/spec.md
  decision_brief: null
  user_confirmed: null
links:
  task: T-20260910-dsh-plugin-docpath-dsh-tab-docpath
  spec: tasks/T-20260910-dsh-plugin-docpath-dsh-tab-docpath/spec.md
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
