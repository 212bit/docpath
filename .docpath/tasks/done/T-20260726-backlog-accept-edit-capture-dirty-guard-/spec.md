# T-20260726-backlog-accept-edit-capture-dirty-guard- - backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)

> backlog_id: R-313
> backlog_source: docpath backlog capture

## 1. 背景与动机

SynapBuddy 实测（2026-07-27）：`backlog accept` 产生的条目/索引变更让 worktree 变脏，quick/promote/agent enter 的 dirty guard 拒绝开新任务，必须先手动 chore(backlog) 收口。本仓库同病：本轮工程为此打了 12+ 个绕行提交。定性：backlog 记账（capture/add/edit/accept/drop 及索引重生成）是 DocPath 命令自己产出的簿记状态，与 docs-index 同类（R-270 已豁免先例）；guard 使命是防任务代码混入，拦簿记属误伤。

git-dirty-guard 内建簿记豁免 `isDocPathBookkeepingPath`（.docpath/backlog/** 全域 + backlog.md，含 archived/analysis）：assertCleanWorktreeForNewTask 与 execution-start 两处默认放行；非簿记脏文件拦截语义不变；changes --agent 的 outside-task 可见性不变（簿记随下次收口提交，历史仍可审计）。

## 2. 需求清单

### 功能需求
- [ ] FR-1: backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)
  - 来源 backlog: R-313

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

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
- 当前问题: SynapBuddy 实测（2026-07-27）：`backlog accept` 产生的条目/索引变更让 worktree 变脏，quick/promote/agent enter 的 dirty guard 拒绝开新任务，必须先手动 chore(backlog) 收口。本仓库同病：本轮工程为此打了 12+ 个绕行提交。定性：backlog 记账（capture/add/edit/accept/drop 及索引重生成）是 DocPath 命令自己产出的簿记状态，与 docs-index 同类（R-270 已豁免先例）；guard 使命是防任务代码混入，拦簿记属误伤。
- 目标: backlog 记账变更(accept/edit/capture 他条目)被 dirty guard 误伤, 阻塞开新任务需先手动收口 (SynapBuddy 实测, 本仓库亦 12+ 次 chore(backlog) 绕行)
- 背景: 来自 backlog R-313
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 仅 backlog 簿记脏文件时 quick/promote/agent enter/go 全部放行；混有业务脏文件仍拦。
- [ ] AC-2: 既有 dirty-guard 语义测试全绿 + 新增簿记放行/混合拦截两用例。
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-313 与任务 T-20260726-backlog-accept-edit-capture-dirty-guard- 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
