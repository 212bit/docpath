# T-20260613-schema-first-json-jsonl - Schema-first JSON/JSONL 真源迁移

> backlog_id: R-163
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

当前 DocPath 仍有多处以 Markdown 作为任务计划、执行日志、决策和展示文档的混合真源，导致 check/go/next/review/journal 需要用正则解析半结构化 Markdown。R-162 已证明 current.md 这类派生视图不应作为完成门禁真源。下一步需要把 DocPath 的状态和任务真源统一迁向 schema-first JSON/JSONL：JSON 用于固定结构与快照，JSONL 用于追加事件流，Markdown 降级为可重建派生视图。此 backlog 统一承载完整迁移，不拆分多个 backlog；实现计划内部可分阶段交付。

## 验收

1. 明确架构决策：真源层采用 JSON/JSONL，Markdown 仅作为派生视图，AI 不直接落账，状态变更仍必须通过 CLI 事务和文件锁。2. Phase 1 完成 breadcrumb.jsonl 与 plan.json 的双写双读，旧 breadcrumb.md/plan.md fallback 兼容，check/go/next 完成度和漂移逻辑优先读取结构化真源。3. Phase 2 完成 spec.json 与 decisions.jsonl 的结构化真源设计和迁移，长文本允许保留 Markdown 字符串，decisions 保留轮转和 markdown render。4. Phase 3 停止核心命令从 Markdown 解析真源，Markdown 只由 render/show 命令生成或读取旧任务兼容层。5. 提供 schema version、TypeScript 类型、运行时校验、迁移/回滚路径和旧任务兼容测试。6. 增加覆盖 plan 重复 checklist、breadcrumb tail 读取、归档后 check、JSON/JSONL 迁移、Markdown render 可重建的测试。7. 不一次性删除现有 Markdown 文件，不允许 AI 直接写 JSON/JSONL 真源文件绕过 CLI。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 引入 schema-first 结构化真源
  - 为固定结构文档提供 JSON 真源，至少覆盖 `plan.json`、`spec.json`，保留 schema version、TypeScript 类型与运行时校验。
- [ ] FR-2: 引入追加型 JSONL 事件流
  - 为执行记录和决策记录提供 JSONL 真源，至少覆盖 `breadcrumb.jsonl`、`decisions.jsonl`，保留追加、读取最近 N 条、轮转和 Markdown 渲染能力。
- [ ] FR-3: 双写双读与兼容迁移
  - CLI 写路径必须双写 JSON/JSONL 与现有 Markdown；读路径优先结构化真源，缺失时 fallback 到旧 Markdown。
- [ ] FR-4: Markdown 降级为派生视图
  - `current.md`、`plan.md`、`spec.md`、`breadcrumb.md`、`decisions.md` 不再作为核心命令的首选解析真源；旧任务兼容层除外。
- [ ] FR-5: 保持 CLI 落账边界
  - AI/用户不能绕过 CLI 直接修改结构化真源；状态变更仍经由 CLI、事务/文件锁、FSM 与合法性检查。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 渐进迁移，不一次性删除现有 Markdown 文件
- [ ] NFR-3: 结构化解析失败必须 fail loud，不能静默接受损坏真源
- [ ] NFR-4: 新增测试覆盖旧任务兼容、JSON/JSONL 迁移、重复 checklist、breadcrumb tail、归档后 check 和 Markdown render 可重建

## 3. 范围界定

### 包含
- Phase 1: `plan.json` 与 `breadcrumb.jsonl` 的 schema、读写 helper、双写双读、fallback 和核心命令接入。
- Phase 2: `spec.json` 与 `decisions.jsonl` 的 schema、迁移/渲染、决策轮转兼容。
- Phase 3: 核心命令停止从 Markdown 解析真源，Markdown 只作为派生视图或旧任务兼容输入。
- 迁移/回滚路径、运行时校验、类型定义和兼容测试。

### 不包含
- 不删除历史 Markdown 文件。
- 不引入数据库、服务端或外部依赖。
- 不实现权限系统本身；本任务只保留 CLI 写边界和结构化真源约束。
- 不改变 DocPath 的 24 状态 FSM 语义。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [x] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: DocPath 仍把 Markdown 同时当作人类视图和机器真源，`check/go/next/review/journal` 需要用正则解析半结构化 Markdown；R-162 已证明派生视图参与门禁会造成误判。
- 目标: 建立 schema-first JSON/JSONL 真源，让状态、计划、执行记录和决策记录可验证、可迁移、可回滚，并保持现有 Markdown 工作流兼容。
- 背景: 用户已确认多人团队定位下，DocPath 的价值在于 AI 工作流的事务与审计层；AI 决定做什么，CLI 负责安全落账。
- 可选方案:
  1. 继续使用 Markdown 真源并加正则修补：短期成本低，但解析脆弱问题会持续扩散。
  2. 一次性切到纯 JSON/JSONL：解析可靠，但破坏历史任务和人工调试路径，迁移风险高。
  3. 双写双读渐进迁移：先引入结构化真源，保留 Markdown 派生视图和旧任务 fallback，逐步收敛核心命令读路径。
- 推荐方案: 采用方案 3。JSON 承载固定结构快照，JSONL 承载追加事件流；Markdown 降级为 CLI 渲染的派生视图和旧任务兼容输入。
- 不做什么: 不让 AI 直接写结构化真源，不删除旧 Markdown，不引入数据库，不改变 FSM 状态语义。
- 成本: 需要新增 schema/type/helper、双写兼容层、迁移/渲染代码和覆盖旧任务的回归测试；短期会增加读写路径复杂度。
- 风险: 双写真源可能短期不一致；结构化校验过严可能阻断旧任务；迁移范围过大会影响核心命令稳定性。
- 回滚方案: 保留旧 Markdown 文件与 fallback 解析；如果结构化文件缺失或校验失败，可通过 CLI 重新从 Markdown render/migrate，必要时回退到 Markdown fallback 读路径。
- 用户确认: 用户已在 2026-06-14 明确要求“完成R-163.md”，且此前确认“新增backlog，把这些都在一个backlog 内完成”。

## 5. 验收标准

- [ ] AC-1: `plan.json`、`spec.json`、`breadcrumb.jsonl`、`decisions.jsonl` 均有 schema version、TypeScript 类型和运行时校验。
- [ ] AC-2: `plan.md/spec.md` 写入或迁移时生成结构化 JSON；`breadcrumb.md/decisions.md` 追加时生成 JSONL；旧 Markdown 文件继续保留。
- [ ] AC-3: `check/go/next/agent step/journal` 的完成度、漂移、tail 和决策读取路径优先读取 JSON/JSONL，缺失时 fallback 到旧 Markdown。
- [ ] AC-4: Markdown 视图可由结构化真源重建；结构化真源损坏时给出明确错误或走显式旧任务兼容路径。
- [ ] AC-5: 测试覆盖 plan 重复 checklist、breadcrumb tail 读取、归档后 check、JSON/JSONL 迁移、decisions 轮转兼容和 Markdown render 可重建。
- [ ] AC-6: 不删除现有 Markdown 文件，不新增 AI 直接写真源的入口，不破坏现有 `docpath check/review/journal` 流程。
- [ ] AC-7: backlog 条目 R-163 与任务 T-20260613-schema-first-json-jsonl 建立双向关联，并完成 check/review/journal。

---

*此文件由 `docpath backlog promote` 生成。*
