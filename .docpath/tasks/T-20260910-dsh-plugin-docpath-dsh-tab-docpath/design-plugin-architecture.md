# dsh-plugin-docpath 架构设计

> 任务：T-20260910-dsh-plugin-docpath-dsh-tab-docpath（backlog R-328）
> 性质：设计交付。本文所有字段名均来自本机 `/Users/mac/project/docpath` 实测，未实测的一律标注为「待验证」。

---

## 1. 定位与边界

**一句话**：把 DocPath 的 JSON 真源，渲染成 DSH 侧边栏里的一块只读观察面。

**不做什么**（硬边界，写进 NFR-1）：

| 不做 | 原因 |
| --- | --- |
| 不写 `.docpath/` 任何文件 | 插件是观察面，不是执行面 |
| 不提供 `go` / `agent step` / `check` 触发按钮 | 会成为绕过 CLI 门禁的旁路，破坏门禁权威 |
| 不做独立 Web 应用 | R-230 选了这条路，已 `dropped`（范围过大） |
| 不做多项目聚合 | 首版只观察当前工程根 |
| 不复制 CLI 的决策逻辑 | `recommended_command` 直接透传 `docpath` 给的，插件不复算 |
| **不靠 `process.cwd()` 找工程** | 渲染进程 `sandbox: true` + `nodeIntegration: false`，主进程 cwd 是 DSH 应用目录而非用户工程。必须走 §4 三级兜底 |
| **不做单 root 单例** | 侧边栏按会话渲染，host 必须按 `sessionId` 分桶，否则多工程互相污染 |

**R-230 失败归因的复用**：R-230 规划 7 页面 + 暖色设计系统重做 + 独立应用，
范围膨胀到无法收口。本次三个收敛动作 —— ① 嵌进已有侧边栏而非新建应用；
② 砍掉视觉重做（跟随 DSH 现有主题）；③ 只做只读可观测。

---

## 2. 分层架构

严格遵循 DSH 插件开发预设的三层模型：

```
┌─────────────────────────────────────────────────────────┐
│ client (CJS / browser)          src/client.ts           │
│  · 只渲染，零 IO                                          │
│  · ctx.get('docpathLens') 消费快照                        │
│  · betterSidebar.registerTab  → 降级 conversation.view    │
└─────────────────────────────────────────────────────────┘
                    ▲ 快照广播（跨 Electron 边界）
┌─────────────────────────────────────────────────────────┐
│ host (ESM / node)               src/index.ts            │
│  · 唯一允许文件 IO 的地方                                  │
│  · ctx.provide('docpathLens', service)                   │
│  · fs.watch 去抖 + 兜底心跳                               │
│  · dispose 时释放监听                                     │
└─────────────────────────────────────────────────────────┘
                    ▲ 纯函数调用
┌─────────────────────────────────────────────────────────┐
│ kernel (零 IO 纯函数)            src/kernel/*.ts         │
│  · parse / normalize / aggregate / stats / match         │
│  · fixture 驱动可单测，不碰 node:fs                       │
└─────────────────────────────────────────────────────────┘
```

### 2.1 各层职责与禁止事项

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| `host` | 读 `.docpath/**`、跑 kernel、缓存快照、`ctx.provide` | 不做 UI、不做格式化展示逻辑 |
| `kernel` | 解析/归一化/聚合/统计/term 匹配，全部纯函数 | **禁止 `import node:fs`**、禁止任何 IO |
| `client` | 渲染 Tab、订阅快照、中英文案 | 禁止直接读文件、禁止复算业务指标 |

### 2.2 cordis 三项契约检查的落地方式

| 契约 | 落地 |
| --- | --- |
| `client.inject` 声明 | `export const inject = ['slots', 'sessions', 'locale', 'betterSidebar']`（缺声明会运行时缺失依赖） |
| `cordis.patch.yml` 存在 | 包根声明 `- insert: [{ id: docpath-lens, name: dsh-plugin-docpath }]`，并在 `package.json` 的 `dsh.bundle.patch` 指向它 |
| `host.provide` 桥 | host `ctx.provide('docpathLens', service)`；client 用**惰性 resolver** 每次重取（容忍插件加载顺序不确定） |

**惰性 resolver 是必须的**：harness-lens 实战证明 host/client 就绪顺序不保证，
直接 `ctx.get` 一次会拿到 `undefined`。

### 2.3 构建（双输出，照抄 harness-lens 已跑通配置）

```ts
// tsdown.config.ts 两个 entry
// ① host:  ESM / node  → lib/{index,cli,kernel}.js
// ② client: CJS / browser → lib/client.js
//    用 banner/footer 包成：
//    window.__ModuleLoader__.load({ id: "dsh-plugin-docpath", factory: (require) => { ... } })
```

`NodeNext` 相对 import 必须带 `.js` 后缀。

---

## 3. 数据契约（逐 Tab 到字段级）

统一约定：所有数据源缺失 → 该 Tab 标记 `degraded` 并展示空态，**不整体崩溃**（NFR-3）。
`schema_version` 不匹配 → 尽力解析 + 顶部提示「数据格式版本不匹配」。

### Tab 1 — 工作流（Workflow）

| 项 | 来源文件 | 字段 |
| --- | --- | --- |
| 任务 ID / 标题 | `workspace/state.json` | `task_id`, `task_title` |
| 阶段 / 门禁 | `workspace/state.json` | `phase`, `gate` |
| 当前步骤文案 | `workspace/state.json` | `current_step` |
| 复杂度 / 工作流档位 | `workspace/state.json` | `level`, `workflow_profile` |
| 时间 | `workspace/state.json` | `started_at`, `updated_at` |
| 下一步建议命令 | `workspace/agent-snapshot.json` | `recommended_command` |
| 合法状态转移 | `workspace/agent-snapshot.json` | `next_valid_events[]` |
| 步骤清单 | `tasks/<task_id>/plan.json` | `steps[].{id, name, description, acceptance, dependencies, status}` |
| 规约摘要 | `tasks/<task_id>/spec.json` | `scope`, `acceptance_criteria`, `decision_brief` |

**降级**：`agent-snapshot.json` 常滞后于 `state.json`（实测快照停在 `T-20260910-quick-test-4-10-init` 而 state 已 `idle`）——
**以 `state.json` 为准**，快照仅作补充，二者不一致时标记「快照滞后」。

**进度计算**：`steps` 中 `status === 'done'` 的占比（实测状态值：`done`）。

### Tab 2 — 耗时（Perf）

| 项 | 来源 | 字段 / 算法 |
| --- | --- | --- |
| 命令耗时分布 | `workspace/trace.jsonl` | `{cmd, durationMs}` 按 `cmd` 聚合 `n / avg / p50 / p95 / max` |
| 时间窗过滤 | `trace.jsonl` | `ts` |
| 会话过滤 | `trace.jsonl` | `session`, `agent` |
| 失败命令 | `trace.jsonl` | `exitCode !== 0` |
| 门禁历史 | `workspace/check-history.json` | `timestamp`, `passed`, `failedChecks[]`, `branch`, `worktreeDirty` |
| 最近门禁详情 | `workspace/last-check.json` | `passed`, `check_count`, `checks[].{name, passed, output, category}` |

**实测基线（1699 条 trace）**：

```
check   n=110  avg=113,793ms   max=241,329ms   ← 量级异常
done    n= 15  avg=123,839ms   max=661,561ms   ← 量级异常
review  n= 92  avg=  1,282ms   max=  4,958ms
go      n=161  avg=    668ms   max=  1,687ms
next    n=191  avg=    366ms   max=    813ms
backlog n=328  avg=    188ms   max=  1,243ms
```

**异常判定**：与全命令中位数比值 > 50× 标红（当前 `check` 约 300×，稳稳触发）。
面板要能回答「什么时候开始慢的」→ 按 `ts` 分桶出趋势。

**采样策略（原设计只说"取尾部 5000 条"，已细化）**：单纯取尾部 N 条在日志长期
增长后会失真（尾部样本可能横跨数月）。改为**双约束**：先按 `ts` 过滤出默认时间窗
（如近 30 天），再在窗内取最多 5000 条。这样"平均耗时"始终是当前窗口的真实语义，
不随日志总量漂移。

**trace.jsonl 有零丢失轮转（已查证，修正原假设）**：原设计假设它"无限增长"，
**错了**。`src/utils/trace.ts:231-248` 实测：超过 2000 条时保留最近 1000 条，
裁掉的旧条目**归档到月文件** `trace-YYYY-MM.jsonl`（非丢弃）。

由此两个结论：

1. **无需实现裁剪逻辑**：文件本身有上界（1000~2000 条），直接全量读即可，
   单文件 < 1000 条时解析开销可忽略。原设计的"尾部 5000 条"设错了量级。
2. **但历史会散落到月文件**：`trace.jsonl` 只反映**最近窗口**，
   要做长期趋势必须合并读 `trace-YYYY-MM.jsonl`。
   → **修正 Tab 2 的语义**：默认展示当前 `trace.jsonl`（近期），
   趋势图提供「含历史归档」开关，按需合并月文件（懒加载，非首屏）。

### Tab 3 — 文档（Docs）

| 项 | 来源 | 字段 |
| --- | --- | --- |
| 条目清单 | `docs-index.json` | `entries[].{path, type, scope, level, title, summary, updated_at, size, token_estimate, default_read, archive}` |
| 过滤 | 同上 | `scope`（`task`/`project`）、`type`（`runbook`/`index`/`reference`/`log`）、`archive` |
| 检索 | 同上 | `content_terms[]` + `title`/`summary` |
| 索引策略 | 同上 | `policy.mode`（实测 `index-first`）、`policy.default_context_token_budget`（15000） |

**减载是硬约束（NFR-2）**。实测体积：

| 方案 | 体积 |
| --- | --- |
| 全量（含 `content_terms`） | **1026 KB** |
| 剥离 `content_terms` | **390 KB** |
| 剥离 + 仅 active（404/969） | 416 KB |

`content_terms` 独占 **62%** 体积且只服务全文检索 → **首屏绝不传输**。

**检索下沉**：client 输入关键词 → host 侧 kernel 在 `content_terms` 上做匹配 →
只回传命中条目的精简结构。host 侧可缓存 parsed index（按 `size` + `updated_at`
判定失效，避免每次 1MB 重新 parse）。

### Tab 4 — 事件流（Events）

| 项 | 来源 | 字段 |
| --- | --- | --- |
| 执行事件 | `workspace/breadcrumb.jsonl` | `{taskId, step, status, context, timestamp}` 反序 |
| 决策 ADR | `workspace/decisions.jsonl` | `{id, taskId, category, context, decision, impact, alternatives[], createdAt}` |
| 按任务过滤 | 两者 | `taskId` |

**状态值实测**：`breadcrumb.status` 共三种 —— `done`(136) / `in_progress`(53) /
`blocked`(18)。原设计只写了 `done`/`blocked`，**漏了 `in_progress`**（占 26%）。

**量级失衡（原设计缺陷，已修正）**：实测 `breadcrumb.jsonl` 207 条 vs
`decisions.jsonl` **仅 8 条**，差两个数量级。原设计把两者平铺进同一条时间线，
结果是 ADR 会被 207 条执行事件彻底淹没。修正：**Tab 4 内再分两个子视图** ——
「执行流」（breadcrumb，主）与「决策」（decisions，次，默认折叠），
ADR 不做无限滚动，直接全量展示（8 条量级无需分页）。

**快照滞后可精确判定**：`agent-snapshot.json` 实测带 `updated_at` 字段（原设计漏列），
可与 `state.json` 的 `updated_at` 直接比大小判定滞后，不必靠猜。

**已知数据噪声**：`breadcrumb.jsonl` 中 `taskId: "unknown"` 的有 3 条
（idle 期跑 `check` 产生）。UI 归到「未归属」分组，不混入当前任务时间线。

---

## 4. 同步与性能

```
fs.watch('.docpath/', {recursive: true})  ──去抖 200ms──▶ refresh()
                                                            │
                                          兜底心跳 2s ──────┤
                                                            ▼
                                          kernel 解析 → 新快照 → watchers 广播
```

- **去抖 400ms / 心跳 5000ms**：原写 200ms/2s 是照搬 harness-lens（它观察小体积
  `.mstar/`）。本插件要 parse 1MB 级 `docs-index.json`，**2s 心跳会持续吃 CPU** ——
  改用 `dsh-plugin-doc-lens` 的参数（实测 `rescanIntervalMs ?? 5000`、
  `watchDebounceMs ?? 400`），更贴合大文件场景。
- **刷新不丢更新**：进行中又来触发 → 记 `pendingTrigger`，结束后补跑。
- **异常不冒泡**：refresh 抛错只 `console.error` 并保留上次快照。
- **首屏预算 < 200ms**（NFR-2）：直读 JSON 无子进程；实测 `status` CLI 单次 358ms，
  直读小文件 < 50ms，瓶颈只在 `docs-index`（已减载）。
- **dispose**：清理 watcher + timer + 订阅，避免泄漏。

**工程根解析（关键，已修正）**：

原设计写「从 `process.cwd()` 向上找 `.docpath/`」——**这是错的**。
实测 `dsh-plugin-desktop/src/window-options.ts` 里渲染进程 `sandbox: true` +
`nodeIntegration: false`，host 跑在**主进程**，其 `process.cwd()` 是 DSH 应用自身
的工作目录，**不是用户工程目录**。向上探测 8 层会探测到 DSH 自己的目录去。

正确解法照 `dsh-plugin-devflow/src/index.ts:85-155` 的三级兜底：

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| ① | `sessions.get(sessionId)?.header?.cwd` | **会话工作区**（dsh-session 提供），最准 |
| ② | `lastKnownWorkspace` | 最近一次成功解析的工作区，随每次解析刷新，兜住「Agent 调工具不带 sessionId」 |
| ③ | `process.env.DOCPATH_HOST_CWD ?? process.cwd()` | 仅当该目录下确实存在 `.docpath/` 才采用 |

三级都失败 → 面板显示「未定位到 DocPath 工程」空态，**不猜、不静默降级到错误目录**。

**多会话隔离（原设计缺失，已补）**：侧边栏 Tab 是按会话渲染的
（`component(props: { scope: { sessionId } })`），但 host 单例服务只绑一个 root ——
两个会话开不同工程会互相污染。修正：**host 按 sessionId 维护
`Map<sessionId, RootState>`**，每个会话独立快照、独立 watcher；
`subscribe(sessionId, cb)` 带会话维度。会话 dispose 时清理对应条目。

注意 `~/.docpath/projects.sqlite` 全局注册表含大量 stale 条目（实测有已删除的
`/tmp/*` 临时项目），**首版不消费它**。

---

## 5. UI 版式

单面板 + 顶部 Tab 切换，跟随 DSH 现有主题（不自带色板，避免与 R-230 一样的视觉重做陷阱）。

```
┌──────────────────────────────────────┐
│ [工作流] [耗时] [文档] [事件流]        │  ← Tab，耗时 Tab 带徽标（异常时）
├──────────────────────────────────────┤
│  ⬤ T-20260910-...          idle/none  │  ← 状态徽章
│  ──────────────────────────────────  │
│  当前步骤: 质量检查通过 (5 项)          │
│  进度: ▓▓▓▓▓░░░ 5/6                   │
│  下一步: docpath review               │
│  ──────────────────────────────────  │
│  ☑ S1 梳理...                         │
│  ☑ S2 ...                             │
│  ☐ S3 ...                             │
└──────────────────────────────────────┘
```

- **Tab 徽标**：耗时 Tab 在有量级异常命令（如 `check`）时显示警示点 —— 这是本插件
  最能立刻兑现价值的地方（用户原始痛点）。
- **degraded 标记**：某数据源失败时该 Tab 标题加 `~` 并在区内说明原因。
- **空态**：无活跃任务时明确写「当前无活跃任务」，不渲染假数据。
- **本地化**：`locale.register` 注册 `zh` / `en`，`view.docpathLens` = 「DocPath 检视」/「DocPath Lens」。

---

## 6. 里程碑

粒度按「一次验证能验收」。

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| **M0 骨架** | 包结构 + `cordis.patch.yml` + tsdown 双输出 + **三级工程根解析（含多会话分桶）** + host provide + client 侧边栏 Tab 渲染真实 `state.json` 的 phase/gate | 插件可加载；侧边栏能看到真实工作流状态（非占位）；**换一个会话/工程时数据与当前会话一致**（验证多会话隔离） |
| **M1 kernel** | 纯函数：parse state/plan/breadcrumb/decisions + trace 聚合 + docs 减载 | `vitest` 通过，fixture 驱动，零 IO |
| **M2 Tab-1 工作流** | 完整任务卡 + 步骤清单 + 进度 + 推荐命令 | 与本仓库真实任务比对一致 |
| **M3 Tab-2 耗时** | trace 聚合 + 异常标红 + check-history 趋势 + 历史归档合并开关 | 能复现本文实测基线数字（`check` avg 113s）；开启归档后趋势不因轮转断裂 |
| **M4 Tab-3 文档** | 减载清单 + 过滤 + host 侧检索 | 首屏传输 ≤ 390KB |
| **M5 Tab-4 事件流** | breadcrumb + decisions 时间线 + 按任务过滤 | 能区分 `unknown` 噪声条目 |
| **M6 同步与打磨** | fs.watch 去抖 + 心跳 + dispose + 降级提示 + i18n | 改 `.docpath/` 后面板 2s 内自动更新；卸载无泄漏 |

**M0 先行**：先证明「插件能加载 + 能看到真数据」，再堆功能 —— 避免 R-230 式范围失控。

---

## 7. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **host 主进程 cwd ≠ 用户工程目录** | 面板读到错误工程甚至读不到 | 三级兜底：会话 `header.cwd` → `lastKnownWorkspace` → 含 `.docpath/` 的 hostCwd；失败显示空态不猜 |
| **多会话多工程互相污染** | 观察错乱（最易被忽略的 bug） | host 按 `sessionId` 分桶 `Map`，各会话独立快照/watcher/dispose |
| 与 docpath 内部 schema 耦合 | docpath 升级后插件解析失败 | kernel 层容错 + `schema_version` 校验 + degraded 降级，不崩 |
| `docs-index.json` 体积增长 | 首屏变慢、心跳吃 CPU | 剥离 `content_terms` + 按 `size/updated_at` 缓存 + 检索下沉 host + 心跳放宽到 5s |
| `trace.jsonl` 轮转丢历史 | 长期趋势失真（>2000 条时旧条目移到月文件） | 默认展示当前文件（近期）；趋势图提供「含历史归档」开关，懒加载合并 `trace-YYYY-MM.jsonl` |
| host/client 就绪顺序不定 | `ctx.get` 拿不到服务 | 惰性 resolver 每次重取（harness-lens 已验证） |
| `agent-snapshot.json` 滞后 | 展示过期信息 | 以 `state.json` 为准，用两者 `updated_at` 比对判定 |
| 事件流量级失衡 | ADR 被执行事件淹没 | Tab 4 分子视图（执行流主 / 决策折叠） |
| 全局 projects.sqlite 含 stale 路径 | 展示失效项目 | 首版不消费该表 |
| 范围膨胀（R-230 重演） | 无法收口 | 只读 + 单面板 Tab + 不自带主题，M0 先验证链路 |

---

## 8. 实现前已核实事项

设计阶段已到 `dsh-plugin-doc-lens` / `dsh-plugin-harness-lens` 源码核对，以下不再是假设：

1. **`betterSidebar.registerTab` 签名**（三个插件一致）：
   `{ id, title: string | (() => string), icon?, order?, single?, badge?, component }`，
   返回 disposer。`order` 参考值：harness-lens 用 `60`。
   `badge(ctx, scope, state)` 可返回字符串/数字 —— **本插件的「耗时异常」徽标正好用这里**。
2. **降级路径可用**：`slots.register({ name: 'conversation.view', id, order, locale, label })`，
   且三个插件都先用 `slots.inject('conversation.view', factory)` 包裹。
3. **`ctx.provide` / `ctx.get` 用鸭子类型**：两个插件都写成
   `const provider = ctx as { provide; on; get? }` 并 `try/catch` 包裹 ——
   说明 cordis 类型不可靠，**必须照抄这个降级写法**，不要直接用 `Context` 类型。
4. **`window.__ModuleLoader__` 契约稳定**：tsdown client 输出用
   `banner: 'window.__ModuleLoader__.load({ id: "<pkg>", factory: (require) => {'` /
   `footer: 'return module.exports; } });'` + `intro: 'var module = { exports: {} }; ...'` 包裹。

**新增一条待验证**：`inject` 数组里声明了 `betterSidebar`，但类型是
`betterSidebar?: BetterSidebarLike`（可选）—— 说明**未组合时该依赖可能不存在**，
代码必须先判 `undefined` 再降级，不可假定注入成功。

### 8.1 未验证项 —— 挑刺后已查证结果

| # | 原问题 | 查证结果 |
| --- | --- | --- |
| 1 | `sessions` 在主进程是否可用 | ✅ **可用**。`dsh-plugin-devflow/src/index.ts:511` 在 host 侧 `export const inject = ['tools', 'systemPrompt', 'sessions']`，`apply` 内直接 `ctx.sessions as SessionsLike`。三级兜底第一级成立 |
| 2 | `trace.jsonl` 有无轮转 | ✅ **有零丢失轮转**（已修正 §3 Tab 2 的错误假设）。`src/utils/trace.ts:231-248`：>2000 条保留最近 1000，旧条目归档月文件 |
| 3 | `workspaces` 与 `sessions` 的关系 | ⚠️ 未查证，但**已不影响设计** —— `workspaces` 是 client 侧 inject（`dsh-plugin-desktop/src/client/index.ts:26`），主进程不可用；host 侧只用 `sessions` 即可 |
| 4 | 多会话 dispose 时机 | ⚠️ **仍未验证** —— 会话关闭时 host 如何感知。实现 M0 时需实测；兜底方案：LRU 上限（如 8 个会话）+ 空闲超时清理，避免无限增长 |

**结论**：M0 的前置阻塞只剩第 4 项，且有兜底方案，不构成开工阻塞。
