# T-20260703-support-brand-new-project-intake-workflo - Support Brand-New Project Intake Workflow From Source Documents

> backlog_id: R-242

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Provide a project-intake capture route for raw source material.
- [ ] FR-2: Store project-intake artifacts separately enough that they are not confused with normal small backlog items.
- [ ] FR-3: Support at least text/markdown inputs in the MVP. Binary PPT/PDF ingestion is out of MVP unless already converted to text.
- [ ] FR-4: Generate or guide creation of structured analysis sections: requirements, product, UI/UX, technical, risks, and open questions.
- [ ] FR-5: Generate or guide creation of a project brief with goals, actors, scope, non-goals, assumptions, dependencies, risks, and acceptance candidates.
- [ ] FR-6: Support later creation of PRD/spec and architecture brief evidence from the intake output.
- [ ] FR-7: Support conversion from confirmed project-intake output into milestone plan and/or normal backlog items.
- [ ] FR-8: Require explicit user confirmation before promotion into implementation or generated backlog items.
- [ ] FR-9: Update agent routing so new-project requests do not default to quick or underspecified backlog flows.
- [ ] FR-10: Preserve existing backlog commands and behavior for incremental tasks.

### 非功能需求
- [ ] NFR-1: Deterministic CLI state changes must not depend on network or hidden LLM execution.
- [ ] NFR-2: Generated artifacts must be auditable through existing DocPath summaries and canonical files.
- [ ] NFR-3: Existing quick/backlog/spec/plan tests must continue to pass.
- [ ] NFR-4: The workflow must be resumable through `docpath next --agent`.
- [ ] NFR-5: Errors must identify missing readiness evidence and next corrective commands.

## 3. 范围界定

### 包含
- CLI workflow design and implementation for project-intake MVP.
- Artifact schema or file layout for project-intake evidence.
- Routing updates for `next/status/check` where needed.
- Readiness gates that distinguish raw, analyzed, confirmed, planned, and decomposed states.
- Tests covering project-intake and backlog compatibility.

### 不包含
- Native binary PPT/PDF parsing.
- Product UI implementation.
- Automatic external LLM calls.
- Replacing current backlog, quick, or standard task flows.
- Auto-promoting generated backlog items without user confirmation.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] API / 数据契约
- [x] 架构 / 模块边界
- [x] 工作流 / Agent 行为
- [x] 范围扩大
- [x] 长期维护成本增加

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: DocPath lacks a strong path for brand-new projects that start from raw source documents instead of scoped backlog items.
- 目标: Create an upstream project-intake workflow that turns raw project materials into confirmed project artifacts and then backlog items.
- 背景: R-242 was captured, analyzed, confirmed, and explicitly approved for promotion by the user on 2026-07-03.
- 可选方案:
  - 方案 A: Keep using backlog for everything.
  - 方案 B: Extend backlog with a project profile.
  - 方案 C: Add a distinct project-intake workflow that can later generate backlog items.
- 推荐方案: 方案 C.
- 决策理由: Brand-new project discovery has different semantics from incremental backlog work. A separate workflow keeps granularity clear, avoids breaking existing backlog behavior, and gives agents a safer route for analysis before implementation.
- 不做什么: Do not implement binary PPT/PDF parsing, product UI, external LLM calls, or automatic promotion.
- 成本: Medium to high; this touches workflow state, routing, artifact conventions, CLI commands, and tests.
- 风险: Misclassification as quick, artifact sprawl, compatibility regressions in backlog flows, and unclear conversion gates.
- 回滚方案: Keep existing backlog behavior untouched; disable or remove project-intake routes without changing backlog semantics.
- 用户确认: User explicitly requested: “继续推进，同意promote 成active task 然后进入spec/plan”.

## 5. 验收标准

- [ ] AC-1: A standard-level project-intake spec and plan exist for `R-242`.
- [ ] AC-2: The plan includes discovery, design, implementation, tests, and closeout steps.
- [ ] AC-3: The future implementation defines project-intake stages, artifacts, readiness gates, and CLI routes.
- [ ] AC-4: Existing backlog and quick workflows remain compatible.
- [ ] AC-5: The workflow blocks implementation/decomposition until explicit user confirmation.
- [ ] AC-6: Tests cover routing, readiness gates, artifact generation, and backlog compatibility.
