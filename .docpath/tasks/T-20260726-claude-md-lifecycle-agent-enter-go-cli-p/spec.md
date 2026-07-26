# T-20260726-claude-md-lifecycle-agent-enter-go-cli-p - CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go

> backlog_id: R-290
> backlog_source: docpath backlog capture

## 1. 背景与动机

CLAUDE.md Lifecycle 把 agent enter 排在 go 之前, CLI 实际在 planning 阶段 fail-loud 要求先 go; worktree 示例缺 go。Agent 按文档执行必然撞门禁(2026-07-26 实测)。14 份协议载体同病。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-290-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
  - 来源 backlog: R-290

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go

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
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: CLAUDE.md Lifecycle 把 agent enter 排在 go 之前, CLI 实际在 planning 阶段 fail-loud 要求先 go; worktree 示例缺 go。Agent 按文档执行必然撞门禁(2026-07-26 实测)。14 份协议载体同病。
- 目标: CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go
- 背景: 来自 backlog R-290
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-26 用户批准架构 review 后续路线并以 continue 授权实施 R-290（协议文档对齐 CLI 实际门禁语义, 纯文档修正无行为变更; 14 载体全链清扫符合 R-277 规则)

## 5. 验收标准

- [ ] AC-1: 全部载体顺序与 CLI 一致; grep 零残留; 仅文档变更
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-290 与任务 T-20260726-claude-md-lifecycle-agent-enter-go-cli-p 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
