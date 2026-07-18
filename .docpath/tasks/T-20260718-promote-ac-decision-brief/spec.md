# T-20260718-promote-ac-decision-brief - promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾

> backlog_id: R-284
> backlog_source: docpath backlog capture

## 1. 背景与动机

三次 promote 实证 (R-275/R-276/R-277): (1) AC 行 'AC-1: AC-1:' 双前缀——backlog 验收行自带编号再拼一次; (2) Decision Brief 解析出 '当前问题: ## 背景' 垃圾值——把节标题当正文; (3) 变更类型自动预勾两次不准 (R-275 勾架构/工作流, R-276 勾权限/范围扩大, 均需手动取消)——错误预勾比不勾糟, 看起来像已做判断。修法: AC 编号去重; Decision Brief 空值留空; 变更类型默认全不勾。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-284-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
  - 来源 backlog: R-284

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾

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
- 当前问题: 三次 promote 实证 (R-275/R-276/R-277): (1) AC 行 'AC-1: AC-1:' 双前缀——backlog 验收行自带编号再拼一次; (2) Decision Brief 解析出 '当前问题: ## 背景' 垃圾值——把节标题当正文; (3) 变更类型自动预勾两次不准 (R-275 勾架构/工作流, R-276 勾权限/范围扩大, 均需手动取消)——错误预勾比不勾糟, 看起来像已做判断。修法: AC 编号去重; Decision Brief 空值留空; 变更类型默认全不勾。
- 目标: promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾
- 背景: 来自 backlog R-284
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户确认提升 promote 脚手架质量和变更类型默认不勾行为

## 5. 验收标准

- [ ] AC-1: 修复 AC 行双前缀问题，如果 backlog 验收标准行中已包含 AC- 前缀则去重。 * 修复 Decision Brief 当前问题解析垃圾值问题，正确解析背景章节首行正文（排除标题本身）。 * 变更类型默认全部不勾选，防误触。 * 补充测试保障质量。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-284 与任务 T-20260718-promote-ac-decision-brief 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
