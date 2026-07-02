# T-20260621-simplify-ui-design-gate-validation-to-on - Simplify UI design gate validation to only require ui-brief.md and design-approval.md

> backlog_id: R-228

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Simplify UI design gate validation to only require ui-brief.md and design-approval.md

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Simplify UI design gate validation to only require ui-brief.md and design-approval.md

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 frontend-stack + design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: ## 背景
- 目标: Simplify UI design gate validation to only require ui-brief.md and design-approval.md
- 背景: 来自 backlog R-228
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户确认简化UI门禁设计，只保留ui-brief.md与design-approval.md

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-228 与任务 T-20260621-simplify-ui-design-gate-validation-to-on 建立双向关联

## Journal Record

### 📝 任务摘要
简化了 DocPath UI 设计门禁校验流程，从强制校验 6 个文档简化为仅硬性要求 `ui-brief.md` 与已批准的 `design-approval.md`。

### 🏗️ 架构决策
- 门禁松绑：删除了对 `frontend-stack.md`、`design-preview.md`、`external-design-handoff.md` 和 `visual-acceptance.md` 的强校验和报错逻辑，使得它们转为选填项，减轻轻量 UI/前端任务的文档负担。
- 门禁收拢：将 `go` 门禁与 `check` 质量校验的 UI 产物校验逻辑对齐，仅保留最核心的意图声明与审批决策记录。

### 💡 经验教训
- 门禁设计应秉持「最小必要原则」，过多的空模板文件（如 handoff、acceptance）在简单修改时会成为形式主义负担，阻碍流畅的开发体验。

### 🔮 后续改进
- 可以在后续规划中考虑彻底合并 UI 相关的 Markdown 模板，以进一步减少文件碎片化。
