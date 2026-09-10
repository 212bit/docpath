# R-328 分析摘要 — dsh-plugin-docpath 可视化插件

> 取证方式：本机 `/Users/mac/project/docpath` 实跑 `docpath` CLI + 直读 `.docpath/` JSON 真源。
> 所有数字均为实测，非估算。

## 1. 问题：工作流状态对人类不可见

DocPath 协议（AGENTS.md / CLAUDE.md）规定「JSON/JSONL 是机器真源，Markdown 是渲染的人类视图，不作为 Agent 默认输入」。这对 Agent 是正确的，但造成结构性缺口：**人类没有趁手的观察面**。

现有两条路都别扭：

1. `docpath status --agent` / `next --agent` —— 静态 YAML 快照，无历史对比、无趋势；
2. 直接翻 `.docpath/*.json` —— 与协议「不要默认读」冲突，且 `docs-index.json` 实测 1.0MB / 969 条目 / 125 万 token 估算，人读不动。

## 2. 量化痛点：命令耗时无人消费

实测 `.docpath/workspace/trace.jsonl`（1699 条命令记录）聚合：

| 命令 | 次数 | 平均耗时 | 最慢 |
| --- | --- | --- | --- |
| `check` | 110 | **113,793ms** | 241,329ms |
| `done` | 15 | 123,839ms | 661,561ms |
| `review` | 92 | 1,282ms | 4,958ms |
| `go` | 161 | 668ms | 1,687ms |
| `next` | 191 | 366ms | 813ms |
| `backlog` | 328 | 188ms | 1,243ms |

现场复测：`docpath check` 单次 **61.2s**（`durationMs: 61065`，user 2m24s / sys 1m12s）。

结论：`check`/`done` 与其余命令差 **2～3 个数量级**，是唯一的量级异常点。但耗时数据躺在
`trace.jsonl` 里无人消费；`check-history.json` 只记通过/失败布尔值，**没有趋势维度**。
人只能靠"感觉慢"，无法定位"哪个 gate 慢、什么时候开始慢"。

## 3. 前车之鉴：R-230 已 dropped

backlog `R-230「Design UI for DocPath workflow dashboard」`（2026-06-21）捕获了同一需求，
规划 7 页面（Overview/Workboard/Gates/Events/Backlog/Worktrees）+ 暖色设计系统重做，
状态 **dropped**，未落地。

**失败归因**：方案是独立 Web 应用 + 视觉重做，范围过大，且与"CLI 优先"理念争夺维护成本。

**本次方案差异**：不做独立应用，做成 DSH 插件嵌进侧边栏——人在哪写代码就在哪看状态；
范围收敛为**只读可观测**，不提供写操作，不挑战 CLI 门禁权威。

## 4. 数据面盘点（均已实测结构）

| 数据 | 路径 | 结构要点 |
| --- | --- | --- |
| 运行时状态 | `workspace/state.json` | `{level, workflow_profile, task_id, phase, gate, current_step, started_at, updated_at}` |
| Agent 快照 | `workspace/agent-snapshot.json` | 含 `next_valid_events[]`（状态机合法转移）、`recommended_command` |
| 门禁结果 | `workspace/last-check.json` | `{passed, check_count, checks:[{name,passed,output,category}]}` |
| 门禁历史 | `workspace/check-history.json` | `[{timestamp, passed, failedChecks[], gitRef, branch, worktreeDirty}]` |
| 命令耗时 | `workspace/trace.jsonl` | `{ts, session, agent, phase, gate, taskId, cwd, cmd, args, durationMs, exitCode}` |
| 执行面包屑 | `workspace/breadcrumb.jsonl` | `{taskId, step, status, context, timestamp}` |
| 决策日志 | `workspace/decisions.jsonl` | `{id, taskId, category, context, decision, impact, alternatives[]}` |
| 计划 | `tasks/<id>/plan.json` | `{steps:[{id, name, description, acceptance, dependencies, status}]}` |
| 规约 | `tasks/<id>/spec.json` | `scope` / `functional_requirements` / `acceptance_criteria` / `decision_brief` |
| 需求池 | `backlog/R-*.md` | YAML frontmatter：`id/title/status/priority/level/readiness/links` |
| 文档索引 | `docs-index.json` | 969 条目（404 active / 565 archive），`content_terms` 占总体积 62% |

## 5. 关键性能事实：docs-index 必须减载

实测 JSON 序列化体积：

- 全量（含 `content_terms`）：**1026 KB**
- 去掉 `content_terms`：**390 KB**（减 62%）
- 再只保留 active（404/969）：**416 KB**（`content_terms` 已去的前提下反而略大 → 说明 archive 条目本身更"瘦"）

**结论**：`content_terms` 是体积主体，且它只服务于全文检索。首屏传输必须剥离；
检索能力改为 host 侧按需计算（kernel 纯函数做 term 匹配），不整体下发。

## 6. 技术选型取证

### 6.1 DSH 插件体系（参照 `dsh-plugin-harness-lens`，同构且已跑通）

- **单一 Cordis 入口**：`cordis.patch.yml` 声明 `- insert: [{id, name}]`；
- **双输出构建**（tsdown）：host = ESM/node，client = CJS/browser，
  用 `window.__ModuleLoader__.load({ id, factory })` banner/footer 包裹；
- **host→client 桥**：host `ctx.provide(name, service)`，client `ctx.get(name)`；
- **client 注册**：优先 `betterSidebar.registerTab({id, title, order, component})`，
  未组合时降级 `slots.register({name:'conversation.view', ...})`；
- **契约三查**：`client.inject` 声明依赖、`cordis.patch.yml` 存在、`host.provide` 桥。

### 6.2 数据源选型：直读 JSON 而非调 CLI

| 方案 | 首屏 | 语义稳定 | 细节丰富度 |
| --- | --- | --- | --- |
| 调 CLI `--agent` | ~360ms（`status` 实测）/ 子进程开销 | 高（官方 YAML） | 低（只有快照字段） |
| **直读 JSON** | **< 50ms** | 中（需容错 schema） | 高（全字段） |

选直读 JSON：**面板是高频刷新的观察面，不能每次起子进程**。
schema 耦合风险由 kernel 层容错 + `schema_version` 校验兜底。

## 7. 风险与边界

1. **只读**：插件绝不写 `.docpath/`，不绕过门禁，不替代 `docpath check` 的权威性；
2. **schema 耦合**：`schema_version` 不匹配时降级为 `degraded` 标记 + 尽力解析，不崩；
3. **大仓库**：`docs-index` 减载 + 增量刷新（mtime/size 缓存）+ 去抖 200ms；
4. **scope 收敛**：不做写操作、不做远程、不做多项目聚合（首版只观察当前工程根）。
