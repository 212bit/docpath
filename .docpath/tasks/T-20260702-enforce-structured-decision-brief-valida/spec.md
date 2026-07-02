# T-20260702-enforce-structured-decision-brief-valida - Enforce structured decision brief validation and add plan go reminders

> backlog_id: R-241
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

Enforce structured decision brief validation to guarantee knowledge retention quality, and add prompts for plan/go.

## 验收

The spec.json decision_brief is structured as an object; validation fails if fields are empty when gate is active; plan/go print developer prompts.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Enforce structured decision brief validation and add plan go reminders
  - 来源 backlog: R-241

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Enforce structured decision brief validation and add plan go reminders

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
- 当前问题: Enforce structured decision brief validation to guarantee knowledge retention quality, and add prompts for plan/go.
- 可选方案:
  - 方案 A: 保持原有 plain string 校验
  - 方案 B: 引入结构化验证并强化提醒
- 推荐方案: 方案 B
- 决策理由: 方案 B 在不影响兼容性的前提下保证知识固化质量，且能引导开发者即时记录决策。
- 不做什么: 不引入任何重量级 agent 自动总结流程
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 已在 implementation plan 批复并确认采用方案 B

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-241 与任务 T-20260702-enforce-structured-decision-brief-valida 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
