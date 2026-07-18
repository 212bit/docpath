# T-20260718-skill-file-set-mismatch-review - 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review

> backlog_id: R-285
> backlog_source: docpath backlog capture

## 1. 背景与动机

R-279 收口实测 (2026-07-17): review.json 的 skill_reviews 是工作区级持久, 上一任务 (R-276, 6 个 TS 文件) 的 pass 证据在新任务 (R-279, 2 个 TS 文件) review 时因 file set mismatch 仅降级为 evidence_warnings, 审查仍 approved=true——未做过本任务语言级审查即通过门禁, 与 R-276 封住的绕过同族。mismatch-as-warning 设计本意是同任务内文件集演进 (相关用例断言 approved=true), 但跨任务陈旧证据应失效: 候选修法 (a) journal/任务切换时清空 skill_reviews (b) 证据绑定 task_id, 不匹配即 invalid (c) mismatch 仅在指纹同源时降级。待裁定。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-285-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
  - 来源 backlog: R-285

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review

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
- 当前问题: R-279 收口实测 (2026-07-17): review.json 的 skill_reviews 是工作区级持久, 上一任务 (R-276, 6 个 TS 文件) 的 pass 证据在新任务 (R-279, 2 个 TS 文件) review 时因 file set mismatch 仅降级为 evidence_warnings, 审查仍 approved=true——未做过本任务语言级审查即通过门禁, 与 R-276 封住的绕过同族。mismatch-as-warning 设计本意是同任务内文件集演进 (相关用例断言 approved=true), 但跨任务陈旧证据应失效: 候选修法 (a) journal/任务切换时清空 skill_reviews (b) 证据绑定 task_id, 不匹配即 invalid (c) mismatch 仅在指纹同源时降级。待裁定。
- 目标: 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review
- 背景: 来自 backlog R-285
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

- [ ] AC-1: 在 `ReviewEvidence` 和 `LastCheckEvidence` 结构中引入 `task_id` 属性，并在生成证据时写入。
- [ ] AC-2: 读取证据时，如果发现其 `task_id` 与当前的活跃 `task_id` 存在冲突/不匹配，则判定为失效并返回 `null`。
- [ ] AC-3: 保留对无 `task_id` 的历史陈旧/测试证据的向后兼容，不强制失效。
- [ ] AC-4: 提供完整的自动化单元测试验证隔离行为。
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-285 与任务 T-20260718-skill-file-set-mismatch-review 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
