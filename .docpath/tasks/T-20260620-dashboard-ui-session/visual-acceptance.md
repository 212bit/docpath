# Visual Acceptance

> Purpose: define the visual acceptance criteria for the new dashboard UI control and session management features.

## 必须满足

- **操作按钮显隐与状态**:
  - 在 Workboard 页面，每个步骤的右侧有操作按钮。未启动的步骤（marker 为空）显示 Claim 按钮；正在执行的步骤（isCurrent 为 true）显示 Done、Block 和 Skip 三个按钮。
  - 在 Worktrees 页面，对每个 Active Session 显示 Terminate 按钮；对每个 Lease Lock 显示 Release 按钮。
- **命令行执行弹窗 Modal**:
  - 点击上述任何按钮时，立即弹出居中定位的 Command Execution Modal。
  - 弹窗背景有暗色半透明 Backdrop 遮罩，弹窗采用等宽字体（monospace）呈现实时流式日志（stdout 和 stderr）。
  - 日志追加时滚动条自动锚定并平滑滚动到最下方。
  - 弹窗展示当前正在执行的具体命令行（如 `docpath go --step S2` 或 API 操作）。
  - 弹窗显示当前的执行状态：执行中（Running...）、执行成功（Success）、执行失败（Failed, exit code: X）。
- **交互关闭响应**:
  - 执行结束后，显示 Close 按钮。用户可通过点击 Close 按钮、点击 Backdrop 遮罩、或按下键盘 ESC 键关闭 Modal。
  - 弹窗关闭后，页面自动重新拉取 API 数据以刷新显示最新状态。

## 不得出现

- **不可误触发或无响应**:
  - 点击已执行过的步骤（已经 Done/Skip）右侧不得出现控制按钮，防止二次操作。
  - 模态框未执行完毕前，不得响应 Backdrop 点击或 ESC 键关闭（防止中断日志读取），且 Close 按钮应为隐藏或禁用态。
- **样式错位与布局抖动**:
  - 弹窗出现和日志追加时，页面其他背景组件不得发生滚动条跳跃或 Layout Shift。
  - 操作按钮在窄屏下不得发生溢出、折行或重叠，必须优雅换行堆叠。
- **破坏性操作缺乏视觉警示**:
  - 终止 session 和释放 lease 等破坏性操作的按钮不得使用普通文本色或 primary 蓝色，必须采用高亮红色（`.btn.danger`）作为明确的安全警告。

## Review 方式

- **单元测试与编译**:
  - 运行 `pnpm typecheck` 确认 TypeScript 类型无报错。
  - 运行 `pnpm run build:dashboard` 确认静态资源构建成功，无路径引入错误。
- **功能流体验证**:
  - 本地启动 dashboard 后，在浏览器中点击 Claim 和 Done 按钮，确认 Modal 能正常弹出并完整展示 CLI 流式输出日志。
  - 在 Worktrees 页面点击 Terminate 和 Release 按钮，确认能正常调用删除接口并刷新列表。

## Snapshot / Screenshot 要求

- **HTML Snapshot**:
  - 在开发测试阶段，可以使用 Playwright 或 JS DOM 保存 Modal 弹窗激活时的 HTML 结构快照，存入测试归档。
- **Screenshot**:
  - UI 验收通过时，需捕获两张截图：
    1. Workboard 视图下步骤右侧操作按钮正常渲染的截图；
    2. Command Execution Modal 处于 "Running" 或 "Success" 状态、包含 CLI 命令行和 stdout 文本的截图。
  - 截图保存到任务对应的 artifacts 目录中，并在 walkthrough 中引用。
