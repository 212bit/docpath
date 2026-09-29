# T-20260929-feat-plan-fr-docpath-plan-force - feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成

> backlog_id: R-443
> backlog_source: docpath backlog add

## 1. 背景与动机

实战 R-099 发现执行计划生成与规格推断存在两处体验缺陷：
1. `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。
2. 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。
  - 来源 backlog: R-443
- [ ] FR-2: 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成

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
- 当前问题: 实战 R-099 发现执行计划生成与规格推断存在两处体验缺陷：
- 目标: feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成
- 背景: 来自 backlog R-443
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: `extractFunctionalRequirements` 仅从 `## 功能需求` 或显式 FR 列表中提取需求，背景列表不参与 FR fallback（回退为单一需求 FR-1）
- [ ] AC-2: `docpath plan` 增加 `--force` 选项，强制覆盖已有 `plan.md`
- [ ] AC-3: 当 `spec.json` 变更时给出提示或自动更新计划
- [ ] AC-4: 补充对应的单元测试并通过质量门禁
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-443 与任务 T-20260929-feat-plan-fr-docpath-plan-force 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
