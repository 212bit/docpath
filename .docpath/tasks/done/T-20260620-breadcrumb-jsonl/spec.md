# T-20260620-breadcrumb-jsonl - breadcrumb.jsonl 按任务边界分隔，防止无限增长

> backlog_id: R-220
> backlog_source: docpath backlog capture

## 1. 背景与动机

当前 workspace/breadcrumb.jsonl 是跨任务追加的运行事件真源，长期执行后会持续增长，影响 next/status/reveal/check 等读取近期事件的命令性能，也让单任务恢复上下文混入历史噪声。目标是在保持现有 CLI 语义和迁移兼容的前提下，按任务边界分隔 breadcrumb 事件，使活跃任务读取范围可控，历史任务仍可追溯。

## 2. 需求清单

### 功能需求
- [ ] FR-1: breadcrumb 写入应按 taskId 产生任务级 JSONL 真源，使新任务或任务切换后的当前任务上下文不依赖无限增长的全局 workspace/breadcrumb.jsonl。
- [ ] FR-2: readBreadcrumb / readRecentBreadcrumbEntries 等公共读取边界应保持向后兼容；当存在当前任务 task-scoped breadcrumb 时默认读取当前任务切片，否则回退旧 workspace/breadcrumb.jsonl 或 breadcrumb.md。
- [ ] FR-3: 旧项目首次写入时应能从 legacy workspace/breadcrumb.jsonl 或 breadcrumb.md 懒迁移同 taskId 历史事件，不丢失已有 breadcrumb 历史。
- [ ] FR-4: workspace/breadcrumb.jsonl 与 workspace/breadcrumb.md 保持兼容视图和近期视图，现有命令、模板和手工 debug 路径不应失效。
- [ ] FR-5: 增加自动化测试覆盖任务级写入、旧全局 JSONL 回退/迁移、任务切换隔离、next/check/reveal 等读取方兼容，以及大文件增长控制。

### 非功能需求
- [ ] NFR-1: 保持现有 DocPath 生命周期命令和 Agent 协议兼容。
- [ ] NFR-2: 不删除 legacy workspace/breadcrumb.jsonl；先兼容再逐步收敛，降低迁移风险。
- [ ] NFR-3: 当前任务读取路径应避免无界扫描全局历史；显式报告/归档场景可继续聚合历史。

## 3. 范围界定

### 包含
- src/engine/breadcrumb.ts 的任务级 JSONL 存储、读取和懒迁移。
- 必要的读取方兼容验证，重点覆盖 next/check/reveal/runtime/journal 等依赖 readBreadcrumb 的路径。
- tests/breadcrumb.test.mjs 及相关 focused tests。

### 不包含
- 不引入数据库或外部存储。
- 不删除 workspace/breadcrumb.jsonl 或 workspace/breadcrumb.md。
- 不重写 dashboard 事件模型；仅保持现有读取兼容。
- 不改变用户手动操作协议，仍通过 DocPath CLI 读写 breadcrumb。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 任务边界存储 | 继续全局 JSONL / task-local JSONL / 数据库 | task-local JSONL | 与现有 .docpath/tasks/<taskId>/ 证据模型一致，改动小且便于归档追溯 |
| 2 | 迁移策略 | 一次性迁移并删除旧文件 / 懒迁移并保留旧文件 | 懒迁移并保留旧文件 | 降低数据丢失和旧项目兼容风险 |
| 3 | 公共 API | 大规模改所有调用方 / 保持 readBreadcrumb 边界并内部兼容 | 保持公共边界 | 降低命令层回归面，测试可集中在 breadcrumb 引擎和关键读取方 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 架构 / 模块边界
- [x] 工作流 / Agent 行为
- [x] 长期维护成本增加

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: workspace/breadcrumb.jsonl 作为跨任务追加真源，会把当前任务恢复上下文和历史任务事件耦合在一起；长期运行后读取、漂移判断和上下文摘要都可能受无界历史影响。
- 目标: 让 breadcrumb 事件按 taskId 拥有任务级真源，同时保持旧 workspace breadcrumb 文件可读可回退，避免破坏现有 CLI/Agent 工作流。
- 背景: R-220 已经通过 brainstorm dry-run 分析并被 accept/promote；S1 技术分析确认核心边界在 src/engine/breadcrumb.ts，读取方包括 next/status/reveal/check/journal/runtime/dashboard 等。
- 可选方案: A 继续依赖全局 JSONL + cleanup；B 新增 task-local JSONL 并保留全局兼容视图；C 引入数据库/索引层统一事件存储。
- 推荐方案: B。它解决当前任务读取边界问题，同时避免数据库迁移和大规模调用方改动。
- 不做什么: 不删除 legacy workspace/breadcrumb.jsonl；不改变用户命令协议；不把 dashboard 事件模型纳入本次重构。
- 成本: 中等。核心实现集中，但需要覆盖迁移、兼容读取、任务切换和质量门禁回归。
- 风险: 默认读取语义改变可能影响依赖全局历史的报告命令；迁移逻辑若有缺陷可能漏读旧事件；cleanup/gc 需要继续理解 legacy 视图。
- 回滚方案: 回滚本任务提交后恢复全局 breadcrumb 真源；保留的 workspace/breadcrumb.jsonl 和 breadcrumb.md 可继续作为旧实现输入。
- 用户确认: 2026-06-20 用户明确回复“同意继续”，确认采用 task-local JSONL、保留旧 workspace breadcrumb 兼容视图、不引入数据库、不删除旧全局 breadcrumb 文件。

## 5. 验收标准

- [ ] AC-1: 新任务或任务切换时 breadcrumb 事件写入任务级 JSONL，当前任务 readBreadcrumb 默认读取当前任务切片。
- [ ] AC-2: 旧 workspace/breadcrumb.jsonl 和 breadcrumb.md 仍可被读取；首次写入能把同 taskId 历史事件迁移到任务级 JSONL。
- [ ] AC-3: next/status/check/reveal 等读取近期事件的命令保持兼容，不因任务级存储产生 plan/breadcrumb 漂移误报。
- [ ] AC-4: workspace/breadcrumb.jsonl 与 breadcrumb.md 继续作为兼容/近期视图存在，compact --cleanup 行为不回归。
- [ ] AC-5: 自动化测试覆盖新旧格式、任务切换、迁移和大文件增长控制。
- [ ] AC-6: pnpm test、docpath check、docpath review 通过。
