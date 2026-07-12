# T-20260712-quick-standard - Quick→Standard 自动升级衔接

> workflow_profile: standard
> backlog_id: R-258

## 1. 背景与动机

`check.ts` 在检测到 quick/instant 任务超出范围时，已自动更新 state.json 的 workflow_profile 为 standard。但升级后：

1. task ID 仍是 quick 风格（`T-20260712-quick-xxx`），没有自动获得规范 ID
2. spec.md 仍是 quick 模板（骨架内容），缺少 standard 模板应有的完整章节（Decision Brief、重大变更门禁等）
3. Agent 看到"升级了"但不知道下一步具体做什么
4. 需要手动 `docpath write-spec` 重新生成 spec

本任务在 `check.ts` 的 upgrade 分支中增加：升级时自动将 quick 风格的 spec.md 替换为 standard 模板，保留原有的 title 和需求摘要上下文。

## 2. 需求清单

### 功能需求
- [ ] FR-1: upgrade 时自动检测 spec.md 是否为 quick 风格（> workflow_profile: quick）
- [ ] FR-2: 替换为 standard spec 模板，保留原 title 和需求摘要
- [ ] FR-3: 输出清晰指引："spec 模板已升级至 standard 格式，请填写 Decision Brief 和验收标准"
- [ ] FR-4: 不破坏现有 spec.json 的结构（重新 write-spec 同步）

### 非功能需求
- [ ] NFR-1: 仅替换 spec.md，不动 plan.md（quick 无 plan，升级后让用户自己 plan）
- [ ] NFR-2: 不改变 task ID（向后兼容）

## 3. 范围界定

### 包含
- 修改 `src/commands/check.ts` 的 upgrade 分支
- 调用 `renderStandardSpec()` 函数生成标准 spec 模板
- 保留原 title、FR 需求摘要作为上下文

### 不包含
- 自动生成 plan（plan 仍由用户通过 `docpath plan` 生成）
- 修改 task ID 格式
- 修改 state machine 的状态转移逻辑

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec 替换策略 | 覆盖 / 追加 / 仅替换 > 行 | 替换整个 spec.md | quick spec 无实质内容可保留，直接换 standard 模板更干净 |
| 2 | 是否保留原 title | 保留 / 不保留 | 保留 | 上下文连续性，方便 Agent 理解 |
| 3 | spec 生成位置 | check.ts 内联 / 抽函数 | 抽 `renderStandardSpec()` | 便于测试和复用 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现

## 5. 验收标准

- [ ] AC-1: quick 任务升级为 standard 后，spec.md 包含 workflow_profile: standard 头部
- [ ] AC-2: spec.md 包含完整的 standard 章节（背景、需求、范围界定、关键决策、重大变更门禁、验收标准）
- [ ] AC-3: 原 task title 保留在 spec 中
- [ ] AC-4: 现有 test 全部通过
