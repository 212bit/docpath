# T-20260908-5-backlog-id-active-archived-id - 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)

> backlog_id: R-322
> backlog_source: docpath backlog add

## 1. 背景与动机

R-321 取证: R-260/261/262/263/268 在 active 与 archived 各存一条,是同 id 下两条不同需求(不同 title/task),非陈旧副本;根因 R-273 前 worktree 号池 stale 撞号。groom 已加非破坏性检测暴露。本条目负责真正的数据迁移。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-322-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
  - 来源 backlog: R-322

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)

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
- 当前问题: R-321 取证: R-260/261/262/263/268 在 active 与 archived 各存一条,是同 id 下两条不同需求(不同 title/task),非陈旧副本;根因 R-273 前 worktree 号池 stale 撞号。groom 已加非破坏性检测暴露。本条目负责真正的数据迁移。
- 目标: 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
- 背景: 来自 backlog R-322，Decision Brief 证据: ADR-20260909-001: 5 起历史撞号重分配为 R-323~R-327 并完成归档与双向链接修复
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户明确认可 R-323~R-327 唯一 ID 重分配与平滑迁移方案

### 已有 Decision Brief (来自 backlog evidence)

ADR-20260909-001: 5 起历史撞号重分配为 R-323~R-327 并完成归档与双向链接修复

## 5. 验收标准

- [ ] AC-1: 1) 逐条定权威归属;2) 冲突方重分配唯一 id 或合并,修 links.task/spec 与历史引用;3) 迁移后 groom 无撞号告警;4) 需独立 Decision Brief+用户确认(改 id 牵动引用,非 trivial)。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-322 与任务 T-20260908-5-backlog-id-active-archived-id 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
