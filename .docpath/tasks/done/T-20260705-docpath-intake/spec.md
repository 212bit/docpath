# T-20260705-docpath-intake - 固化需求梳理流程为正式 DocPath intake 工作流

> backlog_id: R-245
> backlog_source: docpath backlog capture

## 1. 背景与动机

用户在 evoucher 需求讨论中发现 agent 仍会自由发挥。需要把需求梳理固化为 DocPath 正式 project-intake 工作流：原始材料捕获 -> 固定域分析 -> 缺口索引 -> 按对象澄清问题 -> 决策卡 -> 需求定稿 -> 拍板门 -> backlog guidance/种子。用户已确认方案 B：做成 DocPath 正式 intake 流程，而不是单项目文档。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-245-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 固化需求梳理流程为正式 DocPath intake 工作流
  - 来源 backlog: R-245

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 固化需求梳理流程为正式 DocPath intake 工作流

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
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: 固化需求梳理流程为正式 DocPath intake 工作流
- 背景: 来自 backlog R-245，Decision Brief 证据: .docpath/backlog/analysis/R-245-decision-brief.md
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户于 2026-07-05 回复‘认方案 B’，确认将需求梳理流程固化为 DocPath 正式 intake 工作流。

### 已有 Decision Brief (来自 backlog evidence)

.docpath/backlog/analysis/R-245-decision-brief.md

## 5. 验收标准

- [ ] AC-1: project-intake 文档/协议明确需求梳理阶段流水线和每阶段输出。2. next/status 或相关 project 命令能在 intake 阶段给出确定下一步，避免直接进入开发 backlog。3. 缺口索引、问题清单、决策卡、需求定稿、拍板门、backlog guidance 的职责边界被固化。4. 现有 project capture/analyze/brief/backlog 路径保持兼容。5. 有自动化测试或 CLI 快照验证新路由/输出。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-245 与任务 T-20260705-docpath-intake 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
