# Plan: 为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance

## 背景
当前 UI/UX 任务即使完成 analysis/spec/plan，仍可能因缺少可视化意图、HTML snapshot、视觉验收清单和实现前确认门禁，导致 Agent/Codex 直接进入编码并产出不符合偏好的 UI。本任务在 DocPath 流程中加入轻量但强约束的 Design Preview Gate。

## 子任务

### S1: 梳理现有 UI/UX 流程触点与门禁契约
- [x] S1: 梳理现有 UI/UX 流程触点与门禁契约
- **描述**: 检查 analyze/plan/go/review/check/runtime 等命令，确定应在哪些提示与检查中注入 UI/UX 任务的设计预览要求；定义 MVP 契约：识别 UI/UX 任务、要求 Design Preview、Visual Acceptance、HTML snapshot、移动端可读可导航标准。
- **验收条件**: 明确修改点与契约边界，避免破坏非 UI/UX 任务和已有工作流。
- **依赖**: 无

### S2: 在分析/计划/执行提示中加入 Design Preview Gate
- [x] S2: 在分析/计划/执行提示中加入 Design Preview Gate
- **描述**: 修改 analyze/plan/go 相关提示，UI/UX 任务必须在编码前产出或引用 Design Preview：页面结构、布局草图/HTML snapshot、关键视觉约束、交互状态、MVP/Later/Never 边界；执行提示必须提醒未完成预览不得直接编码。
- **验收条件**: 新生成的 UI/UX 任务提示明确包含设计预览门禁；非 UI/UX 任务不被强制增加无关负担。
- **依赖**: S1

### S3: 在评审/检查中加入 Visual Acceptance 验收
- [x] S3: 在评审/检查中加入 Visual Acceptance 验收
- **描述**: 修改 review/check 相关逻辑或提示，要求 UI/UX 任务在 review/check 阶段验证 Visual Acceptance，包括 HTML snapshot 是否存在、是否覆盖 P0 页面、移动端可读可导航、视觉偏好/反偏好是否有证据。
- **验收条件**: review/check 输出能暴露“只实现代码但没有视觉验收证据”的问题。
- **依赖**: S2

### S4: 构建验证并完成 DocPath 归档
- [x] S4: 构建验证并完成 DocPath 归档
- **描述**: 运行 TypeScript 构建/测试/CLI smoke test，确认 dist 更新，执行 docpath check/review/journal/done 或等价收尾。
- **验收条件**: pnpm build 通过；相关 CLI 可运行；任务状态可进入完成或明确下一步。
- **依赖**: S3

## 依赖关系图
S1 → S2 → S3 → S4
