# T-20260706-done-checklist - 步骤主条目 done 后底部 checklist 未同步勾选

> backlog_id: R-253

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: markPlanStep 同步更新所有匹配 step id 的 checklist 行（section 内 + 底部 ## Checklist）

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- markPlanStep 改为全局正则替换所有匹配 id 的 checklist 行

### 不包含
- parsePlanSteps 解析逻辑改动（drift 检测仍用第一处）

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
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: markPlanStep 只同步 section 内 checklist，漏了底部 ## Checklist，导致 plan.md 内部状态不一致
- 目标: agent step done 后 plan.md 所有同 id checklist 行一致更新
- 可选方案:
  - 方案 A: markPlanStep 用全局正则替换所有匹配 id 的 checklist 行
  - 方案 B: 删除底部 ## Checklist，只保留 section 内
- 推荐方案: 方案 A
- 决策理由: 方案 A 保留两份 checklist（section 内带标题、底部汇总），仅修同步逻辑；方案 B 改 plan 模板影响面大
- 不做什么: 不改 parsePlanSteps、不改 plan 模板结构
- 成本: 低，单一函数局部改动
- 风险: 低，全局正则仅匹配 `- [x] S1` 形式，误伤风险小
- 回滚方案: 回退 plan-sync.ts 改动
- 用户确认: 同意对计划同步机制（plan-sync.ts）进行修改，已由用户（mac）于 2026-07-06 确认重大变更。

## 5. 验收标准

- [ ] AC-1: markPlanStep 更新 plan.md 时，同步更新所有匹配该 step id 的 checklist 行（section 内 + 底部 ## Checklist）
- [ ] AC-2: 回归: agent step --status done 后，plan.md 的 section 内 checklist 与底部 Checklist 同 id 行均变为 [x]
- [ ] AC-3: 回归: 其他 step 的 checklist 行不受影响
- [ ] AC-4: backlog 条目 R-253 与任务 T-20260706-done-checklist 建立双向关联

## Journal Record

### 📝 任务摘要
修复 `docpath agent step --status done` 状态同步逻辑中，`markPlanStep` 只更新 plan.md 中第一处匹配的 checklist 行，而漏掉底部 `## Checklist` 汇总行的问题。

### 🏗️ 架构决策
- **全局正则匹配替换**: 将 `markPlanStep` 原本的 `checklistIndex` 精确单处替换，改为使用全局正则表达式 `checklistLineRegex`（支持带或不带加粗、以及各种标记状态），同步更新 `plan.md` 中所有匹配该 step id 的 checklist 行，确保段落小节和底部 Checklist 一致性，防止状态不同步导致 agent 还原或漂移。

### 💡 经验教训
- **非单点真相漏洞**: 同一属性（步骤完成状态）在同一个文档（`plan.md`）中多处展现时，如果修改时只更新单一处，会导致下游 agent 为了消除不一致性而手动 patch，进而引发 checksum 漂移等级联问题。应统一由工具层在修改时全局联动更新。

### 🔮 后续改进
- 考虑对 `plan.md` 的结构进行精简，例如只保留一份汇总 checklist 以降低冗余度，或在 `plan` 校验时加入两处不一致的警告。
