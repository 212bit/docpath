## 执行计划

### S1: 梳理 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。
- [x] S1: 梳理 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。
- **描述**: 根据 spec 明确 FR-1: 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。 的实现边界和验收口径。
- **验收条件**: AC-1: 设计文档覆盖 FR-1～FR-8 全部条目，分层架构明确标出 host/client/kernel 各自职责与禁止事项。
- **依赖**: 无

### S2: 实现 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。
- [x] S2: 实现 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。
- **描述**: 在现有架构内完成 FR-1: 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。 的代码与文档更新。
- **验收条件**: FR-1 产出分层架构设计，遵循 DSH 插件预设 —— - `host`：只做文件 IO 与 `ctx.provide('docpathLens')` 桥，绝不做 UI； - `kernel`：零 IO 纯函数（解析/归一化/聚合/耗时统计/term 匹配），可单测； - `client`：只做渲染，经 `ctx.get('docpathLens')` 消费快照。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 为每个 Tab 标注消费的具体文件路径与字段，并给出 `schema_version` 不匹配 / 文件缺失时的降级策略；**不得设计未实测过的字段**。
- [x] S3: 实现 FR-2 为每个 Tab 标注消费的具体文件路径与字段，并给出 `schema_version` 不匹配 / 文件缺失时的降级策略；**不得设计未实测过的字段**。
- **描述**: 在现有架构内完成 FR-2: 为每个 Tab 标注消费的具体文件路径与字段，并给出 `schema_version` 不匹配 / 文件缺失时的降级策略；**不得设计未实测过的字段**。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 当前任务卡 —— `state.json` + `agent-snapshot.json` + `plan.json` 合成「任务标题 / phase / gate / 当前步骤 / 步骤清单（含 status）/ 进度 / `recommended_command` / `next_valid_events`」。
- [x] S4: 实现 FR-3 当前任务卡 —— `state.json` + `agent-snapshot.json` + `plan.json` 合成「任务标题 / phase / gate / 当前步骤 / 步骤清单（含 status）/ 进度 / `recommended_command` / `next_valid_events`」。
- **描述**: 在现有架构内完成 FR-3: 当前任务卡 —— `state.json` + `agent-snapshot.json` + `plan.json` 合成「任务标题 / phase / gate / 当前步骤 / 步骤清单（含 status）/ 进度 / `recommended_command` / `next_valid_events`」。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 可观测面板 —— `trace.jsonl` 按 `cmd` 聚合 `{n, avg, p50, p95, max}`，标注量级异常（如 `check` 113s）；`check-history.json` 渲染门禁通过率趋势；支持按时间窗过滤。
- [x] S5: 实现 FR-4 可观测面板 —— `trace.jsonl` 按 `cmd` 聚合 `{n, avg, p50, p95, max}`，标注量级异常（如 `check` 113s）；`check-history.json` 渲染门禁通过率趋势；支持按时间窗过滤。
- **描述**: 在现有架构内完成 FR-4: 可观测面板 —— `trace.jsonl` 按 `cmd` 聚合 `{n, avg, p50, p95, max}`，标注量级异常（如 `check` 113s）；`check-history.json` 渲染门禁通过率趋势；支持按时间窗过滤。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 `docs-index.json` 减载浏览 —— 首屏剥离 `content_terms`（1026KB→390KB），按 `scope`/`type`/`archive` 过滤，搜索走 host 侧 kernel 匹配而非整体下发。
- [x] S6: 实现 FR-5 `docs-index.json` 减载浏览 —— 首屏剥离 `content_terms`（1026KB→390KB），按 `scope`/`type`/`archive` 过滤，搜索走 host 侧 kernel 匹配而非整体下发。
- **描述**: 在现有架构内完成 FR-5: `docs-index.json` 减载浏览 —— 首屏剥离 `content_terms`（1026KB→390KB），按 `scope`/`type`/`archive` 过滤，搜索走 host 侧 kernel 匹配而非整体下发。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 `breadcrumb.jsonl` + `decisions.jsonl` 反序时间线，展示 `step/status/context` 与 ADR（`category/decision/impact`），支持按 `taskId` 过滤。
- [x] S7: 实现 FR-6 `breadcrumb.jsonl` + `decisions.jsonl` 反序时间线，展示 `step/status/context` 与 ADR（`category/decision/impact`），支持按 `taskId` 过滤。
- **描述**: 在现有架构内完成 FR-6: `breadcrumb.jsonl` + `decisions.jsonl` 反序时间线，展示 `step/status/context` 与 ADR（`category/decision/impact`），支持按 `taskId` 过滤。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 实现 FR-7 host 侧 `fs.watch` 监听 `.docpath/` 去抖（200ms）+ 兜底心跳（2s），跨 Electron 边界经快照广播；插件卸载时释放监听器。
- [x] S8: 实现 FR-7 host 侧 `fs.watch` 监听 `.docpath/` 去抖（200ms）+ 兜底心跳（2s），跨 Electron 边界经快照广播；插件卸载时释放监听器。
- **描述**: 在现有架构内完成 FR-7: host 侧 `fs.watch` 监听 `.docpath/` 去抖（200ms）+ 兜底心跳（2s），跨 Electron 边界经快照广播；插件卸载时释放监听器。。
- **验收条件**: FR-7 已实现，并保持现有工作流兼容。
- **依赖**: S7

### S9: 实现 FR-8 client 优先 `betterSidebar.registerTab`，未组合时降级 `slots.register('conversation.view')`；中英文本地化（`locale.register`）。
- [x] S9: 实现 FR-8 client 优先 `betterSidebar.registerTab`，未组合时降级 `slots.register('conversation.view')`；中英文本地化（`locale.register`）。
- **描述**: 在现有架构内完成 FR-8: client 优先 `betterSidebar.registerTab`，未组合时降级 `slots.register('conversation.view')`；中英文本地化（`locale.register`）。。
- **验收条件**: FR-8 已实现，并保持现有工作流兼容。
- **依赖**: S8

### S10: 验证验收标准
- [x] S10: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 设计文档覆盖 FR-1～FR-8 全部条目，分层架构明确标出 host/client/kernel 各自职责与禁止事项。；AC-2: 数据契约逐 Tab 标注到具体文件路径 + 字段名（如 `trace.jsonl.durationMs`），并给出缺失/版本不匹配的降级策略；**所有字段均来自实测，无臆造**。；AC-3: 性能预算有实测依据 —— 首屏 < 200ms、`docs-index` 减载至 ≤ 390KB，并写明减载手段。；AC-4: cordis 三项契约检查（client.inject / cordis.patch.yml / host.provide）在设计中逐条给出落地方式。；AC-5: 明确写出只读边界与「不做什么」，含 R-230 失败归因的复用。；AC-6: 里程碑拆分到「一次验证能验收」的粒度，M0 能证明插件可加载 + 侧边栏可见真实状态。；AC-7: 设计经用户确认，未确认前不进入实现。
- **验收条件**: AC-1: 设计文档覆盖 FR-1～FR-8 全部条目，分层架构明确标出 host/client/kernel 各自职责与禁止事项。；AC-2: 数据契约逐 Tab 标注到具体文件路径 + 字段名（如 `trace.jsonl.durationMs`），并给出缺失/版本不匹配的降级策略；**所有字段均来自实测，无臆造**。；AC-3: 性能预算有实测依据 —— 首屏 < 200ms、`docs-index` 减载至 ≤ 390KB，并写明减载手段。；AC-4: cordis 三项契约检查（client.inject / cordis.patch.yml / host.provide）在设计中逐条给出落地方式。；AC-5: 明确写出只读边界与「不做什么」，含 R-230 失败归因的复用。；AC-6: 里程碑拆分到「一次验证能验收」的粒度，M0 能证明插件可加载 + 侧边栏可见真实状态。；AC-7: 设计经用户确认，未确认前不进入实现。
- **依赖**: S9

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8
- [x] S9
- [x] S10

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10
