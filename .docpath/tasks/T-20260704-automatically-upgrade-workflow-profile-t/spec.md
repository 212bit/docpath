# T-20260704-automatically-upgrade-workflow-profile-t - Automatically upgrade workflow profile to standard for high level tasks or spec requirements

> backlog_id: R-234
> backlog_source: docpath backlog capture

## 1. 背景与动机

DocPath currently lets backlog/spec flows retain lower workflow profiles even when the work is high-level or explicitly requires a spec. That can let broad workflow, architecture, or agent-behavior changes proceed with gates that are too light. Need a deterministic rule that automatically upgrades the workflow profile to standard when task level, spec requirement, or major-change indicators demand the standard gates.

## 1.1 已有证据

### 需求澄清历史 (brainstorm)

docpath brainstorm --dry-run --input 'Automatically upgrade workflow profile to standard for high level tasks or spec requirements' on 2026-07-04

### 深度分析摘要 (analysis)

R-234 analyzed backlog background/acceptance from docpath brainstorm dry-run on 2026-07-04; covers trigger conditions, compatibility boundaries, tests, and Decision Brief requirement.


## 2. 需求清单

### 功能需求
- [ ] FR-1: Automatically upgrade workflow profile to standard for high level tasks or spec requirements
  - 来源 backlog: R-234

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Automatically upgrade workflow profile to standard for high level tasks or spec requirements

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
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: DocPath can retain a lighter workflow profile for high-level tasks, spec-required work, or major workflow/architecture changes, which can bypass standard gates that should apply.
- 目标: Resolve those cases to the `standard` workflow profile deterministically while preserving existing quick and low-risk behavior.
- 背景: 来自 backlog R-234; user confirmed continuing with this workflow/agent behavior change on 2026-07-04.
- 可选方案:
  - 方案 A: Keep profile selection unchanged and rely on agents to notice risky scope.
  - 方案 B: Add deterministic profile upgrade rules for level, spec-required, and major-change signals.
- 推荐方案: 方案 B
- 决策理由: Deterministic upgrade rules make gates predictable, auditable, and testable without weakening quick compatibility.
- 不做什么: Do not remove quick workflow, force all tasks to standard, or introduce external/LLM-dependent classification.
- 成本: Medium; touches workflow profile resolution, routing/status hints, go/check behavior, and tests.
- 风险: Over-upgrading low-risk work or missing a major-change signal; tests and explicit reason strings should constrain both.
- 回滚方案: Revert the profile resolution rule changes and keep existing explicit profile behavior.
- 用户确认: User replied "继续" on 2026-07-04 after being shown the Decision Brief direction and pre-go confirmation requirement.

## 5. 验收标准

- [ ] AC-1: When a backlog item or task is level 2/3, requires a spec, or includes major-change categories such as workflow/agent behavior, architecture/module boundaries, API/data contracts, permissions, or long-term maintenance cost, DocPath resolves the workflow profile to standard. Existing quick/low-risk level 0/1 flows remain unchanged unless one of those indicators is present. Routing, status, plan/go/check behavior, and user-facing hints explain the upgrade reason. Tests cover quick compatibility, level-based upgrade, spec-required upgrade, and major-change upgrade. Because this changes workflow/agent behavior, implementation must include a Decision Brief and explicit user confirmation before go.
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-234 与任务 T-20260704-automatically-upgrade-workflow-profile-t 建立双向关联

## 6. S1 Implementation Boundary

- Centralize upgrade logic in `src/engine/workflow-profile.ts` as an effective profile resolver instead of scattering conditionals across commands.
- Upgrade only to `standard`; do not collapse `strict` down to standard and do not remove `instant` or `quick` as explicit profiles.
- Inputs should include stored profile, level, spec/plan requirements, and major-change signals parsed from task spec/backlog evidence where available.
- Runtime consumers should report both the effective profile and the reason when an upgrade happens, especially `next/status --agent` and human status output.
- `docpath quick` remains valid for tiny low-risk work. It should continue to create quick/instant tasks, with standard upgrade triggered only if later evidence indicates level 2/3, spec-required work, or major-change categories.
- Tests should cover quick compatibility, level 2/3 upgrade, spec-required upgrade, major-change upgrade, and reason visibility in routing/status output.

---

*此文件由 `docpath backlog promote` 生成。*
