# T-20260612-journal-decisions-md-adr - 收紧 journal 到 decisions.md 的 ADR 写入规则

> backlog_id: R-159
> backlog_source: docpath backlog add

## 1. 背景与动机

`breadcrumb.md` 是短期执行轨迹，服务于断点恢复、plan/breadcrumb 漂移检测、`continue`、`next` 和当前任务执行证据。
`decisions.md` 是长期 ADR 索引，应该只保存具有复用价值的决策、触发条件、期望行为、影响边界和替代方案。

当前 `docpath journal` 会在普通任务归档时写入 `journal.archive` decision，并把当前任务的 breadcrumb 上下文批量塞进 ADR 背景。这会导致两个问题：

- `decisions.md` 与 `breadcrumb.md` 内容重复，长期日志里混入执行流水。
- `完成 N/N 步`、`质量检查通过`、`review 计数` 等低信号内容被长期保留，降低后续 `reveal`、review 和人工检索质量。

目标是把 `decisions.md` 的写入入口收紧为高信号 ADR：普通归档摘要留在任务归档、breadcrumb、last-check 或 review 证据中；只有真正可复用的架构、流程或行为决策进入 `decisions.md`。

## 2. 需求清单

### 功能需求

- [ ] FR-1: `docpath journal` 不再为普通任务归档无条件写入 `journal.archive` decision。
- [ ] FR-2: 从 journal/breadcrumb 提取到真实 ADR 时仍写入 `decisions.md`，并保留现有架构决策提取能力。
- [ ] FR-3: 写入 `decisions.md` 的条目必须具备明确的触发条件、期望行为、影响边界或替代方案，避免仅包含执行统计。
- [ ] FR-4: 跳过 `完成 N/N 步`、`质量检查通过`、`质量检查失败`、`代码审查: N 错误`、`知识归档完成` 等低信号流水。
- [ ] FR-5: `reveal` 与 `getRecentDecisions` 对已有 ADR 的读取行为不回归。
- [ ] FR-6: 文档说明 `decisions.md` 与 `breadcrumb.md` 的职责边界，以及普通 journal 归档不等于长期 ADR。

### 非功能需求

- [ ] NFR-1: 保持现有 DocPath journal/check/review 生命周期兼容，不新增必须的人工步骤。
- [ ] NFR-2: 变更必须可测试，覆盖非 ADR 跳过、真实 ADR 保留和 reveal/getRecentDecisions 不回归。
- [ ] NFR-3: 实现应保持本地、确定性、无网络依赖。
- [ ] NFR-4: 不清理用户已有历史归档内容，历史低信号清理由后续显式任务处理。

## 3. 范围界定

### 包含

- 修改 journal 写入 decisions 的策略。
- 为 ADR 候选增加可复用性/低信号过滤判断。
- 更新相关测试，覆盖 ordinary journal archive 不写入 decisions。
- 更新协议或命令文档中的职责边界描述。

### 不包含

- 不批量重写或删除当前 `.docpath/workspace/decisions.md` 的历史内容。
- 不改变 breadcrumb 的记录格式和 plan/breadcrumb 同步逻辑。
- 不改变 `docpath gc-decisions` 的归档策略。
- 不引入 LLM 或网络调用判断 ADR；本任务先用确定性规则收紧入口。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 普通 journal.archive 写入策略 | 继续无条件写入 / 条件写入 / 完全跳过 | 完全跳过普通归档 decision | 普通归档已有 breadcrumb、last-check、review 和任务归档证据，进入 ADR 会制造重复 |
| 2 | ADR 判断方式 | LLM 判断 / 确定性规则 / 仅人工标记 | 确定性规则 | CLI 默认离线运行，规则可测试、可回归，后续可在 learn 智能分类中扩展 |
| 3 | 历史低信号清理 | 本任务清理 / 后续任务清理 | 后续任务清理 | 本任务收紧未来写入，避免扩大修改面和误删历史证据 |
| 4 | 架构决策提取 | 移除 / 保留并过滤 | 保留并过滤 | R-023 已提供价值，问题在于普通归档摘要无条件入库 |

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
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [x] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: `docpath journal` 把普通归档摘要和 breadcrumb 流水写入长期 `decisions.md`，导致低信号内容与 breadcrumb 重复。
- 目标: `decisions.md` 只保存高信号 ADR；普通执行轨迹保留在 breadcrumb、last-check、review 和任务归档中。
- 背景: R-158 已解决 decisions 老化问题，但未解决 journal 写入语义过宽的问题。
- 可选方案: 继续无条件写入；仅按关键字过滤低信号；完全跳过普通 `journal.archive`，仅写入真实架构/流程 ADR。
- 推荐方案: 完全跳过普通 `journal.archive` decision，并对架构候选做高信号过滤后写入。
- 不做什么: 不批量清理历史 decisions；不改变 breadcrumb 格式；不引入网络或 LLM 判断。
- 成本: 需要调整 journal 写入逻辑、补充测试和文档；少量历史任务不会再在 decisions 中出现普通归档摘要。
- 风险: 过严过滤可能漏掉部分有价值决策；通过保留架构候选提取和测试真实 ADR 场景降低风险。
- 回滚方案: 恢复 `writeJournalDecisions` 中普通 `journal.archive` 的 appendDecision 调用。
- 用户确认: 2026-06-12 用户明确要求继续并按照流程完成 R-159。

## 5. 验收标准

- [ ] AC-1: 普通 `docpath journal` 完成归档后不再向 `decisions.md` 写入 `journal.archive` ADR。
- [ ] AC-2: 包含真实架构/流程决策的 breadcrumb 仍会写入 `decisions.md`，且 ADR 包含背景、决策、影响、替代方案和相关文件。
- [ ] AC-3: 低信号执行流水不会进入 `decisions.md`，包括完成步数、质量检查、review 计数和知识归档完成。
- [ ] AC-4: `tests/backlog-journal.test.mjs` 或同等测试覆盖非 ADR 跳过与真实 ADR 保留。
- [ ] AC-5: `tests/decisions.test.mjs` 中 `getRecentDecisions`/`gcDecisions` 行为不回归。
- [ ] AC-6: 文档明确 `breadcrumb.md` 与 `decisions.md` 的职责边界。

---

*此文件由 `docpath backlog promote` 生成，并在 R-159 执行前补充 Decision Brief。*
