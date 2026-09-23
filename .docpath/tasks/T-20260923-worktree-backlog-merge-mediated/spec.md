# T-20260923-worktree-backlog-merge-mediated - worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）

> backlog_id: R-356
> backlog_source: docpath backlog add

## 1. 背景与动机

AGENTS.md 自认已知限制：worktree 的 .docpath/backlog 是 merge-mediated 快照（traced copy），可 stale，重复登记的结构性根因。多会话并行时一个会话看不到另一会话新登记/已合并成果，capture 时无法跨 worktree 去重（本 checkout+主 checkout 扫描只能覆盖两处，兄弟 worktree 不可见）。优化包内的 capture 期去重只覆盖 main+本 checkout，本条负责根治：需要新的共享可见性设计（方向待 brainstorm/refine，可能是共享真源/事件流/锁+索引，不在本条预设）。

## 2. 需求清单

### 功能需求
- [ ] FR-1: worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）
  - 来源 backlog: R-356

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）

### 不包含
- 待在后续规划中补充

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
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: AGENTS.md 自认已知限制：worktree 的 .docpath/backlog 是 merge-mediated 快照（traced copy），可 stale，重复登记的结构性根因。多会话并行时一个会话看不到另一会话新登记/已合并成果，capture 时无法跨 worktree 去重（本 checkout+主 checkout 扫描只能覆盖两处，兄弟 worktree 不可见）。优化包内的 capture 期去重只覆盖 main+本 checkout，本条负责根治：需要新的共享可见性设计（方向待 brainstorm/refine，可能是共享真源/事件流/锁+索引，不在本条预设）。
- 目标: worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）
- 背景: 来自 backlog R-356，Decision Brief 证据: .docpath/backlog/R356-decision-brief.md
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-09-23 用户裁定：采纳方案 B（跨 worktree 扫描 + 共享注册表）；注册表位置 .git/docpath-backlog-registry.json；实时性下限=capture 时（点时刻）可见，不做后台实时推送。

### 已有 Decision Brief (来自 backlog evidence)

.docpath/backlog/R356-decision-brief.md

## 5. 验收标准

- [ ] AC-1: 多 worktree 并行 capture 时，任一会话能感知其他活跃 worktree 已存在的同标题/同 id 条目并在产生时提示；不再产生结构性重复登记。决策记录（Decision Brief）+ 用户确认后实现（涉及共享模型变更，可能推翻 R-238 Option B/R-273 资源分层，属重大变更门禁）。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-356 与任务 T-20260923-worktree-backlog-merge-mediated 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
