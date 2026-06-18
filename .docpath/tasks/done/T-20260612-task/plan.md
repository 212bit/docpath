## 执行计划

### S1: 定义上下文索引与预算模型
- [x] S1: 定义上下文索引与预算模型
- **描述**: 梳理现有 `docs-index.json`、任务级 `context-index.json`、`context.ts`/`reveal.ts` token 估算逻辑，定义统一的文档索引字段、default_read 判定和默认预算策略。
- **验收条件**: 有明确的数据结构和默认读取规则；索引字段覆盖 path/kind/scope/default_read/summary/token_estimate/updated_at/task_id/topic_tags；不会把索引设计成正文真源。
- **依赖**: 无

### S2: 扩展 docs scan / index 生成
- [x] S2: 扩展 docs scan / index 生成
- **描述**: 修改 `src/commands/docs.ts` 或相关工具，生成兼容旧字段且包含 token_estimate/default_read/archive/task_id/topic_tags 的项目级文档索引。
- **验收条件**: `docpath docs scan` 可生成扩展索引；旧读取方不因缺字段失败；归档、模板、workspace 大日志默认标记为非默认读取。
- **依赖**: S1

### S3: 收敛 context/reveal 默认读取行为
- [x] S3: 收敛 context/reveal 默认读取行为
- **描述**: 修改 `src/commands/context.ts` 与 `src/commands/reveal.ts`，默认只读取当前任务包、必要规则摘要和索引摘要；归档正文必须显式参数或 task/topic 命中后才展开。
- **验收条件**: 默认 `docpath context` 不包含 `.docpath/tasks/done` 正文；`reveal --level 3` 不再无条件代表完整历史正文；输出包含被排除区域摘要和 token 估算。
- **依赖**: S2

### S4: 增加归档按需展开入口
- [x] S4: 增加归档按需展开入口
- **描述**: 为 `context` / `reveal` 增加或完善 `--topic`、`--task-id`、`--include-archive` 等按需展开能力，并限制路径只能解析到 `.docpath` 内部。
- **验收条件**: 指定 task_id/topic 时能定位历史任务或相关文档；未指定时不会读取归档正文；非法 task_id/path fail-loud。
- **依赖**: S3

### S5: 高信号化 rules 与 learn 沉淀
- [x] S5: 高信号化 rules 与 learn 沉淀
- **描述**: 强化 `src/utils/rules.ts` 与 `src/commands/learn.ts` 的 preferred/legacy 规则路径和候选 lesson 分类，避免“完成 N/N 步”这类低信号经验写入长期 rules。
- **验收条件**: `.docpath/rules/*` 是 preferred 真源；legacy `.docpath/spec/*` 仍兼容；低信号 lesson 被标记为 archive-only/skip/duplicate，不写入长期 rules。
- **依赖**: S1

### S6: 增加上下文健康 check 门禁
- [x] S6: 增加上下文健康 check 门禁
- **描述**: 在 `src/commands/check.ts` 增加上下文预算、索引陈旧/损坏、规则双真源、当前任务 spec/plan 完整性的诊断。MVP 中预算超限先 warning，任务文件缺失和规则冲突可阻塞。
- **验收条件**: `docpath check` 能报告默认上下文超预算、docs-index 缺失/陈旧、rules/spec 双真源、当前任务缺 spec/plan；输出包含修复建议。
- **依赖**: S2, S5

### S7: 测试与验证闭环
- [x] S7: 测试与验证闭环
- **描述**: 补充 CLI 行为测试和单元测试，覆盖默认不读归档、显式按需读归档、索引字段兼容、learn 低信号过滤、check 上下文健康诊断。运行类型检查和相关测试。
- **验收条件**: 聚焦测试通过；`pnpm run typecheck` 通过；必要时运行 `pnpm test`；`docpath next --agent` 能给出正确后续路由且无 plan/breadcrumb 漂移。
- **依赖**: S3, S4, S5, S6

## 依赖关系图
S1 → S2 → S3 → S4 → S7
S1 → S5 → S6 → S7
S2 → S6
