---
kind: design-preview
status: draft
version: 1
required_sections:
  - 布局与栅格
  - 尺寸规格
  - 间距标度
  - 图标系统
  - 颜色与 Tokens
  - 动效规格
  - 交互逻辑
  - 技术约束
concrete_value_rule: >
  每个维度必须落到可实现的具体值（px / rem / hex / ms / 缓动曲线 / 具体组件名），
  不接受「方向」占位（例如「色彩偏冷」「间距适中」）。方向描述属于 ui-brief.md。
---

# Design Preview — 设计稿

> 用途：在写产品 UI 代码前，把 ui-brief.md 的「方向」冻结成「精确值」。
> 这是一份能直接交给前端实现的设计稿：布局、尺寸、间距、图标、颜色、动效、
> 交互、技术约束全部写成具体值。审批以本文件为准（design-approval.md）。
> 方向/北极星/用户目标留在 ui-brief.md，本文件不重复，只做精确冻结。

## UI 效果图预览

![DocPath Dashboard Dark Glassmorphic Theme Mockup](/Users/mac/.gemini/antigravity-ide/brain/1dbdb200-858e-4963-9dc9-0c3ca9009f42/docpath_dashboard_design_1782054504905.png)

## 1. 布局与栅格

- 栅格：12 列，column-gap 24px，max-width 1440px
- 断点：mobile < 640px / tablet 640px-1024px / desktop > 1024px
- 区域划分：Sidebar 固定宽 260px，Header 固定高 64px，主内容区域自适应占据剩余宽度
- 各断点布局：desktop 下为 Sidebar + Main Content（含工作板 3 列卡片）；tablet 下 Sidebar 收缩为 icon-only 宽 72px；mobile 下 Sidebar 转为底部导航条，Main Content 垂直单列铺满

## 2. 尺寸规格

| 元素 | 宽 | 高 | 说明 |
|---|---|---|---|
| Header | 100% | 64px | 顶部通栏，底部描边 1px |
| Sidebar | 260px | 100vh | 侧边栏，右侧描边 1px |
| Button (Primary) | auto | 36px | 最小宽 80px，padding-inline 16px |
| Step Card | 340px | auto | min-height 120px |
| Execution Console | 100% | 200px | 底部面板，带 12px padding |

## 3. 间距标度

- 标度（base 4px）：4px / 8px / 12px / 16px / 24px / 32px / 48px
- token 映射：space-1=4px, space-2=8px, space-3=12px, space-4=16px, space-6=24px, space-8=32px
- 应用约定：卡片内边距 16px (space-4)；步骤面板间距 24px (space-6)；表单行距 12px (space-3)；全局页面外边距 32px (space-8)

## 4. 图标系统

- 图标库: lucide-react (v0.450.0)
- 默认尺寸: 18px，描边宽度 1.75px
- 语义映射: 概览=Home, 工作台=KanbanSquare, 工作树=GitFork, 需求池=ClipboardList, 设置=Settings, 运行=Play, 停止=Square, 完成=CheckCircle
- 用色规则: 次要图标继承文本浅色 (rgba(255,255,255,0.45))，激活态图标使用 `--primary` 靛蓝色，状态警告图标使用对应 `--warning` 或 `--error` 色

## 5. 颜色与 Tokens

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| --bg | #F9FAFB | #090D16 | 页面背景 |
| --surface | #FFFFFF | #121826 | 卡片 / 悬浮面板 |
| --text | #111827 | #F3F4F6 | 主文本色 |
| --text-muted | #4B5563 | #9CA3AF | 次要描述文本色 |
| --primary | #4F46E5 | #5F55F2 | 主操作 / 激活状态 |
| --success | #10B981 | #10B981 | 运行通过 / 成功状态 |
| --warning | #F59E0B | #F59E0B | 异常警告 / 步骤阻塞 |
| --error | #EF4444 | #EF4444 | 任务报错 / 断点挂起 |
| --border | #E5E7EB | #223049 | 分隔线 / 边框描边 |

## 6. 动效规格

- 时长标度：fast 120ms / base 200ms / slow 300ms
- 缓动：进入 cubic-bezier(0.4, 0, 0.2, 1) / 退出 cubic-bezier(0.4, 0, 1, 1) / 交互过渡 linear
- 应用：Hover 过渡 120ms；Console 弹窗抽屉 200ms 垂直位移；Kanban 卡片拖拽与排序 200ms 缓动过渡
- 降级：当监测到 prefers-reduced-motion 时，关闭一切平移位移动画，只保留 80ms 的 opacity 渐变

## 7. 交互逻辑

- 主操作流程：点击 [ ⏹ 标记完成 ] -> 按钮显示 Spinner 且进入 disabled 状态 -> 执行 done 指令 -> toast 成功通知并触发 S3 开始执行。
- 关键状态矩阵：Console 终端加载中展示闪烁动画 (pulse)；按钮 disabled 态不透明度设为 40% (cursor-not-allowed)；空态展示 Kanban 空列占位，边框为虚线 (border-dashed)。
- 键盘与焦点：支持 Tab 键序循环焦点，Tab-index 覆盖导航与卡片按钮；Esc 键全局关闭 Console 日志面板；聚焦环为 2px outline-offset-2 `--primary`。
- 确认点：点击「⚡️ 强行中断」工作树 Session 时，必须展示二次确认 Modal。

## 8. 技术约束

- 绑定技术栈：参考 frontend-stack.md 中选定的 React 19 + Tailwind CSS v4。使用 CSS 变量（如 `var(--primary)`）绑定 Tokens 到 tailwind.config。
- 性能预算：首屏包大小小于 120KB (gzip)；首屏 FCP 限制在 0.8s 内；动画过渡全程保持在 60fps。
- 可访问性：主文本与背景对比度保持在 5.5:1 以上；所有图标按钮显式添加 `aria-label`。
- 浏览器/设备支持：Chrome/Firefox/Safari 最近两代稳定版；移动端最低支持 360px 视口。
- 实现风险与取舍：Vite 打包需要使用代码拆分 (code splitting) 以确保单个 chunk 大小不超预算。
