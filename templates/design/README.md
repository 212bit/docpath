# UI/UX Design Evidence Templates

DocPath UI/UX 任务使用一组可检查的设计证据，目标是在产品 UI 实现前冻结具体视觉方向，并在实现后保留视觉验收依据。

## Required Sequence

```text
Framework Decision
→ UI Prompt Brief
→ External Design Handoff
→ Design Preview
→ Design Approval
→ Implementation
→ Visual Acceptance
```

`Framework Decision` 是序列首步、go 前置硬门禁：先冻结前端技术栈（JS 框架 / CSS 方案 / 组件库，或显式选定纯静态），并强制写出 ≥1 个被否决备选及理由，再进入视觉设计。目的是让视觉稿有明确技术落点，并逼出「为什么不选别的」的讨论。

## Templates

- `frontend-stack.md`: 冻结选定栈（JS 框架 / CSS 方案 / 组件库或纯静态）、≥1 个被否决备选及理由、实现约束、以及选定栈对应的待加载 skill 提示。
- `ui-prompt-brief.md`: 定义 Product Context、Design North Star、Visual Direction、Anti-goals、Design Tokens、Shared Components、Page Matrix 和 P0 Page Brief。这里写「方向」，不写精确值。
- `external-design-handoff.md`: 记录 Stitch、Figma、v0、Framer 或等价外部设计工具的 prompt、输出链接/快照、选定方向、拒绝方向和实现约束。
- `design-preview.md`: 把 brief 的方向**冻结成可实现的设计稿**，覆盖 8 个维度——布局与栅格、尺寸规格、间距标度、图标系统、颜色与 Tokens、动效规格、交互逻辑、技术约束，每个维度填**具体值**（px / rem / hex / ms / 缓动曲线 / 图标库），不接受「偏冷的蓝」「间距适中」这类方向占位。审批以本文件为准。
- `design-approval.md`: 记录具体设计方案的 `pending`、`approved` 或 `rejected` 状态，以及批准来源、批准时间、批准说明和禁止方向。

## Approval Rule

用户同意采用 UI/UX 证据流程，不等于批准具体视觉方案。实现产品 UI 前必须满足：

- `frontend-stack.md` 已落盘，含非占位的选定栈（JS 框架或显式纯静态）、≥1 个带理由的被否决备选。
- `ui-brief.md` 已落盘。
- `external-design-handoff.md` 已落盘，并说明外部工具或等价设计输入输出。
- `design-preview.md` 已落盘，且 8 个维度（布局/尺寸/间距/图标/颜色/动效/交互/技术约束）齐全并填具体值（go 与 check 共用 `missingDesignPreviewDepth` 硬校验，方向占位不放行）。
- `design-approval.md` 已落盘，且 frontmatter 中 `approval.state: approved`。
- `visual-acceptance.md` 已落盘，作为实现后的验收矩阵。

如果 approval 仍是 `pending` 或 `rejected`，agent 必须停止实现并请求用户审批或修改具体设计方向。

## Rollback

若某个设计方向被拒绝，不要覆盖历史证据。保留旧的 handoff/approval 记录，在 `design-approval.md` 写明 rejected 原因，再基于新的 brief 或 handoff 重新提交设计方案。
