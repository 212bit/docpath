# T-20260612-task - 上下文读取策略索引化与规则高信号化

> backlog_id: R-155
> analysis: .docpath/tasks/current/analysis/

## 1. 背景与动机

当前 DocPath 的长期记忆正在快速增长：Markdown 总量约 947KB，粗略估算约 24 万 token；`.docpath/workspace/decisions.md` 单文件约 58k token；`.docpath/tasks/done` 约 8.5 万 token。历史任务归档、workspace 日志、模板、设计文档、规则文件处在同一可读取面中，Agent 在恢复上下文时容易过度读取，既浪费 token，也会放大 current/canonical、rules/spec、archive/index 之间的漂移风险。

本任务将上下文策略从“文档都可被 Agent 读”升级为“索引优先、当前任务优先、归档按需读取、规则高信号化”。核心目标是保留长期记忆和历史追溯能力，同时让默认上下文更小、更稳定、更可验证。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath context` 和 `docpath reveal` 默认只输出路由索引、当前任务包、必要规则摘要，不默认读取 `.docpath/tasks/done`、`templates`、完整 `docs` 或大型 workspace 日志。
- [ ] FR-2: 扩展项目级文档索引，记录 `path/kind/scope/default_read/summary/token_estimate/updated_at/task_id/topic_tags` 等字段，并兼容旧索引字段。
- [ ] FR-3: 历史归档必须按需读取；只有显式 `--task-id`、`--topic`、`--include-archive` 或等价参数时，才展开归档正文。
- [ ] FR-4: `next --agent` 的 `required_files` 保持最小必要，不包含历史归档正文，并能输出索引/预算/规则健康摘要。
- [ ] FR-5: `learn` 或相关规则沉淀逻辑将候选经验区分为高信号规则、归档型经验、重复项和低信号项；低信号流水经验不得写入长期 rules。
- [ ] FR-6: `.docpath/rules/style.md` 与 `.docpath/rules/architecture.md` 作为长期规则 preferred 真源；legacy `.docpath/spec/style.md` 与 `.docpath/spec/architecture.md` 保留只读兼容和诊断提示。
- [ ] FR-7: `docpath check` 增加上下文健康检查，至少能报告默认上下文超预算、索引缺失/陈旧、规则双真源、当前任务缺 spec/plan 等风险。

### 非功能需求
- [ ] NFR-1: 默认上下文 token 估算以 15k 作为 MVP 预算参考；预算超限在 MVP 先 warning，稳定后可升级为 blocking gate。
- [ ] NFR-2: 不删除历史任务、历史决策或历史文档正文；归档只改变默认读取策略。
- [ ] NFR-3: 新索引 schema 需要向后兼容旧 `docs-index.json`，缺失字段使用安全默认值。
- [ ] NFR-4: `--topic`、`--task-id`、`--include-archive` 等参数不得允许读取 `.docpath` 工作区外部路径。
- [ ] NFR-5: 输出字段保持 Agent 友好和稳定；新增字段以追加为主，避免破坏既有调用方。

## 3. 范围界定

### 包含
- 修改 `context`、`reveal`、`next --agent` 的默认读取策略和输出摘要。
- 扩展或重建 docs index / context index 的 schema 与生成逻辑。
- 为归档任务建立按 task_id/topic 定位和显式展开机制。
- 强化 rules preferred/legacy 路径诊断和高信号学习策略。
- 在 check 中增加上下文预算、索引、规则真源、当前任务文件完整性相关检查。
- 增加单元和 CLI 行为测试，覆盖默认不读归档、显式读取归档、预算报警、规则路径诊断、低信号 lesson 过滤。

### 不包含
- 不删除 `.docpath/tasks/done` 历史正文。
- 不引入外部数据库、远程服务或网络检索能力。
- 不重写 DocPath 核心状态机和 backlog 状态机。
- 不实现 Dashboard 写操作。
- 不一次性迁移所有历史决策到 ADR 多文件结构；该项可作为后续任务。
- 不以修复旧 backlog 条目的 `links.spec` 作为本任务完成阻塞项，除非本任务直接修改 backlog groom 策略。

### 待确认
- Dashboard 是否在后续单独增加 Context Budget 页面。
- 预算超限从 warning 升级为 blocking 的阈值和时机。
- 是否提供交互式选择索引项后再展开正文。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 默认读取策略 | 全量文档可读 / 索引优先 | 索引优先 | 降低 token 消耗和旧事实误读风险 |
| 2 | 历史归档处理 | 删除 / 默认读取 / 按需读取 | 按需读取 | 保留长期记忆，同时降低默认上下文 |
| 3 | 规则真源路径 | `.docpath/spec/*` / `.docpath/rules/*` | `.docpath/rules/*` preferred | `rules.ts` 已有 preferred/legacy 结构，`next --agent` 已指向 rules 路径 |
| 4 | 预算门禁 | 立即 blocking / 先 warning | MVP 先 warning | token 估算是近似值，先收集误报情况 |
| 5 | docs-index 角色 | 正文真源 / 导航索引 | 导航索引 | 避免索引复制正文造成新漂移 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: DocPath 文档体量已增长到默认全量读取不经济，且多真源/归档/运行态文档混读会引发漂移和旧事实误读。
- 目标: 默认只读索引、当前任务包和高信号规则；历史归档按需读取；长期规则保持高信号。
- 背景: 当前 context/reveal/next 已有渐进披露雏形，但 Level 3、docs-index、rules fallback、learn 沉淀策略仍不足以约束默认读取面。
- 可选方案: A 维持现状；B 删除历史文档；C 索引优先与按需展开；D 引入外部数据库。
- 推荐方案: 采用 C，保留历史正文，建立索引和预算门禁，明确归档按需读取。
- 不做什么: 不删除历史任务，不引入外部数据库，不重写 FSM，不实现 Dashboard 写操作。
- 成本: 需要修改 context/reveal/next/docs/learn/rules/check，并补充 CLI 行为测试。
- 风险: 默认上下文过度收敛导致背景不足；索引 schema 兼容风险；预算估算误报。
- 回滚方案: 保留 legacy rules 读取、显式 include archive/full 模式和可重建索引；必要时恢复旧 context 输出模式。
- 用户确认: 用户已明确回复“正式推进”，确认进入该架构与 Agent 行为调整方向。

## 4.2 UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

说明：本任务影响 CLI 信息架构和未来 Dashboard 数据模型，但 MVP 不实现新的产品 UI 页面。

## 5. 验收标准

- [ ] AC-1: `docpath context` 默认输出 token 估算低于 15k，且不包含 `.docpath/tasks/done` 正文。
- [ ] AC-2: `docpath reveal --level 2` 和默认 Level 3 行为输出索引摘要与当前任务包，不无条件展开完整历史归档。
- [ ] AC-3: 显式使用 task_id/topic/include-archive 参数时，可以定位并读取指定历史归档内容。
- [ ] AC-4: `docs scan` 或等价索引生成逻辑输出包含 `default_read` 与 `token_estimate` 的索引条目，并兼容旧字段读取。
- [ ] AC-5: `next --agent` 的 `required_files` 不包含历史正文路径，并能反映索引/预算/规则健康摘要。
- [ ] AC-6: `learn` 对低信号 lesson 候选不写入长期 rules，并能通过测试证明高信号/低信号分类行为。
- [ ] AC-7: `check` 能报告当前任务缺 spec/plan、规则 preferred/legacy 双真源、索引陈旧或默认上下文超预算风险。
- [ ] AC-8: `pnpm run typecheck` 和相关 CLI 行为测试通过。

## 6. 风险与依赖

- 依赖现有 `docs.ts`、`context.ts`、`reveal.ts`、`agent-output.ts`、`rules.ts`、`learn.ts`、`check.ts` 的模块边界。
- 需要保持 `.docpath/spec/*` legacy 兼容，避免已有项目升级后立即失效。
- 需要处理当前仓库已有 pending lesson 和 install-manifest-drift 对 check 的影响。
- token 估算只能作为近似预算，不应作为精确模型计费依据。
- 旧 reveal 文案中 Level 3 “完整历史”定义需要更新，否则会与新行为冲突。

## 7. 后续工作流

- 运行 `docpath plan` 生成执行计划。
- 按计划先实现索引 schema 和默认读取收敛，再补充 rules/learn/check 门禁。
- 运行聚焦测试和 `pnpm run typecheck`，最后运行 `docpath check`。
