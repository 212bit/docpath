## 1. 目标与背景

目标：将 DocPath 的 Agent 上下文策略从“文档都可被读”收敛为“索引优先、当前任务优先、归档按需读取、规则高信号化”。本任务要降低默认上下文 token 消耗，减少文档真源漂移，同时保留长期记忆和历史追溯能力。

已验证事实：
- 当前 Markdown 总量约 947KB，粗略估算约 24 万 token。
- `.docpath/workspace/decisions.md` 单文件约 58k token，是最大 token 压力源。
- `.docpath/tasks/done` 约 8.5 万 token，应作为归档证据保留，但不应默认进入 Agent 上下文。
- `context`、`reveal`、`next --agent` 已有渐进披露和索引雏形，但默认读取边界、预算门禁、规则路径统一和历史按需读取仍不完整。
- 当前规则读取存在 preferred `.docpath/rules/*` 与 legacy `.docpath/spec/*` 回退逻辑，说明路径迁移尚未成为硬约束。

核心问题：DocPath 的长期记忆正在增长，但缺少强制的读取分层与预算反馈；历史、模板、运行态日志和规则文件容易在 Agent 恢复上下文时被过度读取，导致 token 浪费和错误引用旧事实。

## 2. 用户/角色/触发场景

主要用户：
- 编码 Agent：需要快速恢复当前任务，按 next 路由执行，不应扫描全量历史。
- 人类维护者：需要保留项目长期记忆，并能追溯历史任务、决策和规则来源。
- Review/Check 流程：需要判断当前任务是否缺证据、是否上下文过大、是否规则路径漂移。

触发场景：
- 新会话恢复任务时运行 `docpath status --agent`、`docpath next --agent`、`docpath context --agent`。
- Agent 遇到不确定实现时运行 `docpath reveal --topic <topic>`。
- 完成任务后 `journal -> learn` 尝试把经验写入长期规则。
- 历史任务数量增长后，`.docpath/tasks/done` 和 workspace 日志持续变大。

## 3. 功能需求矩阵（需求/优先级/验收/依赖）

| 需求 | 优先级 | 验收 | 依赖 |
|---|---|---|---|
| FR-1 默认上下文分层 | P0 | `context` / `reveal` 默认只输出 L0/L1：路由索引、当前任务包、必要规则摘要 | `context.ts`, `reveal.ts`, `agent-output.ts` |
| FR-2 项目级文档索引 | P0 | 索引记录 path/kind/scope/default_read/summary/token_estimate/updated_at，并能按 topic/task_id 过滤 | `docs.ts`, 新/扩展 docs-index schema |
| FR-3 归档按需读取 | P0 | `tasks/done` 不默认注入上下文；历史任务通过索引、task_id 或 topic 显式展开 | `reveal.ts`, `context.ts`, task index |
| FR-4 规则高信号化 | P0 | 长期规则只保留可执行约束、架构决策、真实避坑；低信号流水经验不写入 rules | `learn.ts`, `rules.ts` |
| FR-5 上下文预算门禁 | P1 | `check` 能报告默认上下文 token 超预算、索引陈旧、规则双真源、当前任务缺 spec/plan | `check.ts`, context estimator |
| FR-6 规则路径统一 | P1 | `.docpath/rules/*` 成为 preferred 真源；legacy `.docpath/spec/*` 只读兼容并可诊断漂移 | `rules.ts`, install/templates |
| FR-7 用户可显式扩展上下文 | P2 | 支持 `--include-archive`、`--topic`、`--task-id` 或等价参数按需展开 | `context.ts`, `reveal.ts` |

## 4. 非功能需求（性能/安全/合规/可观测性）

- 性能：默认上下文 token 估算应有明确预算，建议普通任务默认不超过 15k token；路由输出应保持小而稳定。
- 兼容性：保留 legacy `.docpath/spec/style.md`、`.docpath/spec/architecture.md` 的读取兼容，但新增诊断提示迁移到 `.docpath/rules/*`。
- 可维护性：索引 schema 应集中定义，避免 `docs.ts`、`context.ts`、`reveal.ts` 各自维护不同的文档条目结构。
- 可观测性：`context` 输出应显示 token 估算和被排除的高成本区域摘要，便于用户理解为什么没有读历史正文。
- 安全/边界：按需读取历史归档时必须限制在 `.docpath` 内部路径，避免 topic/path 参数变成任意文件读取入口。

## 5. 范围边界与明确不做

包含：
- 修改 Agent 默认上下文读取策略。
- 建立或扩展项目级文档索引和任务归档索引。
- 修改 rules/learn/check 的高信号规则与漂移检测逻辑。
- 补充测试覆盖：默认不读归档、按 topic/task_id 展开、预算报警、规则双真源诊断。

不包含：
- 不删除历史任务正文。
- 不引入外部数据库或网络服务。
- 不重写整个 DocPath 状态机。
- 不把 Dashboard 写操作纳入本任务。
- 不一次性清理所有历史文档内容；清理可作为后续任务执行。

非阻塞假设：
- 默认上下文预算阈值先采用 15k token，可在 spec 中调整。
- `.docpath/rules/*` 作为长期规则 preferred 路径，`.docpath/spec/*` 保留兼容。
