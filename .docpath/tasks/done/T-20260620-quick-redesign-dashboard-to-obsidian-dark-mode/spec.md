# T-20260620-quick-redesign-dashboard-to-obsidian-dark-mode - Redesign Dashboard to Obsidian Dark Mode

> workflow_profile: quick
> source: docpath quick

## 1. 背景与动机

Quick task intent record. This task is intentionally lightweight and uses proportional gates.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Redesign Dashboard to Obsidian Dark Mode

### 非功能需求
- [ ] NFR-1: Keep the change scoped and auditable.

## 3. 范围界定

### 包含
- Redesign Dashboard to Obsidian Dark Mode

### 不包含
- Full spec/plan ceremony for standard or strict tasks.
- Architecture, protocol, migration, permission, or broad module changes.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Workflow profile | quick / standard | quick | User chose the fast track for a tiny task. |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: Tiny task governance should be proportional.
- 推荐方案: Use quick profile, require check, skip full review by profile.
- 用户确认: `docpath quick` invocation.

## 5. 验收标准

- [ ] AC-1: The scoped change is completed.
- [ ] AC-2: `docpath check` passes before closeout.
- [ ] AC-3: Review skip is recorded as quick-profile policy evidence.
